import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const DEFAULT_REPORTS = ['coverage/lcov.info']

export interface CoverageTotals {
	coverage: number
	hits: number
	lines: number
}

interface Repository {
	name: string
	owner: string
}

interface CodecovTotals {
	coverage: number
}

interface CodecovResponse {
	detail?: string
	totals?: CodecovTotals
}

interface FetchResponse {
	json(): Promise<unknown>
	ok: boolean
	status: number
}

type FetchImplementation = (url: URL, options: RequestInit) => Promise<FetchResponse>

export interface CoverageComparison {
	base: CodecovTotals
	baseSha: string
	delta: number
	local: CoverageTotals
	passed: boolean
	repository: string
}

export interface CompareCoverageOptions {
	base?: string | undefined
	baseRef?: string | undefined
	fetchImpl?: FetchImplementation | undefined
	repo?: string | undefined
	reports?: string[] | undefined
	token?: string | undefined
}

export function parseLcov(lcov: string): CoverageTotals {
	const lines = new Map<string, number>()
	let sourceFile: string | undefined
	for (const entry of lcov.split(/\r?\n/)) {
		if (entry.startsWith('SF:')) {
			sourceFile = entry.slice(3)
			continue
		}
		if (!sourceFile || !entry.startsWith('DA:')) continue
		const [line, hits] = entry.slice(3).split(',')
		if (!line || hits === undefined) continue
		const key = `${sourceFile}:${line}`
		lines.set(key, Math.max(lines.get(key) ?? 0, Number(hits)))
	}
	const values = [...lines.values()]
	const hits = values.filter((value) => value > 0).length
	return { lines: values.length, hits, coverage: values.length === 0 ? 100 : (hits / values.length) * 100 }
}

export function parseRepository(remoteUrl: string): Repository {
	const match = remoteUrl.match(/(?:github\.com[:/])([^/]+)\/([^/]+?)(?:\.git)?$/)
	if (!match?.[1] || !match[2]) throw new Error('Could not derive a GitHub repository. Pass --repo <owner>/<name>.')
	return { owner: match[1], name: match[2] }
}

export function parseRepositoryName(value: string): Repository {
	const [owner, name, extra] = value.split('/')
	if (!owner || !name || extra) throw new Error('--repo must be <owner>/<name>.')
	return { owner, name }
}

function readCoverage(reports: string[]): CoverageTotals {
	const paths = reports.filter((path) => existsSync(path))
	if (paths.length === 0) throw new Error('No LCOV reports found. Pass --report <path> after running coverage.')
	return parseLcov(paths.map((path) => readFileSync(path, 'utf8')).join('\n'))
}

function git(args: string[]): string {
	return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
}

function defaultRepository(): Repository {
	return parseRepository(git(['remote', 'get-url', 'origin']))
}

function defaultBaseSha(baseRef: string | undefined): string {
	let ref = baseRef
	if (!ref) {
		try {
			ref = git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])
		} catch {
			const remoteBranches = git(['for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin'])
			ref = remoteBranches.split('\n').find((branch) => branch === 'origin/main' || branch === 'origin/master')
		}
	}
	if (!ref) throw new Error('Could not determine the default branch. Pass --base or --base-ref.')
	return git(['merge-base', 'HEAD', ref])
}

function isCodecovResponse(value: unknown): value is CodecovResponse {
	return typeof value === 'object' && value !== null
}

function hasCodecovCoverage(value: CodecovResponse): value is { totals: CodecovTotals } {
	return typeof value.totals?.coverage === 'number'
}

async function fetchCodecovCoverage(
	repository: Repository,
	sha: string,
	token: string | undefined,
	fetchImpl: FetchImplementation,
): Promise<CodecovTotals> {
	const url = new URL(`https://api.codecov.io/api/v2/github/${repository.owner}/repos/${repository.name}/totals/`)
	url.searchParams.set('sha', sha)
	const options = token ? { headers: { Authorization: `Bearer ${token}` } } : {}
	const response = await fetchImpl(url, options)
	if (!response.ok) {
		const body = await response.json().catch(() => undefined)
		if (
			response.status === 404 &&
			isCodecovResponse(body) &&
			typeof body.detail === 'string' &&
			body.detail.includes('not in our records')
		) {
			throw new Error(
				`Codecov has no coverage record for ${repository.owner}/${repository.name}@${sha}. Upload coverage for that commit before comparing.`,
			)
		}
		throw new Error(`Codecov API request failed (${response.status}). Set CODECOV_API_TOKEN if required.`)
	}
	const body = await response.json()
	if (!isCodecovResponse(body) || !hasCodecovCoverage(body))
		throw new Error(`Codecov has no coverage totals for ${sha}.`)
	return body.totals
}

export async function compareCoverage({
	base,
	baseRef,
	repo,
	reports = DEFAULT_REPORTS,
	token,
	fetchImpl = fetch,
}: CompareCoverageOptions): Promise<CoverageComparison> {
	const repository = repo ? parseRepositoryName(repo) : defaultRepository()
	const baseSha = base ?? defaultBaseSha(baseRef)
	const local = readCoverage(reports)
	const baseCoverage = await fetchCodecovCoverage(repository, baseSha, token, fetchImpl)
	const delta = local.coverage - baseCoverage.coverage
	return {
		repository: `${repository.owner}/${repository.name}`,
		baseSha,
		base: baseCoverage,
		local,
		delta,
		passed: delta >= 0,
	}
}
