import { defineConfig } from 'tsdown'

export default defineConfig({
	entry: {
		cli: 'src/cli.ts',
		index: 'src/index.ts',
	},
	outDir: 'dist',
	format: 'esm',
	platform: 'node',
	clean: true,
	dts: { sourcemap: true },
})
