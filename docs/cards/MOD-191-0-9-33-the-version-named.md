---
id: MOD-191
title: 0.9.33: the version named in its four places, the CHANGELOG dated, and a "From 0.9.32 to 0.9.33" section
domain: mod
tier: economy
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, docs/upgrading.md]
forbid: [hooks/register.ts, hooks/lib/card.ts, hooks/lib/land.ts, hooks/lib/mergecmd.ts, tests/**, docs/cards/**]
red_test: none
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

0.9.32 shipped 2026-10-29. Since then MOD-188 (issue, parent and the parent-scope check on the card tool), MOD-189 (Refs in the PR body and the printed issue close at merge finish) and MOD-190 (/delegation land) landed under Unreleased: step 1 of feature management. A release carries them to the loaded plugin, and this release card also runs the engine suite, which the three build cards did not all gate on.

## Done when

- `0.9.32` becomes `0.9.33` in exactly four places and nowhere else: `MOD_VERSION` in hooks/lib/version.ts, `"version"` in .claude-plugin/plugin.json, the `Version 0.9.32, MIT.` line at the end of README.md, and the CHANGELOG heading below. `grep -rn '0\.9\.32' hooks/lib/version.ts .claude-plugin/plugin.json README.md` prints nothing afterwards.
- CHANGELOG.md: the `## Unreleased` heading becomes `## 0.9.33 — 2026-10-29` (an em dash, as the headings below it), its entries unchanged; no empty `## Unreleased` is left behind.
- docs/upgrading.md gains, above `### From 0.9.31 to 0.9.32`, a `### From 0.9.32 to 0.9.33` section in the same shape as the one below it: a first line saying nothing changes for a card that names no issue or parent, then one line `Added:` summarising the three entries in the CHANGELOG's own words, shortened (the card tool's issue, parent, parentScope and parentForbid; Refs #n in pr.md and the printed gh issue close at finish; /delegation land), then a line pointing at the guide's Planning on GitHub section, then `Detail: [CHANGELOG 0.9.33](../CHANGELOG.md).`
- Nothing else changes: `git diff --stat` against the base shows exactly those five files.

## Review

Release card, attempt 1 consistent (haiku, $0.01). Five scoped files only; validate, node and the engine suite (1724 pass) green in the worktree.
