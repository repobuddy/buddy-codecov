import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { CliError } from 'clibuilder'

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
	if (!match?.[1] || !match[2])
		throw new CliError('Could not derive a GitHub repository. Pass --repo <owner>/<name>.', {
			code: 'no-repository',
			help: 'Pass --repo <owner>/<name>, or run from a clone whose origin is on GitHub.',
		})
	return { owner: match[1], name: match[2] }
}

export function parseRepositoryName(value: string): Repository {
	const [owner, name, extra] = value.split('/')
	if (!owner || !name || extra)
		throw new CliError('--repo must be <owner>/<name>.', {
			code: 'invalid-repo',
			details: { value },
			help: 'Pass --repo repobuddy/buddy-codecov, as <owner>/<name>.',
		})
	return { owner, name }
}

function readCoverage(reports: string[]): CoverageTotals {
	const paths = reports.filter((path) => existsSync(path))
	if (paths.length === 0)
		throw new CliError('No LCOV reports found. Pass --report <path> after running coverage.', {
			code: 'no-report',
			details: { searched: reports.join(', ') },
			help: 'Run the coverage command to write coverage/lcov.info, or pass --report <path>.',
		})
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
	if (!ref)
		throw new CliError('Could not determine the default branch. Pass --base or --base-ref.', {
			code: 'no-default-branch',
			help: 'Pass --base <sha> or --base-ref <ref>.',
		})
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
	let response: FetchResponse
	try {
		response = await fetchImpl(url, options)
	} catch (error) {
		throw new CliError(`Could not reach Codecov: ${error instanceof Error ? error.message : 'request failed'}.`, {
			code: 'codecov-unreachable',
			help: 'Check the network connection, then retry.',
		})
	}
	if (!response.ok) {
		const body = await response.json().catch(() => undefined)
		if (
			response.status === 404 &&
			isCodecovResponse(body) &&
			typeof body.detail === 'string' &&
			body.detail.includes('not in our records')
		) {
			throw new CliError(
				`Codecov has no coverage record for ${repository.owner}/${repository.name}@${sha}. Upload coverage for that commit before comparing.`,
				{
					code: 'no-base-record',
					details: { sha },
					help: 'Upload coverage for that commit, or pass --base <sha> for one Codecov has.',
				},
			)
		}
		throw new CliError(`Codecov API request failed (${response.status}). Set CODECOV_API_TOKEN if required.`, {
			code: 'codecov-api-error',
			details: { status: response.status },
			help: 'Set CODECOV_API_TOKEN when Codecov requires authentication, then retry.',
		})
	}
	const body = await response.json()
	if (!isCodecovResponse(body) || !hasCodecovCoverage(body))
		throw new CliError(`Codecov has no coverage totals for ${sha}.`, {
			code: 'no-base-totals',
			details: { sha },
			help: 'Pass --base <sha> for a commit whose coverage Codecov has processed.',
		})
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
