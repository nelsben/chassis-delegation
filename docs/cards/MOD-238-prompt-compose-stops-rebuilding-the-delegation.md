---
id: MOD-238
title: prompt.compose stops rebuilding the delegation snapshot from disk on every brain model request
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/debriefcheck.ts, hooks/lib/debriefdir.ts, tests/compose.test.ts, tests/hooks.test.ts, tests/closed.test.ts, tests/harness.ts, tests/node/**, CHANGELOG.md]
forbid: []
red_test: tests/compose.test.ts: two prompt.compose calls 4 fake seconds apart with no state change: the second makes zero fs.read calls of the debrief and findings files (fails today: it reads them again)
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

On every brain compose (hooks/register.ts near 9216 → snapshot near 2551) the mod rebuilds the whole snapshot uncached; latestProposals → findDebrief/recordDebrief/proposalsAt (near 3623-3708) do 3 to 20 file reads and JSON parses per request, and retireCheck (near 2683) can run up to 4 serial git spawns inline. This runs once per model step of the brain.

## Done when

- The debrief proposals result is memoised keyed on the debrief file path plus its $.fs.stat mtime and size (and the findings file's), and invalidated when the mod writes or ingests a debrief; recordDebrief's existence check uses stat/exists instead of a whole-file read; a compose with an unchanged debrief does no fs.read of it.
- harnessMine's scan of the shared harness debriefs folder runs at most once per 10 minutes per session, not per compose.
- snapshot gains an option {retire: false} used only by prompt.compose; /delegation status and compaction keep the inline retireCheck (tests/hooks.test.ts near 1965-2035 and tests/closed.test.ts near 85 rely on status retiring rows). For compose, retireCheck runs on its own 15-minute timer armed at turn.complete (independent of autoDebrief/autoEval), and compose reads its last result.
- The finished snapshot is cached for 3 s, returned as a structuredClone (statusReport mutates the object it gets), and invalidated by any storeSet on a task, spawn, queue, K.recent, K.debrief, K.postAsk, K.evals or K.evalInflight key, by redraw(), and by a change in $.agent.list() statuses.
- The snapshot text is byte-for-byte unchanged for the same stored state and the same retire results (existing snapshot tests stay green).
- The engine test counts host fs.read calls across the two composes and asserts no git process was spawned by compose.
- CHANGELOG.md gets an Unreleased line.
- Gates validate, node and test are green.
