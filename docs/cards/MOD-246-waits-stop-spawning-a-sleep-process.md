---
id: MOD-246
title: Waits stop spawning a sleep process every 5 seconds
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/verdicttool.ts, tests/verdicttool.test.ts, tests/verifylock.test.ts, tests/harness.ts, tests/node/**, CHANGELOG.md]
forbid: []
red_test: tests/verdicttool.test.ts: a 600 s verdict wait spawns at most 28 `sleep` processes (fails today: 120 at a fixed 5 s step)
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Polling waits (the verdict tool's wait for a verdict, the engine-lock wait) spawn a `sleep 5` process per poll: 120 processes over a 10-minute wait, each a fork on a machine that is always loaded. The `sleep` process is there on purpose (MOD-72, hooks/lib/verdicttool.ts near 26-27): a hook's 10 s budget counts $.clock.sleep but not $.process.run, so it cannot be replaced by the clock. What can change is the step.

## Done when

- The verdict wait and the engine-lock wait use an adaptive step: 5 s for the first 30 s of a wait, then 15 s until 2 minutes, then 30 s; the step function is pure, in hooks/lib/verdicttool.ts, with node tests.
- The wait still ends within one step of the verdict row appearing (the test asserts the wait returns at most 30 s of fake time after the row).
- hooks/lib/allow.ts and the `sleep` allowlist entry are untouched (tests/allow.test.ts near 340-348 pins them).
- Engine tests: the red test; a verdict that lands at 12 s is seen by 15 s; the engine-lock wait uses the same step.
- CHANGELOG.md gets an Unreleased line.
- Gates validate, node and test are green.
