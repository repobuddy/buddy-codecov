import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { testCommand } from 'clibuilder/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { main } from './cli.ts'
import { compareCoverage, parseLcov, parseRepository, parseRepositoryName } from './coverage-compare.ts'
import * as publicApi from './index.ts'
import { activate, codecovCommand, compareCommand, createDefaultCommand } from './plugin.ts'

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }))

const mockedExecFileSync = vi.mocked(execFileSync)
const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

function report(contents = 'SF:src/a.ts\nDA:1,1\nend_of_record\n'): string {
	const path = join(mkdtempSync(join(tmpdir(), 'buddy-codecov-')), 'coverage', 'lcov.info')
	mkdirSync(dirname(path), { recursive: true })
	writeFileSync(path, contents)
	return path
}

function response(body: unknown, status = 200): { json(): Promise<unknown>; ok: boolean; status: number } {
	return { ok: status >= 200 && status < 300, status, json: async () => body }
}

beforeEach(() => {
	mockedExecFileSync.mockReset()
	stdout.mockClear()
	process.exitCode = undefined
	vi.unstubAllEnvs()
	vi.unstubAllGlobals()
})

afterEach(() => {
	vi.unstubAllEnvs()
	vi.unstubAllGlobals()
})

describe('coverage comparison', () => {
	it('parses distinct LCOV lines, duplicate records, and malformed entries', () => {
		expect(parseLcov('DA:1,1\nSF:a.ts\nDA:,1\nDA:1\nDA:1,0\nDA:2,3\nSF:b.ts\nDA:1,2')).toEqual({
			lines: 3,
			hits: 2,
			coverage: (2 / 3) * 100,
		})
	})

	it('reports 100 percent for an empty LCOV report', () => {
		expect(parseLcov('')).toEqual({ lines: 0, hits: 0, coverage: 100 })
	})

	it('derives repositories and rejects invalid names', () => {
		expect(parseRepository('git@github.com:repobuddy/buddy-codecov.git')).toEqual({
			owner: 'repobuddy',
			name: 'buddy-codecov',
		})
		expect(parseRepository('https://github.com/repobuddy/buddy-codecov.git')).toEqual({
			owner: 'repobuddy',
			name: 'buddy-codecov',
		})
		expect(() => parseRepository('https://example.com/project')).toThrow('Could not derive')
		expect(parseRepositoryName('repobuddy/buddy-codecov')).toEqual({ owner: 'repobuddy', name: 'buddy-codecov' })
		expect(() => parseRepositoryName('owner')).toThrow('--repo must be')
		expect(() => parseRepositoryName('/repository')).toThrow('--repo must be')
		expect(() => parseRepositoryName('owner/repository/extra')).toThrow('--repo must be')
	})

	it('compares local coverage, passes the Codecov token, and reports a regression', async () => {
		const fetchImpl = vi.fn(async () => response({ totals: { coverage: 100 } }))
		await expect(
			compareCoverage({
				base: 'abc123',
				repo: 'repobuddy/buddy-codecov',
				reports: [report('SF:a.ts\nDA:1,0\n')],
				token: 'secret',
				fetchImpl,
			}),
		).resolves.toMatchObject({ baseSha: 'abc123', delta: -100, passed: false, repository: 'repobuddy/buddy-codecov' })
		expect(fetchImpl).toHaveBeenCalledWith(expect.any(URL), { headers: { Authorization: 'Bearer secret' } })
	})

	it('uses the default fetch implementation without an authorization header', async () => {
		const fetchImpl = vi.fn(async () => response({ totals: { coverage: 100 } }))
		vi.stubGlobal('fetch', fetchImpl)
		await expect(
			compareCoverage({ base: 'abc123', repo: 'repobuddy/buddy-codecov', reports: [report()] }),
		).resolves.toMatchObject({ passed: true })
		expect(fetchImpl).toHaveBeenCalledWith(expect.any(URL), {})
	})

	it('resolves the default repository and origin HEAD base', async () => {
		mockedExecFileSync.mockReturnValueOnce('git@github.com:repobuddy/buddy-codecov.git')
		mockedExecFileSync.mockReturnValueOnce('origin/main')
		mockedExecFileSync.mockReturnValueOnce('abc123')
		await expect(
			compareCoverage({ reports: [report()], fetchImpl: async () => response({ totals: { coverage: 100 } }) }),
		).resolves.toMatchObject({ baseSha: 'abc123', repository: 'repobuddy/buddy-codecov' })
	})

	it('uses an explicit base reference', async () => {
		mockedExecFileSync.mockReturnValueOnce('abc123')
		await expect(
			compareCoverage({
				baseRef: 'origin/release',
				repo: 'repobuddy/buddy-codecov',
				reports: [report()],
				fetchImpl: async () => response({ totals: { coverage: 100 } }),
			}),
		).resolves.toMatchObject({ baseSha: 'abc123' })
	})

	it('falls back to origin/master when origin HEAD cannot be read', async () => {
		mockedExecFileSync.mockReturnValueOnce('git@github.com:repobuddy/buddy-codecov.git')
		mockedExecFileSync.mockImplementationOnce(() => {
			throw new Error('no origin HEAD')
		})
		mockedExecFileSync.mockReturnValueOnce('origin/feature\norigin/master')
		mockedExecFileSync.mockReturnValueOnce('abc123')
		await expect(
			compareCoverage({ reports: [report()], fetchImpl: async () => response({ totals: { coverage: 100 } }) }),
		).resolves.toMatchObject({ baseSha: 'abc123' })
	})

	it('requires a default branch when neither origin/main nor origin/master exists', async () => {
		mockedExecFileSync.mockReturnValueOnce('git@github.com:repobuddy/buddy-codecov.git')
		mockedExecFileSync.mockImplementationOnce(() => {
			throw new Error('no origin HEAD')
		})
		mockedExecFileSync.mockReturnValueOnce('origin/feature')
		await expect(compareCoverage({ reports: [report()] })).rejects.toThrow('Could not determine the default branch')
	})

	it('explains missing reports and Codecov API failures', async () => {
		await expect(compareCoverage({ base: 'abc123', repo: 'repobuddy/buddy-codecov', reports: [] })).rejects.toThrow(
			'No LCOV reports found',
		)
		await expect(
			compareCoverage({
				base: 'abc123',
				repo: 'repobuddy/buddy-codecov',
				reports: [report()],
				fetchImpl: async () => response({ detail: 'The commit abc123 is not in our records.' }, 404),
			}),
		).rejects.toThrow(/has no coverage record.*Upload coverage/)
		await expect(
			compareCoverage({
				base: 'abc123',
				repo: 'repobuddy/buddy-codecov',
				reports: [report()],
				fetchImpl: async () => response({}, 500),
			}),
		).rejects.toThrow('Codecov API request failed (500)')
		await expect(
			compareCoverage({
				base: 'abc123',
				repo: 'repobuddy/buddy-codecov',
				reports: [report()],
				fetchImpl: async () => ({
					ok: false,
					status: 404,
					json: async () => Promise.reject(new Error('invalid JSON')),
				}),
			}),
		).rejects.toThrow('Codecov API request failed (404)')
	})

	it('rejects malformed successful Codecov responses', async () => {
		await expect(
			compareCoverage({
				base: 'abc123',
				repo: 'repobuddy/buddy-codecov',
				reports: [report()],
				fetchImpl: async () => response({ totals: {} }),
			}),
		).rejects.toThrow('Codecov has no coverage totals')
	})
})

