---
id: MOD-253
title: The reviewer template stops re-running the test suite and asks for the review line with attempt and sha
domain: mod
tier: standard
status: merged
scope: [hooks/templates/review.md, hooks/lib/review.ts, hooks/register.ts, tests/review.test.ts, tests/node/**, CHANGELOG.md]
forbid: []
red_test: tests/review.test.ts: a review brief for a verdict whose gates passed carries the verdict's gate claim lines and output tail, and the template tells the reviewer not to re-run the suite (fails today: the reviewer is told to run it)
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

The reviewer re-runs the engine suite (about 2 minutes under the engine lock) to confirm what the verifier already recorded. reviewKeys in hooks/lib/review.ts (near 209-210) already appends the attempt and sha instruction at runtime, so only the template's suite instruction and what the brief carries need to change.

## Done when

- prepareReview (hooks/register.ts near 8444-8480) puts the verdict's gate claim lines and the gate output tail into the review brief under a `## Verifier's gate record` heading.
- hooks/templates/review.md tells the reviewer to read that record and not re-run the suite unless a finding depends on an output the record does not show; the last line keeps the report instruction.
- parseReviewBlock accepts the brief with the new section (no change to the review block grammar).
- CHANGELOG.md gets an Unreleased line.
- Gates validate, node and test are green.
