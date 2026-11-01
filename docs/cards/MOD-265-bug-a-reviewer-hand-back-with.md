---
id: MOD-265
title: Bug: a reviewer hand-back with no spawn record, caught at a turn's end, shows its review line in the conversation once
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, tests/review.test.ts, tests/harness.ts, CHANGELOG.md]
forbid: []
red_test: tests/review.test.ts: a reviewer hand-back with no spawn record, caught at turn.complete, appends its review row to the conversation (w.appended) and wakes the brain once (fails today: nothing is appended)
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

MOD-224's orphanReview adopts a reviewer's hand-back whose spawn record is gone. On the Agent hand-back path (the tool.call hook) the returned line is added to the result's context, so the brain sees it. On the turn.complete path the line is written to the ledger and the spawn record, but the return value is dropped, so the brain never sees the review land unless it calls the verdict tool. MOD-258's worker found this.

## Done when

- At turn.complete, when `orphanReview` returns a line, that line is appended to the conversation with `appendRow` and wakes the brain with `wakeBrain`, the way a background worker's verdict row is posted on that path, and is stored as the attempt's posted row so the verdict tool returns it.
- A review is shown once: when the same review is seen on both the Agent hand-back path and the turn.complete path, only the first shows its line. The second adds nothing (`orphanReview` already returns nothing for an attempt a review accepted; the test checks a refuting review too).
- Nothing changes on the Agent hand-back path: its line still goes in the result's context, and MOD-258's orphanReview tests pass untouched.
- A block that matches nothing, or names another attempt or sha, appends nothing at turn.complete, as today.
- The red test above, plus a test that a refuting orphan review shows its row once at turn.complete.
- CHANGELOG.md gets an `## Unreleased` entry under `### Fixed`. Gates validate, node and test are green.
