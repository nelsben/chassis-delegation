---
id: MOD-264
title: 0.9.43: the version named in its three places, the CHANGELOG's Unreleased section dated with a MOD-263 entry added, and a "From 0.9.42 to 0.9.43" section
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

0.9.42 shipped 2026-11-01. Since then MOD-261 (a sibling's write during a repo=here worker's Bash command is no longer charged to it) and MOD-263 (the engine suite split for wall time, tests only) landed on main. MOD-261 wrote an Unreleased entry; MOD-263 did not. A release carries them to the loaded plugin.

## Done when

- `0.9.42` becomes `0.9.43` in exactly three places and nowhere else: `MOD_VERSION` in hooks/lib/version.ts, `"version"` in .claude-plugin/plugin.json, and the `Version 0.9.42, MIT.` line at the end of README.md. `grep -rn '0\.9\.42' hooks/lib/version.ts .claude-plugin/plugin.json README.md` prints nothing afterwards.
- CHANGELOG.md: the `## Unreleased` heading becomes `## 0.9.43 — 2026-11-01` (an em dash, as the headings below it); its `### Fixed` subsection and MOD-261 bullet are unchanged; no empty `## Unreleased` is left behind.
- In that 0.9.43 section, after the `### Fixed` subsection's bullet, add a blank line, `### Changed`, a blank line, and exactly this bullet copied verbatim: `- **The engine suite runs in about 53 s instead of about 79 s (MOD-263).** `tests/hooks.test.ts` held 74 s of the suite's 79 s wall time; it is split along its top-level `describe` blocks into `tests/hooks.test.ts`, `hooks2`, `hooks3` and `hooks4`, each about 19 s, every test moved unchanged (393 tests, 1653 `expect(` calls before and after). A test's remaining fixed cost is `session.start`, about 350 ms. Tests only; no behaviour changed.`
- The 0.9.42 section and everything below it is unchanged.
- docs/upgrading.md gains, directly above `### From 0.9.41 to 0.9.42`, a `### From 0.9.42 to 0.9.43` section in the same shape as the one below it, these lines in order: `Nothing needs doing to upgrade.`, then `Fixed: a file a sibling worker wrote while a repo=here or outside-root worker's command ran is no longer charged to that worker; a file whose owner cannot be told is listed in the verdict as changed while both ran.`, then `Detail: [CHANGELOG 0.9.43](../CHANGELOG.md).`, then a blank line.
- Nothing else changes: `git diff --stat` against the base shows exactly those five files.
- Gates validate, node and test are green.
