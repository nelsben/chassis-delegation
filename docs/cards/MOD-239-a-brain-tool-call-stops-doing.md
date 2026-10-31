---
id: MOD-239
title: A brain tool call stops doing a store read-modify-write, two usage reads and a forced redraw
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/drive.ts, hooks/lib/brain.ts, tests/brain.test.ts, tests/drive.test.ts, tests/hooks.test.ts, tests/harness.ts, tests/node/**, CHANGELOG.md]
forbid: []
red_test: tests/brain.test.ts (engine): 20 brain Read tool calls within one turn make at most 1 store.set of the brain key and exactly one flush at turn.complete carrying all 20 counts (fails today: 20 sets); the harness gains w.storeSets and w.usageCalls counters
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

driveGuard (hooks/register.ts near 1654) runs on every brain Read/Edit/Write/Agent/Bash: updateDrive → updateBrain → readBrain + brainKey, with $.session.usage() twice, a store.get, store.set, $.state.set and redraw(); Bash adds loadRepoConfig, a third usage read and liveState. After every brain Bash, driveOutput/ranBefore (near 8629-8650, hooks/lib/drive.ts near 147) hash the whole stdout+stderr even when driveWarn is off.

## Done when

- Drive counters live in module memory during a turn and are flushed into the stored brain record at turn.complete (merged as stored.drive + pending delta, never overwriting, so a reload mid-session does not zero stored counts), or on a 5 s debounce, whichever comes first; the drive rows still fire on the same thresholds.
- readDrive adds the unflushed in-memory delta, so a mid-turn /delegation status shows current counts.
- brainKey is computed once per session.start and once per turn.start, not per call.
- redraw() is called from driveGuard only when a value the band or pane shows changed.
- ranBefore and the repeat kind stay as they are (tests/hooks.test.ts near 2647 pins the 'run-or-poll' count); only driveOutput's hashing is gated by cfg.driveWarn, and it hashes the whole text only when the length changed, else the first and last 8 KB plus the length.
- In driveGuard the config is loaded first (cheap after MOD-241) and liveState is computed only when driveStep could emit a row (count >= 3 or a poll).
- tests/hooks.test.ts's existing drive-count tests pass unchanged; the harness gains w.storeSets (key to count) and w.usageCalls.
- CHANGELOG.md gets an Unreleased line.
- Gates validate, node and test are green.
