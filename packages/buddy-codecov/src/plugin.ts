import { encode } from '@toon-format/toon'
import type { cli } from 'clibuilder'
import { command, t } from 'clibuilder'
import { compareCoverage } from './coverage-compare.ts'

function write(value: object, format: 'json' | 'toon' | undefined): void {
	process.stdout.write(`${format === 'json' ? JSON.stringify(value) : encode(value)}\n`)
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : 'Coverage comparison failed.'
}

export const compareCommand: cli.Command = command({
	name: 'compare',
	description: 'Compare local LCOV coverage with Codecov coverage at a base commit.',
	options: {
		base: {
			description: 'Base commit SHA. Defaults to the merge-base with the default branch.',
			type: t.string().optional(),
		},
		'base-ref': { description: 'Base branch reference when --base is omitted.', type: t.string().optional() },
		repo: { description: 'GitHub repository as <owner>/<name>. Defaults to origin.', type: t.string().optional() },
		report: { description: 'LCOV report path. Defaults to coverage/lcov.info.', type: t.string().optional() },
		format: {
			description: 'Output format: toon (default) or json.',
			type: t.enum(['toon', 'json']).optional(),
			default: 'toon',
		},
	},
	async run(args) {
		try {
			const result = await compareCoverage({
				base: args.base,
				baseRef: args['base-ref'],
				repo: args.repo,
				reports: args.report ? [args.report] : undefined,
				token: process.env['CODECOV_API_TOKEN'],
			})
			write(result, args.format)
			if (!result.passed) process.exitCode = 1
		} catch (error) {
			write({ error: errorMessage(error), help: 'Run buddy-codecov compare --help for usage.' }, args.format)
			process.exitCode = 1
		}
	},
})

export const codecovCommand: cli.Command = command({
	name: 'codecov',
	description: 'Codecov coverage commands.',
	commands: [compareCommand],
})

export function activate({ addCommand }: { addCommand(command: typeof codecovCommand): void }): void {
	addCommand(codecovCommand)
}
