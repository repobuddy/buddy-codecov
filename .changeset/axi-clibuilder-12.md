---
"buddy-codecov": minor
---

Upgrade to clibuilder 12 and follow its AXI conventions.

- `compare` returns its answer instead of writing it: TOON by default, JSON with the global `--format json`. The answer adds `status` and a `summary` line, and a regression adds a `help` line.
- Errors are coded `CliError`s with a `help` line: `no-report`, `no-repository`, `invalid-repo`, `no-default-branch`, `no-base-record`, `no-base-totals`, `codecov-api-error` and `codecov-unreachable`. They go to stdout, exit 1; usage errors exit 2.
- An empty LCOV report is reported as `empty: 0 instrumented lines found in the report`.
- Running `buddy-codecov` bare compares coverage, under a `bin` and `description` header.
- `compare` has `examples` in its help.
- Behavior change: `compare` no longer has its own `--format` option. `--format` is the global option, and it also accepts `text`.
