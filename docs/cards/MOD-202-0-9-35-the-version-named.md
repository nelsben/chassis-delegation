---
id: MOD-202
title: 0.9.35: the version named in its four places, the CHANGELOG dated, and a "From 0.9.34 to 0.9.35" section
domain: mod
tier: economy
status: merged
issue: 294
parent: 291
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, docs/upgrading.md]
forbid: [hooks/register.ts, hooks/lib/land.ts, hooks/lib/allow.ts, hooks/lib/landnudge.ts, hooks/lib/status.ts, tests/**, docs/cards/**]
red_test: none
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

0.9.34 shipped 2026-10-30. Since then MOD-200 (status comments, merge finish closes, land --supersedes) and MOD-201 (the land nudge, option landNudge) landed under Unreleased. A release carries them to the loaded plugin.

## Done when

- `0.9.34` becomes `0.9.35` in exactly four places and nowhere else: `MOD_VERSION` in hooks/lib/version.ts, `"version"` in .claude-plugin/plugin.json, the `Version 0.9.34, MIT.` line at the end of README.md, and the CHANGELOG heading below. `grep -rn '0\.9\.34' hooks/lib/version.ts .claude-plugin/plugin.json README.md` prints nothing afterwards.
- CHANGELOG.md: the `## Unreleased` heading becomes `## 0.9.35 — 2026-10-30` (an em dash, as the headings below it), its entries unchanged; no empty `## Unreleased` is left behind.
- docs/upgrading.md gains, above `### From 0.9.33 to 0.9.34`, a `### From 0.9.34 to 0.9.35` section in the same shape as the one below it: a first line saying merge finish now closes the task's issue (and the parent when it is the last) itself, and dispatch and the verdict comment on the card's issue; then one line `Added:` summarising the entries in the CHANGELOG's own words, shortened (status comments, finish closes, land --supersedes, the land nudge and its landNudge option); then a line pointing at the guide's Planning on GitHub section; then `Detail: [CHANGELOG 0.9.35](../CHANGELOG.md).`
- Nothing else changes: `git diff --stat` against the base shows exactly those five files.

## Review

Release card, attempt 1 consistent (haiku, $0.01). Five scoped files only; validate, node and the engine suite (1791 pass) green.
