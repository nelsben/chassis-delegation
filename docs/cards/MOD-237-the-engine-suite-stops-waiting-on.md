---
id: MOD-237
title: The engine suite stops waiting on real time: tests over 1 s move to the fake clock and the suite's wall time drops
domain: mod
tier: standard
status: merged
scope: [tests/**]
forbid: []
red_test: none
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

`claude plugin test` takes 113-118 s and runs up to three times per card; the merge log shows ~114 tests over 1 s (e.g. gatespawn 'stopped at 2 minutes' ~2966 ms). A first reading found no setTimeout in tests/ and that the slow tests already drive the fake clock, so the time is probably the cost of advancing simulated time, the per-test world build, or the 9231-line module load, not a real wait. Measure before changing anything; a hard 'at most N slow tests' target is not reliable on a machine that is always loaded.

## Done when

- The worker runs `claude plugin test` once and records in the report's metrics the total wall time and every test over 1000 ms with its time.
- Each such test is classified in the report as (a) a real-time wait (a timer or sleep the fake clock does not cover), (b) fake-clock advance cost (many small ticks), (c) real git or process work, or (d) per-test fixed cost (world build, module load), with one line of evidence each.
- Tests in class (a) are moved to the fake clock, keeping every assertion; tests in class (b) are changed only where a single larger clock advance gives the same assertion; classes (c) and (d) are left alone and the harness-level cause, if any, is described (not fixed) in the report for a later card.
- No test is deleted or weakened, no assertion count goes down, and nothing under hooks/ changes.
- The report gives the after wall time and the after count of tests over 1000 ms from one more run; a worse or equal result is reported as such, not hidden.
- Gates validate, node and test are green.
