---
id: MOD-260
title: 0.9.41: the version named in its four places, the CHANGELOG dated, and a "From 0.9.40 to 0.9.41" section
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

0.9.40 shipped 2026-10-31. Since then the perf-audit cards MOD-233..254 (store diet, merge-gates tail, gate reuse, caches for config, cards, ledger, liveState, liveModel and the compose snapshot, fewer git and sleep processes, the brief trim, bounded module maps, the worker's engine lock, the closed-task spawn, the loadThrottle option) landed under Unreleased. A release carries them to the loaded plugin.

## Done when

- `0.9.40` becomes `0.9.41` in exactly four places and nowhere else: `MOD_VERSION` in hooks/lib/version.ts, `"version"` in .claude-plugin/plugin.json, the `Version 0.9.40, MIT.` line at the end of README.md, and the CHANGELOG heading below. `grep -rn '0\.9\.40' hooks/lib/version.ts .claude-plugin/plugin.json README.md` prints nothing afterwards.
- CHANGELOG.md: the `## Unreleased` heading becomes `## 0.9.41 — 2026-10-31` (an em dash, as the headings below it), its entries unchanged; no empty `## Unreleased` is left behind.
- docs/upgrading.md gains, above `### From 0.9.39 to 0.9.40`, a `### From 0.9.40 to 0.9.41` section in the same shape as the one below it. Its first line says nothing needs doing to upgrade; the first session start after it slims the stored spawn records (posted verdict text older than a day is dropped) and cuts old `merge-gates.txt` files to their tails, once. Then one line `Added:` naming the `loadThrottle` option (off by default: on a loaded machine, half the worker slots, at least 1). Then one line `Changed:` summarising, shortened: a smaller store and merge-gates.txt, merge skipping gates already green on the same tree, a worker's own engine-suite run taking the engine lock, fewer git, sleep and store calls, cached config, card, ledger and live-model reads, and a shorter brief. Then one line `Fixed:` saying an Agent spawn that only names a closed task's brief runs ad hoc instead of counting as an attempt. Then `Detail: [CHANGELOG 0.9.41](../CHANGELOG.md).`
- Nothing else changes: `git diff --stat` against the base shows exactly those five files.
