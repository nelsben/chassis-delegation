---
id: MOD-252
title: When the machine is loaded, the queue starts fewer workers at once
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/load.ts, hooks/lib/configeff.ts, hooks/lib/configtable.ts, .claude-plugin/plugin.json, tests/load.test.ts, tests/sched.test.ts, tests/harness.ts, tests/node/**, docs/configuration.md, CHANGELOG.md]
forbid: []
red_test: tests/sched.test.ts: with loadThrottle on, slots 3 and the load read answering 2x the cpu count, a third concurrent claim is held with the line `held: machine loaded (<load>/<cpus>)`; with the option off (the default) the same claim is granted (fails today: no such option)
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

On a machine that is always loaded, three concurrent workers plus a verifier and the engine suite push every gate past its timeout. The mod already reads load for isLoaded in hooks/lib/load.ts (LOAD_FACTOR 2) but only to stretch timeouts, not to hold new claims. Ben must say yes to this card: it changes how workers are scheduled.

## Done when

- A new config option loadThrottle (default off) in configeff.ts MAP_FIELDS, configtable.ts, plugin.json userConfig and docs/configuration.md.
- When on, claimSlot reads the load (lazily, only when the option is on, so tests with it off see no extra w.runs) and when isLoaded, limits the effective slot count to max(1, floor(slots / 2)); a claim beyond that is held with the line above; a held worker is retried on the next scheduler tick.
- It never evicts a running worker and never holds the only slot (floor 1).
- Engine tests: the red test both ways; the floor; a running worker is untouched when load rises.
- CHANGELOG.md gets an Unreleased line.
- Gates validate, node and test are green.
