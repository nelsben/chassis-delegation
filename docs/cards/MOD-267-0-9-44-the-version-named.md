---
id: MOD-267
title: 0.9.44: the version named in its three places, the CHANGELOG's Unreleased section dated, and a "From 0.9.43 to 0.9.44" section
domain: mod
tier: economy
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, docs/upgrading.md]
forbid: [hooks/register.ts, hooks/lib/scheduler.ts, hooks/lib/configeff.ts, hooks/lib/configtable.ts, hooks/lib/allow.ts, docs/cards/**]
red_test: none
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

0.9.43 shipped 2026-11-01. Since then MOD-265 (an orphan reviewer hand-back caught at a turn's end shows its review line once) and MOD-266 (session start measured; no code changed) landed on main, each with an Unreleased entry. A release carries them to the loaded plugin.

## Done when

- `0.9.43` becomes `0.9.44` in exactly three places and nowhere else: `MOD_VERSION` in hooks/lib/version.ts, `"version"` in .claude-plugin/plugin.json, and the `Version 0.9.43, MIT.` line at the end of README.md. `grep -rn '0\.9\.43' hooks/lib/version.ts .claude-plugin/plugin.json README.md` prints nothing afterwards.
- CHANGELOG.md: the `## Unreleased` heading becomes `## 0.9.44 — 2026-11-01` (an em dash, as the headings below it); its `### Changed` and `### Fixed` subsections and their bullets are unchanged; no empty `## Unreleased` is left behind. The 0.9.43 section and everything below it is unchanged.
- docs/upgrading.md gains, directly above `### From 0.9.42 to 0.9.43`, a `### From 0.9.43 to 0.9.44` section in the same shape as the one below it, these lines in order: `Nothing needs doing to upgrade.`, then `Fixed: a reviewer hand-back with no spawn record, caught at a turn's end, now shows its review line in the conversation once.`, then `Detail: [CHANGELOG 0.9.44](../CHANGELOG.md).`, then a blank line.
- Nothing else changes: `git diff --stat` against the base shows exactly those five files.
- Gates validate, node and test are green.
