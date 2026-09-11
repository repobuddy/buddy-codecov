---
"buddy-codecov": patch
---

Bundle the CLI's dependencies into `dist/cli.mjs`, and invoke it from the skill directly.

An installed agent plugin is a copy of a source checkout, not an npm install, so its directory has
no reliable `node_modules`. That is why the skill shelled out through `npx -y buddy-codecov compare`
— the fetch was the only thing supplying the dependency tree. The published `dist/cli.mjs` now
inlines each runtime dependency and runs with no `node_modules` present at all.

`skills/coverage-compare/scripts/compare.mjs` launches that shipped CLI, and the skill now prefers
it, keeping the `npx` form as a fallback because resolving the launcher path is model behaviour
rather than a guarantee.

The library entry (`.`) is unchanged. Its dependencies stay external on purpose: it exports
`activate` / `*Command` for a host CLI to compose, and host and plugin must share one `clibuilder`
instance rather than each holding a private copy.
