---
id: MOD-280
title: 0.9.46: the version named in its three places, the CHANGELOG's Unreleased section dated, and the Unreleased upgrading note renamed "From 0.9.45 to 0.9.46"
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

0.9.45 shipped 2026-11-02. MOD-279 (in auto mode, a worker's Bash runs as typed; a host-blocked attempt stops without spending budget) has since landed on main with an Unreleased entry. It fixes a blocker for adopters in auto mode, so it ships on its own.

## Done when

- `0.9.45` becomes `0.9.46` in exactly three places and nowhere else: `MOD_VERSION` in hooks/lib/version.ts, `"version"` in .claude-plugin/plugin.json, and the `Version 0.9.45, MIT.` line at the end of README.md. `grep -rn '0\.9\.45' hooks/lib/version.ts .claude-plugin/plugin.json README.md` prints nothing afterwards.
- CHANGELOG.md: the `## Unreleased` heading becomes `## 0.9.46 — 2026-11-03` (an em dash, like the headings below it). Its subsections and bullets are unchanged, and no empty `## Unreleased` is left behind. The 0.9.45 section and everything below it are unchanged.
- docs/upgrading.md: the heading `### Unreleased (MOD-279)` becomes `### From 0.9.45 to 0.9.46`. In its paragraph, `Detail: [CHANGELOG Unreleased](../CHANGELOG.md).` becomes `Detail: [CHANGELOG 0.9.46](../CHANGELOG.md).`. No other text changes.
- Nothing else changes: `git diff --stat` against the base shows exactly those five files.
- Gates validate, node and test are green.
