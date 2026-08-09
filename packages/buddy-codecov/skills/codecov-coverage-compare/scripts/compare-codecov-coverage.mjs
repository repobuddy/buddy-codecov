import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

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

function argument(name) {
	const index = process.argv.indexOf(name)
	return index === -1 ? undefined : process.argv[index + 1]
}

function repository() {
	const explicit = argument('--repo')
	if (explicit) {
		const [owner, name] = explicit.split('/')
		if (owner && name) return { owner, name }
		throw new Error('--repo must be <owner>/<name>.')
	}
	return parseRepository(execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim())
}

function baseSha() {
	const explicit = argument('--base')
	if (explicit) return explicit
	const baseRef =
		argument('--base-ref') ??
		execFileSync('git', ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], { encoding: 'utf8' }).trim()
	return execFileSync('git', ['merge-base', 'HEAD', baseRef], { encoding: 'utf8' }).trim()
}

function localCoverage() {
	const reports = process.argv.flatMap((value, index) => (value === '--report' ? [process.argv[index + 1]] : []))
	const defaultReports = [
		'coverage/lcov.info',
		'packages/args-minus/coverage/lcov.info',
		'packages/clibuilder/coverage/lcov.info',
	]
	const paths = (reports.length === 0 ? defaultReports : reports).filter((path) => path && existsSync(path))
	if (paths.length === 0) throw new Error('No LCOV reports found. Pass --report <path> after running coverage.')
	return parseLcov(paths.map((path) => readFileSync(path, 'utf8')).join('\n'))
}

async function codecovCoverage(repo, sha) {
	const url = new URL(`https://api.codecov.io/api/v2/github/${repo.owner}/repos/${repo.name}/totals/`)
	url.searchParams.set('sha', sha)
	const token = process.env.CODECOV_API_TOKEN
	const response = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : undefined })
	if (!response.ok)
		throw new Error(`Codecov API request failed (${response.status}). Set CODECOV_API_TOKEN if required.`)
	const body = await response.json()
	if (!body.totals || typeof body.totals.coverage !== 'number')
		throw new Error(`Codecov has no coverage totals for ${sha}.`)
	return body.totals
}

export async function main() {
	if (!process.env.CODECOV_API_TOKEN)
		process.stderr.write('Warning: CODECOV_API_TOKEN is not set; attempting unauthenticated Codecov API access.\n')
	const sha = baseSha()
	const [local, base] = await Promise.all([localCoverage(), codecovCoverage(repository(), sha)])
	const delta = local.coverage - base.coverage
	const result = { baseSha: sha, base, local, delta, passed: delta >= 0 }
	if (argument('--format') === 'json') process.stdout.write(`${JSON.stringify(result)}\n`)
	else
		process.stdout.write(
			`Base: ${base.coverage.toFixed(2)}%\nLocal: ${local.coverage.toFixed(2)}%\nDelta: ${delta.toFixed(2)}%\n`,
		)
	if (!result.passed) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch((error) => {
		process.stderr.write(`${error.message}\n`)
		process.exitCode = 1
	})
}
