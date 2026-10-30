---
id: MOD-206
title: 0.9.36: the version named in its four places, the CHANGELOG dated, and a "From 0.9.35 to 0.9.36" section
domain: mod
tier: economy
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, docs/upgrading.md]
forbid: [hooks/register.ts, hooks/lib/land.ts, hooks/lib/ghguard.ts, hooks/lib/landnudge.ts, tests/**, docs/cards/**]
red_test: none
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

0.9.35 shipped 2026-10-30. Since then MOD-203 (gh guard verb past -R), MOD-204 (land hardening) and MOD-205 (option landAuto) landed under Unreleased. A release carries them to the loaded plugin.

## Done when

- `0.9.35` becomes `0.9.36` in exactly four places and nowhere else: `MOD_VERSION` in hooks/lib/version.ts, `"version"` in .claude-plugin/plugin.json, the `Version 0.9.35, MIT.` line at the end of README.md, and the CHANGELOG heading below. `grep -rn '0\.9\.35' hooks/lib/version.ts .claude-plugin/plugin.json README.md` prints nothing afterwards.
- CHANGELOG.md: the `## Unreleased` heading becomes `## 0.9.36 — 2026-10-30` (an em dash, as the headings below it), its entries unchanged; no empty `## Unreleased` is left behind.
- docs/upgrading.md gains, above `### From 0.9.34 to 0.9.35`, a `### From 0.9.35 to 0.9.36` section in the same shape as the one below it: a first line saying land still files at once by default and `/delegation config landAuto off` makes it show the issue first and file only on confirm; then one line `Fixed:` summarising the fixes in the CHANGELOG's own words, shortened (the gh guard reads the verb past -R/--repo, land titles redacted, bodies list only overlapping cards, land_plan retry matches by open issue, status comments not re-posted after a reload); then `Added:` naming landAuto; then `Detail: [CHANGELOG 0.9.36](../CHANGELOG.md).`
- Nothing else changes: `git diff --stat` against the base shows exactly those five files.

## Review

Release card, attempt 1 consistent (haiku, $0.01). Five scoped files only; validate, node and the engine suite (1807 pass) green.
