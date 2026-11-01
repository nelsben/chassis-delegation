---
id: MOD-250
title: An Agent spawn that only mentions a closed task's brief path is not counted as a new attempt of that task
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/brief.ts, hooks/lib/review.ts, tests/spawn.test.ts, tests/harness.ts, tests/node/**, CHANGELOG.md]
forbid: []
red_test: tests/spawn.test.ts, three cases: an Agent spawn whose prompt only mentions .delegation/briefs/MOD-9.brief.md in passing after MOD-9 merged is not briefed as MOD-9 (fails today: it is recorded as attempt 2/2); a spawn whose prompt names the brief path in relative form right after a dispatch passes is briefed; a spawn carrying an inline [[brief …]] header is briefed
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

After MOD-232 merged, a research scout whose prompt quoted the path of .delegation/briefs/MOD-232.brief.md was recorded as 'MOD-232 started · attempt 2/2', then resolved at hand-back as 'hand-back after the task closed; nothing owed'. The spawn matcher treats any mention of a brief path as a briefed worker, whatever the task's state.

## Done when

- A spawn is treated as a briefed worker for task T only when (a) its prompt names T's brief path in any form findBriefPath in hooks/lib/brief.ts (near 202-213) accepts, or carries an inline brief header, AND (b) T's K.handoff.at is later than T's last accept or merged ledger row (a dispatch happened since the task last closed). Review-marker spawns are decided by matchReview first, unchanged.
- A spawn that fails (b) is an ad hoc agent: not briefed, no attempt counted, with one quiet line `MOD-n is closed; this agent runs ad hoc` in the brain's result text.
- A spawn right after a passing dispatch (the normal flow) is unaffected.
- Engine tests cover the three red cases and the review-marker case.
- CHANGELOG.md gets an Unreleased line.
- Gates validate, node and test are green.
