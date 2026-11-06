import type { cli } from 'clibuilder'
import { command, empty, result, t } from 'clibuilder'
import { homeHeader } from 'clibuilder/axi'
import { type CoverageComparison, compareCoverage } from './coverage-compare.ts'

const description: string = 'Compare local LCOV coverage with Codecov coverage for AI agents.'

const options = {
	base: {
		description: 'Base commit SHA. Defaults to the merge-base with the default branch.',
		type: t.string().optional(),
	},
	'base-ref': { description: 'Base branch reference when --base is omitted.', type: t.string().optional() },
	repo: { description: 'GitHub repository as <owner>/<name>. Defaults to origin.', type: t.string().optional() },
	report: { description: 'LCOV report path. Defaults to coverage/lcov.info.', type: t.string().optional() },
}

const examples = [
	{ command: 'buddy-codecov compare', description: 'Compare coverage/lcov.info with the merge-base on Codecov' },
	{
		command: 'buddy-codecov compare --base-ref origin/release --report packages/a/coverage/lcov.info',
		description: 'Compare one package report with another base branch',
	},
]

type Args = Record<string, string | undefined>

function percent(value: number): string {
	return `${value.toFixed(2)}%`
}

async function compare(args: Args): Promise<CoverageComparison> {
	const comparison = await compareCoverage({
		base: args['base'],
		baseRef: args['base-ref'],
		repo: args['repo'],
		reports: args['report'] ? [args['report']] : undefined,
		token: process.env['CODECOV_API_TOKEN'],
	})
	return comparison
}

function answer(comparison: CoverageComparison, header: object = {}): unknown {
	if (comparison.local.lines === 0) {
		return empty('0 instrumented lines found in the report', {
			help: ['Check that the coverage run instruments source files, or pass --report <path>.'],
		})
	}
	if (!comparison.passed) process.exitCode = 1
	const delta = `${comparison.delta >= 0 ? '+' : ''}${comparison.delta.toFixed(2)}`
	return result(
		{
			...header,
			status: comparison.passed ? 'passed' : 'regressed',
			summary: `local ${percent(comparison.local.coverage)} vs base ${percent(comparison.base.coverage)} (${delta})`,
			...comparison,
		},
		{
			help: comparison.passed
				? undefined
				: ['Add tests for the uncovered lines, rerun coverage, then run `buddy-codecov compare` again.'],
		},
	)
}

export const compareCommand: cli.Command = command({
	name: 'compare',
	description: 'Compare local LCOV coverage with Codecov coverage at a base commit.',
	options,
	examples,
	async run(args) {
		return answer(await compare(args))
	},
})

export const codecovCommand: cli.Command = command({
	name: 'codecov',
	description: 'Codecov coverage commands.',
	commands: [compareCommand],
})

export function createDefaultCommand(): cli.Command.DefaultCommand {
	return {
		description,
		options,
		examples,
		async run(args) {
			return answer(await compare(args), homeHeader({ description }))
		},
	}
}

export function activate({ addCommand }: { addCommand(command: typeof codecovCommand): void }): void {
	addCommand(codecovCommand)
}
