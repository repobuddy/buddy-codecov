---
name: coverage-compare
description: Compare local LCOV coverage with the Codecov coverage stored for a branch base.
---

# Coverage Compare

## Workflow

1. Detect the project package manager and run its coverage command to produce an LCOV report.
2. Run the comparison from the target repository. Prefer the CLI that ships beside this skill — it is bundled with its dependencies inlined, so it runs straight from an installed plugin directory with no install and no network fetch:

   ```bash
   node <this-skill-dir>/scripts/compare.mjs
   ```

   If that path cannot be resolved, fall back to `npx -y buddy-codecov compare`. Flags below work the same in either form, and the default output is token-efficient TOON.
3. Set `CODECOV_API_TOKEN` when Codecov requires authentication. Use `--format json` only when another program requires JSON.
4. Use `--base <sha>` for a specific Codecov report, `--base-ref <ref>` for another branch, or `--report <path>` for a non-default LCOV report.

## Constraints

- Compare aggregate project line coverage only.
- Do not upload coverage reports.
- Treat a missing base report or API failure as an error.
