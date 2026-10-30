---
id: MOD-212
title: 0.9.37: the version named in its four places, the CHANGELOG dated, and a "From 0.9.36 to 0.9.37" section
domain: mod
tier: economy
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, docs/upgrading.md]
forbid: [hooks/register.ts, hooks/lib/land.ts, hooks/lib/ghguard.ts, hooks/lib/landnudge.ts, hooks/lib/brief.ts, hooks/lib/verify-native.ts, tests/**, docs/cards/**]
red_test: none
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

0.9.36 shipped 2026-10-30. Since then MOD-207 (land resume keyed to the plan, gh repo clone a read), MOD-208 (landAuto defaults to off, #301), MOD-209 (docs for hand-written cards, #303), MOD-210 (land nudge quiet on card turns, #302) and MOD-211 (malformed report matched to its task, #271) landed under Unreleased. A release carries them to the loaded plugin.

## Done when

- `0.9.36` becomes `0.9.37` in exactly four places and nowhere else: `MOD_VERSION` in hooks/lib/version.ts, `"version"` in .claude-plugin/plugin.json, the `Version 0.9.36, MIT.` line at the end of README.md, and the CHANGELOG heading below. `grep -rn '0\.9\.36' hooks/lib/version.ts .claude-plugin/plugin.json README.md` prints nothing afterwards.
- CHANGELOG.md: the `## Unreleased` heading becomes `## 0.9.37 — 2026-10-30` (an em dash, as the headings below it), its entries unchanged; no empty `## Unreleased` is left behind.
- docs/upgrading.md gains, above `### From 0.9.35 to 0.9.36`, a `### From 0.9.36 to 0.9.37` section in the same shape as the one below it: a first line saying land now shows the issue first and files only on confirm by default, and `/delegation config landAuto on` restores filing at once; then one line `Fixed:` summarising the fixes in the CHANGELOG's own words, shortened (land_plan retry keyed to the plan, land_plan preview runs no gh, land confirm reuses its preview and resumes, gh repo clone and view are reads, the land nudge stays quiet on dispatch/verdict/merge turns, a malformed report is matched to its task and named malformed instead of fabrication); then `Changed:` naming the landAuto default; then `Documentation:` naming the new `Fields the GitHub sync reads` section of docs/contracts.md; then `Detail: [CHANGELOG 0.9.37](../CHANGELOG.md).`
- Nothing else changes: `git diff --stat` against the base shows exactly those five files.

## Review

Release card, attempt 1 consistent (haiku, $0.02). Five scoped files only; validate, node and the engine suite (1828 pass) green.
