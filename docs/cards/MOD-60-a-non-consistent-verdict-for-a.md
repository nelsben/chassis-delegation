---
id: MOD-60
title: A non-consistent verdict for a task already merged or accepted does not wake the brain on arrival, so a stale next=resume stops arriving after a merge
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, tests/**, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/templates/**, bin/**, hooks/lib/verify.ts, hooks/lib/verify-native.ts, hooks/lib/allow.ts, hooks/lib/gitguard.ts]
red_test: the new engine test for a non-consistent hand-back whose sha is already on origin/main fails on main because the wake is submitted; red first
gate: validate, node, test
budget: 2-attempts
spend: 8
---
## Why

Issue 117: the brain verified a task by hand, merged its PR and removed its worktree, and a wake still came saying next=resume for the worker. On arrival the merged check (MOD-35) asks only about a consistent verdict, so an unverified or refuted verdict row for a task already on the default branch still wakes the brain. MOD-51 already drops such a wake when it is held to the end of a turn; the arrival path should do the same.

## Done when

- hooks/register.ts: at a worker's hand-back, the merged check before the wake asks about any verdict (alreadyMerged with anyVerdict true, force left as today), so a verdict row of any kind for a task already merged or accepted is still posted and recorded but does not wake the brain; the debug line stays `wake skipped: <task> already merged`, and any ready lines still wake the brain
- a task not merged and not accepted wakes the brain as today, whatever its verdict
- engine tests beside the MOD-35 merged-wake tests: a non-consistent hand-back (unverified or refuted) whose sha is on origin/main submits no wake, logs the skip and still posts its row; the same hand-back not merged submits its wake; a non-consistent hand-back for a task accepted by hand with /delegation accept submits no wake
- a CHANGELOG entry under a new `## Unreleased` heading above `## 0.9.2 — 2026-10-11` (if another card has already added that heading on main by the time you rebase, put the entry under it); the three gates pass

## Review (attempt 2)

Attempt 1 asked the arrival check about any verdict with sha ancestry counted. A worker that committed nothing reports a base sha already on origin/main, so a refuted no-work hand-back would have been retired as merged, with an accept row and no wake; MOD-35 had kept refuted wakes out of the check for this reason, and MOD-51's delivery-time check already had the gap. Attempt 2's rule: for a consistent verdict, unchanged; for any other verdict, the wake is skipped only when the task is already retired (a merge command the mod saw, or /delegation accept) or its card on origin/main reads `status: merged`. Sha ancestry is not probed for it and never retires the task; a card-only check that finds nothing writes nothing, so the 15-minute retire sweep still checks the sha. The rule applies at arrival and in flushWakes.
