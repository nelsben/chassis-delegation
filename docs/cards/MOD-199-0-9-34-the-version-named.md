---
id: MOD-199
title: 0.9.34: the version named in its four places, the CHANGELOG dated, and a "From 0.9.33 to 0.9.34" section
domain: mod
tier: economy
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, docs/upgrading.md]
forbid: [hooks/register.ts, hooks/lib/land.ts, hooks/lib/allow.ts, hooks/lib/tree.ts, hooks/lib/ghguard.ts, tests/**, docs/cards/**]
red_test: none
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

0.9.33 shipped 2026-10-29. Since then MOD-192..198 landed under Unreleased: step 2 of feature management (land files itself, land_plan, tree, the parent close at finish, scopeAmends within-parent, the worker gh guard, the land_plan resume). A release carries them to the loaded plugin.

## Done when

- `0.9.33` becomes `0.9.34` in exactly four places and nowhere else: `MOD_VERSION` in hooks/lib/version.ts, `"version"` in .claude-plugin/plugin.json, the `Version 0.9.33, MIT.` line at the end of README.md, and the CHANGELOG heading below. `grep -rn '0\.9\.33' hooks/lib/version.ts .claude-plugin/plugin.json README.md` prints nothing afterwards.
- CHANGELOG.md: the `## Unreleased` heading becomes `## 0.9.34 — 2026-10-30` (an em dash, as the headings below it), its entries unchanged; no empty `## Unreleased` is left behind.
- docs/upgrading.md gains, above `### From 0.9.32 to 0.9.33`, a `### From 0.9.33 to 0.9.34` section in the same shape as the one below it: a first line saying `/delegation land` now files the issue itself (use --dry-run for the old print-only behaviour) and workers can no longer run gh writes; then one line `Added:` summarising the entries in the CHANGELOG's own words, shortened (the land tool and filing, the project option, land_plan, tree, the parent close line at finish, scopeAmends within-parent, the gh guard, the land_plan resume); then a line pointing at the guide's Planning on GitHub section; then `Detail: [CHANGELOG 0.9.34](../CHANGELOG.md).`
- Nothing else changes: `git diff --stat` against the base shows exactly those five files.

## Review

Release card, attempt 1 consistent (haiku, $0.01). Five scoped files only; validate, node and the engine suite (1764 pass) green.
