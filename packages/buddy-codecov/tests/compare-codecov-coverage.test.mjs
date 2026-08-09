import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { compareCoverage, parseLcov, parseRepository, parseRepositoryName } from '../src/coverage-compare.mjs'

test('parses line coverage', () => {
	assert.deepEqual(parseLcov('SF:src/a.ts\nDA:1,1\nDA:2,0\nend_of_record'), { lines: 2, hits: 1, coverage: 50 })
})

test('derives a repository from SSH and HTTPS remotes', () => {
	assert.deepEqual(parseRepository('git@github.com:repobuddy/buddy-codecov.git'), {
		owner: 'repobuddy',
		name: 'buddy-codecov',
	})
	assert.deepEqual(parseRepository('https://github.com/repobuddy/buddy-codecov.git'), {
		owner: 'repobuddy',
		name: 'buddy-codecov',
	})
})

test('accepts only owner and repository in an explicit repository name', () => {
	assert.deepEqual(parseRepositoryName('repobuddy/buddy-codecov'), { owner: 'repobuddy', name: 'buddy-codecov' })
	assert.throws(() => parseRepositoryName('repobuddy/buddy-codecov/extra'), /--repo must be/)
})

test('explains when Codecov has no coverage record for the requested commit', async () => {
	const report = join(mkdtempSync(join(tmpdir(), 'buddy-codecov-')), 'lcov.info')
	writeFileSync(report, 'SF:src/a.mjs\nDA:1,1\nend_of_record\n')

	await assert.rejects(
		compareCoverage({
			base: 'abc123',
			repo: 'repobuddy/buddy-codecov',
			reports: [report],
			fetchImpl: async () => ({
				ok: false,
				status: 404,
				json: async () => ({ detail: 'The commit abc123 is not in our records.' }),
			}),
		}),
		/has no coverage record.*Upload coverage/,
	)
})
