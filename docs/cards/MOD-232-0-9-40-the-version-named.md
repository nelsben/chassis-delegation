---
id: MOD-232
title: 0.9.40: the version named in its four places, the CHANGELOG dated, and a "From 0.9.39 to 0.9.40" section
domain: mod
tier: economy
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, docs/upgrading.md]
forbid: [hooks/register.ts, hooks/lib/scheduler.ts, hooks/lib/configeff.ts, hooks/lib/configtable.ts, hooks/lib/allow.ts, tests/**, docs/cards/**]
red_test: none
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

0.9.39 shipped 2026-10-31. Since then MOD-229 (the gate runs past the 10-minute host cap, gateTimeoutMinutes 1-120 default 30), MOD-230 (busy-machine words), MOD-231 (merge takes a review that accepts), MOD-224 (a review read after compaction), MOD-225 (the poll detector ignores heredocs and quotes), MOD-226 (the pause line) and MOD-227 (a scope/forbid clash refuses) landed under Unreleased. A release carries them to the loaded plugin.

## Done when

- `0.9.39` becomes `0.9.40` in exactly four places and nowhere else: `MOD_VERSION` in hooks/lib/version.ts, `"version"` in .claude-plugin/plugin.json, the `Version 0.9.39, MIT.` line at the end of README.md, and the CHANGELOG heading below. `grep -rn '0\.9\.39' hooks/lib/version.ts .claude-plugin/plugin.json README.md` prints nothing afterwards. Do not touch the gateTimeoutMinutes option in plugin.json.
- CHANGELOG.md: the `## Unreleased` heading becomes `## 0.9.40 — 2026-10-31` (an em dash, as the headings below it), its entries unchanged; no empty `## Unreleased` is left behind. If the Unreleased section holds more than one `### Added`, `### Changed` or `### Fixed` heading of the same name, leave them as they are.
- docs/upgrading.md gains, above `### From 0.9.38 to 0.9.39`, a `### From 0.9.39 to 0.9.40` section in the same shape as the one below it. Its first line says nothing needs doing to upgrade, except that `gateTimeoutMinutes` now defaults to 30 and takes 1 to 120: a value already set in a repo file or in /config is kept. Then one line `Added:` summarising, shortened, the busy-machine words on a red or timed-out gate and at dispatch, and the `[[pause v=1 …]]` line a worker prints instead of a report while its own background job runs. Then one line `Changed:` saying the verifier's gate runs with no 10-minute host cap, up to `gateTimeoutMinutes`. Then one line `Fixed:` summarising merge taking a review that accepts, a review read after compaction, the polling row ignoring heredocs and quoted text, and a scope/forbid clash refusing the card. Then `Detail: [CHANGELOG 0.9.40](../CHANGELOG.md).`
- Nothing else changes: `git diff --stat` against the base shows exactly those five files.

## Review

Release card: only the five scoped files. The version is set in four places, the CHANGELOG entry is dated 0.9.40 — 2026-10-31, and the upgrading section follows the asked shape, including the gateTimeoutMinutes 30 note.
