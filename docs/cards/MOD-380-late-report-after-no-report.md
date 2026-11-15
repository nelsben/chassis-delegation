---
id: MOD-380
title: a worker judged no-report that then hands back with a report is judged on the same attempt, uncharged, instead of the report being dropped
domain: mod
tier: standard
status: merged
issue: 524
scope: [hooks/lib/verdicttool.ts, hooks/register.ts, docs/guide.md, CHANGELOG.md, tests/node/latereport.node.mjs, tests/*.test.ts, tests/node/*.node.mjs, tests/harness.ts]
forbid: [bin/**, docs/cards/**, docs/mockups/**, hooks/lib/verify-native.ts, hooks/lib/verify.ts, hooks/lib/attempts.ts, hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, docs/upgrading.md]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/latereport.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

MOD-377's worker stopped once while its background test run was still going, with no report, and was judged no-report. It then finished and handed back a full report. Nothing judged it. The cause is in `resumedIfNew` (hooks/register.ts): a no-report attempt has no sha, so `isResumeAfterJudged` is false, the spawn comes back unchanged, and `claimPost` skips the hand-back as already posted. The advice on the row was `resume agent=…`, which would have spent the last attempt on work that was already done. The brain fixed it by hand with `dispatch verify=<sha>`. The mod should judge the late report itself, the way MOD-292 does after a pause-cap charge.

## Before you start

- `hooks/register.ts`, `resumedIfNew`: the MOD-211, MOD-292 and MOD-226 branches, each of which reopens the same attempt, and the last lines (`isResumeAfterJudged`, `recordResume`). Also `pendingResumeOf` and `claimPost`.
- `hooks/lib/verdicttool.ts`: `reopensAfterPauseCap`.
- `hooks/lib/attempts.ts`: `isResumeAfterJudged`, `attemptsFor`. Read only.
- The tests of MOD-292 (search `pauseCharged` under `tests/`): the engine test here has the same shape.

## Design (decided by the brain; build it, do not redesign it)

- Pure, in `hooks/lib/verdicttool.ts`, beside `reopensAfterPauseCap` (mark it `MOD-380`): `export const reopensAfterNoReport = (last: { verdict: string; sha?: string; agentId?: string; attempt: number } | undefined, spawnAttempt: number, agentId: string, reportSha: string | undefined): boolean`. True when `last` is set, `last.verdict === 'no-report'`, `last.sha === undefined`, `last.attempt === spawnAttempt`, `last.agentId === agentId` and `reportSha` is a non-empty string.
- In `resumedIfNew`, after the MOD-226 branch, once `sha` is parsed and `records` are loaded and before the `isResumeAfterJudged` line: take `last = attemptsFor(records, spawn.subtask, laneOf(spawn)).at(-1)`. When `reopensAfterNoReport(last, spawn.attempt, agentId, sha)`, reopen the same attempt with exactly the steps of the MOD-292 branch (drop the verdict fields from the spawn record, clear the posted mark and the posted row, store it with `lastFailed: false`, return it).
- It comes after `pendingResumeOf`, so a resume the brain dispatched still wins and is still counted as the next attempt.
- An attempt the brain already re-judged by hand has a sha on its record, so it does not reopen.
- The reopened attempt keeps its number. Its new row replaces the no-report row in the count: a card whose worker stopped once without a report and then reported passes on attempt 1, as MOD-292 decided for the pause cap.
- A no-report hand-back followed by another hand-back with no report changes nothing.
- `docs/guide.md`: where a no-report row and its `resume` advice are explained, add one sentence: a worker that hands back a report after a no-report is judged on the same attempt, and nothing is charged.
- `CHANGELOG.md`, `## Unreleased` (make it above `## 0.9.62` when absent), `### Fixed`: one bullet `(MOD-380)`.

## Tests

- `tests/node/latereport.node.mjs` (new, the red test), on `reopensAfterNoReport`: true for the case above; false when the last verdict is `refuted`, when the last record has a sha, when the agent differs, when the attempt differs, and when the report has no sha.
- An engine test beside the MOD-292 one: a briefed worker hands back with no report (row: no-report, attempt 1), then the same agent hands back with a good report. A second row is posted for attempt 1 with the report judged, no attempt 2 is recorded, and budget left is unchanged.
- An engine test that a no-report followed by `dispatch resume` and a hand-back is still attempt 2.

## Left to you

- Fixture texts and test names.

## Done when

- A report handed back by the same worker after a no-report on that attempt is judged, on that attempt, with nothing charged.
- A dispatched resume, a by-hand re-judge and a second hand-back with no report behave as before.
- The guide and the changelog say so, and gate validate, node and test are green.

## Review

Brain review (Opus 5.5): Built as designed. reopensAfterNoReport needs a no-report last record with no sha, on the same attempt and agent, and a report with a sha. resumedIfNew checks it after pendingResumeOf, so a dispatched resume still counts as the next attempt, and an attempt re-judged by hand has a sha and does not reopen. The reopen copies the MOD-292 steps exactly. The engine tests show the two rows on attempt 1 with no attempt 2, and the resume path still gives attempt 2. The fixture choice is sound: a "waiting on" text is a wait state, not a no-report.
