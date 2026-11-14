# buddy-codecov

## 0.3.0

### Minor Changes

- 5e45b58: Upgrade to clibuilder 12 and follow its AXI conventions.
  
  - `compare` returns its answer instead of writing it: TOON by default, JSON with the global `--format json`. The answer adds `status` and a `summary` line, and a regression adds a `help` line.
  - Errors are coded `CliError`s with a `help` line: `no-report`, `no-repository`, `invalid-repo`, `no-default-branch`, `no-base-record`, `no-base-totals`, `codecov-api-error` and `codecov-unreachable`. They go to stdout, exit 1; usage errors exit 2.
  - An empty LCOV report is reported as `empty: 0 instrumented lines found in the report`.
  - Running `buddy-codecov` bare compares coverage, under a `bin` and `description` header.
  - `compare` has `examples` in its help.
  - Behavior change: `compare` no longer has its own `--format` option. `--format` is the global option, and it also accepts `text`.

### Patch Changes

- 528d254: Bundle clibuilder 12.2.0. In TOON output, a string value that contains a colon is now quoted, for example `message: "Could not reach Codecov: request failed."`.
- 8e50960: Include `CHANGELOG.md` in the published package.

## 0.2.1

### Patch Changes

- 6126098: Bundle the CLI's dependencies into `dist/cli.mjs`, and invoke it from the skill directly.
  
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

## 0.2.0

### Minor Changes

- c4539c4: Run coverage comparisons through the `codecov compare` plugin command.

## 0.1.0

### Minor Changes

- e61b883: Align package metadata with the Repobuddy plugin.
- f7ea2d5: Initial release of Codecov coverage comparison for AI coding agents.
