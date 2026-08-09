---
name: coverage-compare
description: Compare local LCOV coverage with the Codecov coverage stored for a branch base.
---

# Coverage Compare

## Workflow

1. Detect the project package manager and run its coverage command to produce an LCOV report.
2. Run `npx -y buddy-codecov compare` from the target repository. The default output is token-efficient TOON.
3. Set `CODECOV_API_TOKEN` when Codecov requires authentication. Use `--format json` only when another program requires JSON.
4. Use `--base <sha>` for a specific Codecov report, `--base-ref <ref>` for another branch, or `--report <path>` for a non-default LCOV report.

## Constraints

- Compare aggregate project line coverage only.
- Do not upload coverage reports.
- Treat a missing base report or API failure as an error.
