import assert from 'node:assert/strict'
import test from 'node:test'
import { parseLcov, parseRepository } from '../skills/codecov-coverage-compare/scripts/compare-codecov-coverage.mjs'

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
