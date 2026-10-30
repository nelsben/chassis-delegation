---
id: MOD-187
title: 0.9.32: the version named in its four places, the CHANGELOG dated, and a "From 0.9.31 to 0.9.32" section
domain: mod
tier: economy
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, docs/upgrading.md]
forbid: [hooks/register.ts, hooks/lib/norepo.ts, tests/**, docs/cards/**]
red_test: none
gate: validate, node
budget: 2-attempts
spend: 3
---
## Why

0.9.31 shipped 2026-10-25. Since then MOD-185 (a repo=none card's outside check ignores the mod's and the lead's own writes in the session checkout) and MOD-186 (a repo=none card's outside listing lives in a file, not the store) landed under Unreleased. A release carries them to the loaded plugin.

## Done when

- `0.9.31` becomes `0.9.32` in exactly four places and nowhere else: `MOD_VERSION` in hooks/lib/version.ts, `"version"` in .claude-plugin/plugin.json, the `Version 0.9.31, MIT.` line at the end of README.md, and the CHANGELOG heading below. `grep -rn '0\.9\.31' hooks/lib/version.ts .claude-plugin/plugin.json README.md` prints nothing afterwards.
- CHANGELOG.md: the `## Unreleased` heading becomes `## 0.9.32 — 2026-10-29` (an em dash, as the headings below it), its entries unchanged; no empty `## Unreleased` is left behind.
- docs/upgrading.md gains, above `### From 0.9.30 to 0.9.31`, a `### From 0.9.31 to 0.9.32` section in the same shape as the one below it: one line per entry in the released section in the CHANGELOG's own words, shortened, then `Detail: [CHANGELOG 0.9.32](../CHANGELOG.md).` It says nothing changes for a repo that never uses repo=none cards, and that a research card dispatched before the update still verifies.
- Nothing else changes: `git diff --stat` against the base shows exactly those five files.

## Review

Release card, attempt 1 consistent (haiku, $0.01). Five scoped files only; validate and node suites green in the worktree.
