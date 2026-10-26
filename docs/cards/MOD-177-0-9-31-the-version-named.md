---
id: MOD-177
title: 0.9.31: the version named in its four places, the CHANGELOG dated, and a "From 0.9.30 to 0.9.31" section
domain: mod
tier: economy
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, docs/upgrading.md]
forbid: [hooks/register.ts, hooks/lib/configtable.ts, hooks/lib/repoconfig.ts, tests/**, docs/cards/**]
red_test: none
gate: validate, node
budget: 2-attempts
spend: 3
---
## Why

0.9.30 shipped 2026-10-25. Since then MOD-175 (an engine test pinning what fires on a SendMessage resume, internals corrected) and MOD-176 (a tool.call hook on SendMessage so a resume is counted once whichever events the host fires) landed under Unreleased. A release carries them to the loaded plugin. Dispatched only after MOD-176 is on main.

## Done when

- `0.9.30` becomes `0.9.31` in exactly four places and nowhere else: `MOD_VERSION` in hooks/lib/version.ts, `"version"` in .claude-plugin/plugin.json, the `Version 0.9.30, MIT.` line at the end of README.md, and the CHANGELOG heading below. `grep -rn '0\.9\.30' hooks/lib/version.ts .claude-plugin/plugin.json README.md` prints nothing afterwards.
- CHANGELOG.md: the `## Unreleased` heading becomes `## 0.9.31 — 2026-10-25` (an em dash, as the headings below it), its entries unchanged; no empty `## Unreleased` is left behind.
- docs/upgrading.md gains, above `### From 0.9.29 to 0.9.30`, a `### From 0.9.30 to 0.9.31` section in the same shape as the one below it: a first line saying there is nothing to do, then one line per entry in the released section in the CHANGELOG's own words, shortened, then `Detail: [CHANGELOG 0.9.31](../CHANGELOG.md).`
- Nothing else changes: `git diff --stat` against the base shows exactly those five files.

## Review

Release card, consistent on attempt 1 ($0.01, Haiku). 0.9.31 appears in the four version places, and the CHANGELOG heading is dated 2026-10-25 with an em dash. No empty Unreleased heading is left behind. docs/upgrading.md gains "From 0.9.30 to 0.9.31": nothing to do, one line each for MOD-175 and MOD-176, and the Detail link. The diff is five files and nothing else.
