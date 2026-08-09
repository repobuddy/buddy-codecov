#!/usr/bin/env node
import { enableCompileCache } from 'clibuilder/compile-cache'

enableCompileCache()

const [{ cli }, { activate }] = await Promise.all([import('clibuilder'), import('../src/plugin.mjs')])
const app = cli({
	name: 'buddy-codecov',
	version: '0.0.0',
	description: 'Compare local LCOV coverage with Codecov coverage for AI agents.',
	keywords: ['buddy-codecov-plugin'],
})

activate({ addCommand: (command) => app.command(command) })

try {
	await app.parse(process.argv)
} catch (error) {
	process.stdout.write(`error: ${error instanceof Error ? error.message : 'Invalid command.'}\n`)
	process.exitCode = 2
}
