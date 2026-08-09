import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const DEFAULT_REPORTS = ['coverage/lcov.info']

export function parseLcov(lcov) {
	const lines = new Map()
	let sourceFile
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

export function parseRepository(remoteUrl) {
	const match = remoteUrl.match(/(?:github\.com[:/])([^/]+)\/([^/]+?)(?:\.git)?$/)
	if (!match) throw new Error('Could not derive a GitHub repository. Pass --repo <owner>/<name>.')
	return { owner: match[1], name: match[2] }
}

export function parseRepositoryName(value) {
	const [owner, name, extra] = value.split('/')
	if (!owner || !name || extra) throw new Error('--repo must be <owner>/<name>.')
	return { owner, name }
}

function readCoverage(reports) {
	const paths = reports.filter((path) => existsSync(path))
	if (paths.length === 0) throw new Error('No LCOV reports found. Pass --report <path> after running coverage.')
	return parseLcov(paths.map((path) => readFileSync(path, 'utf8')).join('\n'))
}

function git(args) {
	return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
}

function defaultRepository() {
	return parseRepository(git(['remote', 'get-url', 'origin']))
}

function defaultBaseSha(baseRef) {
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

async function fetchCodecovCoverage(repository, sha, token, fetchImpl) {
	const url = new URL(`https://api.codecov.io/api/v2/github/${repository.owner}/repos/${repository.name}/totals/`)
	url.searchParams.set('sha', sha)
	const response = await fetchImpl(url, { headers: token ? { Authorization: `Bearer ${token}` } : undefined })
	if (!response.ok) {
		const body = await response.json().catch(() => undefined)
		if (response.status === 404 && typeof body?.detail === 'string' && body.detail.includes('not in our records')) {
			throw new Error(
				`Codecov has no coverage record for ${repository.owner}/${repository.name}@${sha}. Upload coverage for that commit before comparing.`,
			)
		}
		throw new Error(`Codecov API request failed (${response.status}). Set CODECOV_API_TOKEN if required.`)
	}
	const body = await response.json()
	if (!body.totals || typeof body.totals.coverage !== 'number')
		throw new Error(`Codecov has no coverage totals for ${sha}.`)
	return body.totals
}

export async function compareCoverage({ base, baseRef, repo, reports = DEFAULT_REPORTS, token, fetchImpl = fetch }) {
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
