# buddy-codecov

[![CI](https://github.com/repobuddy/buddy-codecov/actions/workflows/release.yml/badge.svg)](https://github.com/repobuddy/buddy-codecov/actions/workflows/release.yml)
[![Codecov](https://codecov.io/gh/repobuddy/buddy-codecov/graph/badge.svg)](https://codecov.io/gh/repobuddy/buddy-codecov)
[![npm](https://img.shields.io/npm/v/buddy-codecov)](https://www.npmjs.com/package/buddy-codecov)
[![License](https://img.shields.io/npm/l/buddy-codecov)](LICENSE)

An agent plugin and CLI for comparing locally generated LCOV reports with Codecov's stored base coverage.

## Install the plugin

Install the portable plugin and its `coverage-compare` skill with `npx skills`:

```sh
npx skills add repobuddy/buddy-codecov --plugin
```

In Claude Code, add the marketplace and install the plugin:

```text
/plugin marketplace add repobuddy/buddy-codecov
/plugin install buddy-codecov@repobuddy
```

Other agent clients can install the same repository through their plugin marketplace or use the `npx skills` command above.

## Use the skill

After generating an LCOV report, ask your agent to compare coverage with Codecov. The `coverage-compare` skill runs the CLI and reports whether coverage regressed.

## CLI

After the npm package is published, run the CLI without a global installation:

```sh
npx -y buddy-codecov compare
```

The command reads `coverage/lcov.info`, derives the repository and merge-base from Git, then writes token-efficient TOON. Use `CODECOV_API_TOKEN` when Codecov requires authentication.

```sh
CODECOV_API_TOKEN=<token> npx -y buddy-codecov compare --format json
```

Use `buddy-codecov compare --help` to see `--base`, `--base-ref`, `--repo`, and `--report`.
