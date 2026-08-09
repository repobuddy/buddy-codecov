---
name: codecov-coverage-compare
description: Use this skill when comparing local coverage against the Codecov report stored for a branch base.
---

# Codecov Coverage Compare

## Workflow

1. Detect the project package manager and run its coverage command.
2. Run `node <plugin-root>/skills/codecov-coverage-compare/scripts/compare-codecov-coverage.mjs --format json` from the target repository.
3. Set `CODECOV_API_TOKEN` when Codecov requires authentication. Without it, retain the script warning and use the result only if the unauthenticated request succeeds.
4. Use `--base <sha>` for a specific Codecov report. Otherwise, the script compares against the merge-base with the remote's default branch.

## Constraints

- Compare aggregate project line coverage only.
- Do not upload coverage reports.
- Treat a missing base report or API failure as an error.