describe('plugin command', () => {
	it('answers a passing comparison in TOON and registers it under codecov', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => response({ totals: { coverage: 50 } })),
		)
		const addCommand = vi.fn()
		activate({ addCommand })
		const { messages, exitCode } = await testCommand(
			compareCommand,
			`compare --base abc123 --repo repobuddy/buddy-codecov --report ${report()}`,
		)
		expect(addCommand).toHaveBeenCalledWith(codecovCommand)
		expect(codecovCommand.commands).toEqual([compareCommand])
		expect(messages).toContain('status: passed')
		expect(messages).not.toContain('help')
		expect(exitCode).toBeUndefined()
		expect(process.exitCode).toBeUndefined()
	})

	it('answers JSON through the global --format option', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => response({ totals: { coverage: 50 } })),
		)
		const { messages } = await testCommand(
			compareCommand,
			`compare --base abc123 --repo repobuddy/buddy-codecov --report ${report()} --format json`,
		)
		expect(JSON.parse(messages)).toMatchObject({ passed: true, baseSha: 'abc123' })
	})

	it('reports a non-Error network failure', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => Promise.reject('unavailable')),
		)
		const { messages } = await testCommand(
			compareCommand,
			`compare --base abc123 --repo repobuddy/buddy-codecov --report ${report()}`,
		)
		expect(messages).toContain('Could not reach Codecov: request failed.')
	})

	it('has examples on the command', () => {
		expect(compareCommand.examples?.length).toBeGreaterThan(0)
		expect(createDefaultCommand().examples?.length).toBeGreaterThan(0)
	})

	it('reports a coded error with a help line when the comparison cannot finish', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => response({ detail: 'The commit abc123 is not in our records.' }, 404)),
		)
		const { messages, exitCode } = await testCommand(
			compareCommand,
			`compare --base abc123 --repo repobuddy/buddy-codecov --report ${report()}`,
		)
		expect(messages).toContain('code: no-base-record')
		expect(messages).toContain('help')
		expect(exitCode).toBe(1)
	})

	it('reports a missing report with its code', async () => {
		const { messages, exitCode } = await testCommand(
			compareCommand,
			'compare --base abc123 --repo repobuddy/buddy-codecov --report /nonexistent/lcov.info',
		)
		expect(messages).toContain('code: no-report')
		expect(exitCode).toBe(1)
	})

	it('reports an invalid repository as a coded error', async () => {
		const { messages, exitCode } = await testCommand(
			compareCommand,
			`compare --base abc123 --repo nope --report ${report()}`,
		)
		expect(messages).toContain('code: invalid-repo')
		expect(exitCode).toBe(1)
	})

	it('rejects the removed command-level format values as usage errors', async () => {
		const { messages, exitCode } = await testCommand(compareCommand, 'compare --format yaml')
		expect(messages).toContain('code: invalid-value')
		expect(exitCode).toBe(2)
	})

	it('uses the default report', async () => {
		const fixture = report('SF:a.ts\nDA:1,1\n')
		const originalDirectory = process.cwd()
		process.chdir(dirname(dirname(fixture)))
		try {
			vi.stubGlobal(
				'fetch',
				vi.fn(async () => Promise.reject(new Error('Codecov unavailable'))),
			)
			const { messages, exitCode } = await testCommand(
				compareCommand,
				'compare --base abc123 --repo repobuddy/buddy-codecov',
			)
			expect(messages).toContain('Codecov unavailable')
			expect(messages).toContain('code: codecov-unreachable')
			expect(exitCode).toBe(1)
		} finally {
			process.chdir(originalDirectory)
		}
	})

	it('sets a failed exit code and a help line for a coverage regression', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => response({ totals: { coverage: 100 } })),
		)
		const { messages } = await testCommand(
			compareCommand,
			`compare --base abc123 --repo repobuddy/buddy-codecov --report ${report('SF:a.ts\nDA:1,0\n')}`,
		)
		expect(messages).toContain('status: regressed')
		expect(messages).toContain('help')
		expect(process.exitCode).toBe(1)
	})

	it('states an empty report definitively instead of passing silently', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => response({ totals: { coverage: 100 } })),
		)
		const { messages, exitCode } = await testCommand(
			compareCommand,
			`compare --base abc123 --repo repobuddy/buddy-codecov --report ${report('')}`,
		)
		expect(messages).toContain('empty: 0 instrumented lines found in the report')
		expect(exitCode).toBeUndefined()
	})

	it('lists the compare command when the codecov group is run bare', async () => {
		const { messages, exitCode } = await testCommand(codecovCommand, 'codecov')
		expect(messages).toContain('code: missing-command')
		expect(messages).toContain('compare')
		expect(exitCode).toBe(2)
	})
})

describe('CLI and public entry point', () => {
	it('re-exports the plugin API', () => {
		expect(publicApi.activate).toBe(activate)
		expect(publicApi.compareCommand).toBe(compareCommand)
	})

	it('shows live data with a home header when run bare', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => response({ totals: { coverage: 50 } })),
		)
		const { messages } = await testCommand(
			createDefaultCommand(),
			`--base abc123 --repo repobuddy/buddy-codecov --report ${report()}`,
		)
		expect(messages).toMatch(/^bin: /)
		expect(messages).toContain('description: Compare local LCOV coverage')
		expect(messages).toContain('status: passed')
	})

	it('parses a CLI invocation, reporting errors itself', async () => {
		const argv = process.argv
		process.argv = ['node', 'buddy-codecov', '--version']
		try {
			await main()
		} finally {
			process.argv = argv
		}
		expect(stdout).toHaveBeenCalledWith(expect.stringContaining('0.0.0'))
	})
})
