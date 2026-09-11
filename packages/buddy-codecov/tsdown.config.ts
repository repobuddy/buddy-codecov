import { defineConfig } from 'tsdown'

// Two configs, because the two entries want opposite dependency treatment. They share
// an `outDir`, which is safe: tsdown hoists `clean` and runs it once across every
// config before any build writes, so neither wipes the other.
//
// No `outExtensions` here: this package publishes `.mjs` / `.d.mts` and `exports`
// names those paths, so tsdown's defaults are already correct.
const shared = {
	format: 'esm',
	outDir: 'dist',
	platform: 'node',
	clean: true,
} as const

export default defineConfig([
	{
		// Library entry. Dependencies stay EXTERNAL on purpose, and `clibuilder` is the
		// reason: this entry exports `activate` / `*Command` so a HOST cli can compose
		// them. Host and plugin must share one clibuilder instance — a private inlined
		// copy would break command-registry identity and leave the public `.d.ts`
		// referencing types from a module that is no longer a resolvable import.
		...shared,
		entry: { index: 'src/index.ts' },
		dts: { sourcemap: true },
	},
	{
		// CLI entry. Every runtime dependency is inlined so the published
		// `dist/cli.mjs` runs with no `node_modules` present — which is the state an
		// installed agent plugin is actually in, since the plugin directory is a copy
		// of the source checkout rather than an npm install.
		//
		// Only this package's own `dependencies` need listing — those are the only ones
		// tsdown externalizes by default, so clibuilder's ~30 transitive packages are
		// inlined automatically. `onlyBundle: false` silences the "bundled a
		// dependency" warnings that are the whole point here.
		//
		// Expect two build warnings about unanalyzable dynamic imports: clibuilder
		// loads third-party plugins and user config files by runtime-computed
		// specifier. Both are correct by design and must stay dynamic; keeping this
		// output ESM preserves their semantics.
		...shared,
		entry: { cli: 'src/cli.ts' },
		dts: false,
		deps: {
			alwaysBundle: [/^@toon-format\/toon(\/|$)/, /^clibuilder(\/|$)/],
			onlyBundle: false,
		},
	},
])
