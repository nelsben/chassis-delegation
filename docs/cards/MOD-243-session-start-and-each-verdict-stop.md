---
id: MOD-243
title: Session start and each verdict stop reading every key in the store
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/retention.ts, hooks/lib/taskkeys.ts, hooks/lib/storeloss.ts, hooks/types/index.d.ts, tests/retention.test.ts, tests/taskkeys.test.ts, tests/storeloss.test.ts, tests/harness.ts, tests/node/**, CHANGELOG.md]
forbid: []
red_test: tests/retention.test.ts (engine, via world()): a verdict in a store under the pressure line with 500 unrelated keys makes no $.store.keys() call and fewer than 30 store.get calls for pruning (fails today: 500+); the harness gains a w.storeGets counter and the test flushes the fire-and-forget prune
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

storeEntries (hooks/register.ts near 974) does $.store.keys() then a get on every key (about 3110 keys, 3.4 MB) in migrateTaskKeys at session.start (near 9057), pruneStore('start') (near 9058), pruneStore('verdict') after every verdict (near 5577) and each /delegation status call (near 1029). A prune limited to the closed task's own keys would be wrong: its records are fresh, and under pressure it would delete that very verdict. The right cut is a running size estimate that decides when the full scan is worth it.

## Done when

- After each full prune the mod records delegation.prune {at, bytes}; storeSet adds the written value's entryBytes to a running estimate (and a delete subtracts what it knew).
- A verdict triggers the full scan only when the estimate exceeds PRESSURE_BYTES or the last full scan is older than 24 h; otherwise it does nothing. A refused store write also triggers it, but is not the only trigger.
- The /delegation status figure comes from the running estimate.
- migrateTaskKeys writes a marker delegation.migrated.<root> = the mod version after a successful run and skips the full scan when it matches; a bare key found later is migrated at its first per-task read.
- Retention behaviour is otherwise unchanged; MOD-233's spawn-record rewrite, which runs inside the full scan, still runs whenever the scan does.
- CHANGELOG.md gets an Unreleased line.
- Gates validate, node and test are green.
