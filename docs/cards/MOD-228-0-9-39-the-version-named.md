---
id: MOD-228
title: 0.9.39: the version named in its four places, the CHANGELOG dated, and a "From 0.9.38 to 0.9.39" section
domain: mod
tier: economy
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, docs/upgrading.md]
forbid: [hooks/register.ts, hooks/lib/scheduler.ts, hooks/lib/landtree.ts, hooks/lib/configeff.ts, hooks/lib/configcmd.ts, tests/**, docs/cards/**]
red_test: none
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

0.9.38 shipped 2026-10-31. Since then MOD-221 (tree import reuses a closed recorded issue), MOD-222 (queue position for the total maxWorkers cap) and MOD-223 (/delegation config shows the repo file's project) landed under Unreleased. A release carries them to the loaded plugin.

## Done when

- `0.9.38` becomes `0.9.39` in exactly four places and nowhere else: `MOD_VERSION` in hooks/lib/version.ts, `"version"` in .claude-plugin/plugin.json, the `Version 0.9.38, MIT.` line at the end of README.md, and the CHANGELOG heading below. `grep -rn '0\.9\.38' hooks/lib/version.ts .claude-plugin/plugin.json README.md` prints nothing afterwards.
- CHANGELOG.md: the `## Unreleased` heading becomes `## 0.9.39 — 2026-10-31` (an em dash, as the headings below it), its entries unchanged; no empty `## Unreleased` is left behind.
- docs/upgrading.md gains, above `### From 0.9.37 to 0.9.38`, a `### From 0.9.38 to 0.9.39` section in the same shape as the one below it: a first line saying nothing needs doing to upgrade; then one line `Fixed:` summarising, shortened, tree import reusing a recorded issue that is closed (with or without `close`), the queue position for a lane held by the total `maxWorkers` cap, and `/delegation config` showing the repo file's `project` (including `none`) as the value in effect; then `Detail: [CHANGELOG 0.9.39](../CHANGELOG.md).`
- Nothing else changes: `git diff --stat` against the base shows exactly those five files.

## Review

Release card: only the five scoped files; the version is in its four places, the CHANGELOG is dated, and the upgrading section is in the shape asked for. Accepted.
