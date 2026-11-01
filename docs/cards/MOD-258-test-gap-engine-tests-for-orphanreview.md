---
id: MOD-258
title: Test gap: engine tests for orphanReview and engineLanesNote
domain: mod
tier: standard
status: merged
scope: [tests/review.test.ts, tests/dispatchsays.test.ts, tests/harness.ts, hooks/register.ts]
forbid: []
red_test: none
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

MOD-224 added orphanReview (hooks/register.ts near 6058, callers near 8769 and 8817), which matches a review whose spawn record was lost, and MOD-230 added engineLanesNote (near 5229, callers near 7132 and 7140), the busy-machine dispatch line at 3 or more engine lanes. Both shipped with unit tests of their pure parts only; their host-facing paths have no engine test, so a regression in the wiring would go unseen.

## Done when

- An engine test drives a reviewer hand-back whose spawn record is missing from the store and asserts orphanReview matches it to its task by task+attempt+sha and writes the review row once.
- An engine test drives an orphan review with no matching task and asserts it is ignored with no row.
- An engine test dispatches with 3 engine lanes live and asserts the dispatch output carries the engineLanesNote line; with 2 lanes it does not; for a queued spawn the queued variant appears.
- No production code changes unless a test exposes a bug; any such fix is named in the report.
- Gates validate, node and test are green.
