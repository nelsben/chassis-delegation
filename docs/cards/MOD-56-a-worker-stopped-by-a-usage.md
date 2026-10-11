---
id: MOD-56
title: A worker stopped by a usage limit is recorded as rate limited: the verdict row and the ledger say so, and the queue holds until the brain dispatches again
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/verify.ts, hooks/lib/attempts.ts, hooks/lib/scheduler.ts, hooks/lib/live.ts, hooks/lib/dashboard.ts, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/templates/**, bin/**, hooks/lib/verify-native.ts, hooks/lib/allow.ts]
red_test: the pure detector tests and the engine test for the rate-limited row fail on main; red first
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Issue 108 finding 5: a worker stopped mid-run on HTTP 429, "You've hit your weekly limit", after committing complete work. Its verdict was no-report with next=verify sha=, the right step, but the cause showed only in the task notification, not in the verdict or the ledger, and the queue would have announced the next task ready into the same limit.

## Done when

- first read the engine's turn.complete event type (the plugin-authoring skill's reference for function hooks) and use an error or stop field if the event carries one; otherwise a pure function (in hooks/lib/verify.ts or hooks/lib/attempts.ts, its markers a named list) reads the hand-back text for a usage-limit stop: `429`, `hit your weekly limit`, `usage limit`, `rate limit`, case-insensitive; only a hand-back with no [[report]] block is read, so a worker writing rate-limit code is never taken for a stopped one
- such an attempt's record and its ledger row carry stop: rate_limited (and resetsAt when the text names a reset time); its verdict row reads `no-report (rate limited[, resets <time>])` and keeps today's next= (verify sha= when work is present)
- while the last worker in this session stopped rate limited, a freed slot does not announce a queued task ready: the line reads `held: <task> queued; the last worker stopped on a usage limit at HH:MM[, resets …]; dispatch it when the limit resets`, and the hold clears on the next spawn the brain makes
- tests: pure tests for the detector (each marker; a hand-back with a report is never read) and for the row; an engine test that a hand-back carrying the 429 text and no report gives the rate-limited row and a ledger row with stop; README (How a report is verified) and a CHANGELOG entry under Unreleased; the three gates pass
