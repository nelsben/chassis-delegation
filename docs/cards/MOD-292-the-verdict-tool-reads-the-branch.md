---
id: MOD-292
title: The verdict tool reads the branch before the ledger: a task whose head is in main reports merged, and a hand-back after a pause-cap charge is verified instead of staying no-report
domain: mod
tier: standard
status: merged
issue: 392
scope: [hooks/register.ts, hooks/lib/attempts.ts, hooks/lib/verdicttool.ts, hooks/lib/verify.ts, hooks/lib/review.ts, hooks/lib/quiet.ts, hooks/lib/handback.ts, tests/node/mergedverdict.node.mjs, tests/mergedverdict.test.ts, tests/harness.ts, CHANGELOG.md]
forbid: [hooks/lib/allow.ts, hooks/lib/ghguard.ts, hooks/lib/scheduler.ts, hooks/lib/configeff.ts, docs/cards/**]
red_test: node --test tests/node/mergedverdict.node.mjs (fails now: the file does not exist; passes when a merged head with a no-report row reports merged and never advises resume)
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

A worker paused three times, the pause cap charged the third pause as an attempt and the row stayed no-report; the brain finished and merged the branch by hand, and a later verdict call still said "no-report, next=resume agent=..." with a spend figure for work already on main (#392). There is no way to record "completed outside the worker", so the row stays wrong and a resume on a dead agent is advised.

## Done when

- Before composing its line, the verdict tool checks whether the task's branch head (or any attempt sha of the task) is an ancestor of origin/<default branch> with the existing merge-base --is-ancestor read (the retire probe in hooks/register.ts already runs it); when it is, the line reads `<task>: merged at <sha7>` and an accept row is recorded on the ledger for that attempt, whatever the attempt rows say
- A hand-back that arrives after a pause-cap charge (the attempt's row is no-report with the pause-cap reason) is verified against the worktree like any hand-back (red, scope, files, gate) and its verdict, consistent or refuted, replaces the no-report row for that attempt: the pause cap changes the count, not the outcome
- The verdict line for a merged task never advises next=resume, names no agent and prints no spend-to-resume figure
- A pure helper decides the line from (ancestor: boolean, rows) and lives in hooks/lib/verdicttool.ts or hooks/lib/attempts.ts, tested in a new tests/node/mergedverdict.node.mjs: a merged head with a no-report row reports merged and never resume; a pause-cap no-report row followed by a hand-back becomes consistent or refuted, not no-report
- An engine test in tests/ covers the wiring once; every engine test imports test from tests/harness.ts; the CHANGELOG gains one line under Unreleased / Fixed
- hooks/lib/allow.ts, hooks/lib/ghguard.ts and hooks/lib/scheduler.ts are untouched; the validate, node and test gates are green

## Review

Brain review: mergedNow runs the existing merge-base --is-ancestor read for the worktree head and each attempt sha before the rows are read; a hit returns `<task>: merged at <sha7>`, retires the last attempt and appends one accept row, no resume, no agent, no spend; a hand-back with a report after a pause-cap charge reopens the same attempt through resumedIfNew like the malformed-report path, so the verifier's verdict replaces the no-report row. Pure mergedVerdict and reopensAfterPauseCap in verdicttool.ts with node and engine tests. First attempt, $0.91. Note: the ancestor read now runs on every verdict call (head plus up to budget shas), all read-only and cached by git; fine.
