---
id: MOD-263
title: The engine suite's wall time drops by cutting its per-test fixed cost and balancing its slowest files, with every test kept and isolated
domain: mod
tier: standard
status: merged
scope: [tests/**]
forbid: [hooks/**, .claude-plugin/**, CHANGELOG.md, docs/**]
red_test: none
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

MOD-237 measured `claude plugin test` at 89-95 s wall: 375 s of per-test time across 85 files run in parallel, one child per file, with no single slow test. Every test builds a fresh world in tests/harness.ts and runs session.start against the 9859-line hooks/register.ts, so the cost is per-test fixed cost spread over about 2000 tests, and the suite runs up to three times per card. The runner has no options, so the levers are the cost of one world build plus start, and how the work is split across files.

## Done when

- Measure first: the worker runs `claude plugin test` once and records in the report's metrics the total wall time, each test file's wall time (the slowest 10 by name), and for one typical test the split of its time between `world()` itself, `$.session.start(sessionStart)`, and the test body (by timing a scratch copy of one test with Date.now(), not committed). One line in the report says which of the three dominates.
- Then change only what the measurement points at, inside tests/**: (a) if `world()` or a shared fixture builder dominates, make it cheaper (build constant fixtures once per file, lazily create what most tests never read), and (b) if a few files dominate the parallel wall time, split each into two or more files along its existing `describe` blocks, moving tests unchanged. Do (a), (b), both or neither, as the numbers say.
- Isolation is kept: every test still gets its own World, store, files, clock and state; nothing mutable is shared between tests; a fixture built once per file is frozen or copied per test. A test that passes alone still passes alone and in its file.
- No test is deleted, skipped or weakened; the total test count and the count of `expect(` calls do not go down (report both before and after); nothing outside tests/** changes. hooks/register.ts and the engine's own module load are out of scope: if session.start is the hot part, the report names the hot step (by timing, not guessing) for a later card and changes nothing there.
- The report gives the after wall time and slowest-10 files from two more runs, so load noise is visible; a worse or equal result is reported as such, not hidden.
- Gates validate, node and test are green.
