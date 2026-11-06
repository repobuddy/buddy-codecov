import { cli } from 'clibuilder'
import { compareCommand, createDefaultCommand } from './plugin.ts'

export async function main(): Promise<void> {
	await cli({
		name: 'buddy-codecov',
		version: '0.0.0',
		description: 'Compare local LCOV coverage with Codecov coverage for AI agents.',
	})
		.default(createDefaultCommand())
		.command(compareCommand)
		.parse(process.argv)
}
