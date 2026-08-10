import { cli } from 'clibuilder'
import { compareCommand } from './plugin.ts'

export async function main(): Promise<void> {
	const app = cli({
		name: 'buddy-codecov',
		version: '0.0.0',
		description: 'Compare local LCOV coverage with Codecov coverage for AI agents.',
		keywords: ['buddy-codecov-plugin'],
	})

	const executable = app.command(compareCommand)
	try {
		await executable.parse(process.argv)
	} catch (error) {
		process.stdout.write(`error: ${error instanceof Error ? error.message : 'Invalid command.'}\n`)
		process.exitCode = 2
	}
}
