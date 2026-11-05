---
id: MOD-300
title: A by-hand verify of a worktree head (`dispatch verify=<sha>`) does not spend an attempt of budget=: only spawns and resumes count, so one refuted verify no longer exhausts a two-attempt card before the worker can resume
domain: mod
tier: standard
tier_reason: One filter change, but three call sites and a row text in register.ts; the engine test needs the verify-by-hand sequence
status: merged
scope: [hooks/lib/attempts.ts, hooks/lib/verify.ts, hooks/register.ts, tests/node/budgetcount.node.mjs, tests/budgetverify.test.ts, tests/harness.ts, CHANGELOG.md]
forbid: [hooks/lib/allow.ts, hooks/lib/ghguard.ts, hooks/lib/scheduler.ts, hooks/lib/configeff.ts, docs/cards/**]
red_test: node --test tests/node/budgetcount.node.mjs (fails now: the file does not exist, and budgetCount counts a verify record; passes when spawn+verify counts 1)
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

On MOD-299 the worker handed back once (attempt 1, refuted on sha), the brain ran `dispatch verify=<sha>` on the work-present head (recorded as attempt 2, kind verify, refuted), and the next dispatch was refused with `budget exhausted for MOD-299 (2 attempts)` although the worker had run once. A verify record is the brain judging work that is already there; it runs no worker and should not count against the attempts the card paid for. budgetCount in hooks/lib/attempts.ts counts every ladder record except a failed explore and a blocked one.

## Done when

- budgetCount in hooks/lib/attempts.ts excludes records with kind `verify` (a by-hand or synthetic verify of an existing head, including a rejudge); spawn, resume and review records count as before; the explore-failed and blocked exclusions are unchanged
- Every budget check uses budgetCount: gateSpawn's `p.counted` and resumeTarget's `attempts` in hooks/register.ts, and the exhausted branch in hooks/lib/verify.ts; after a spawn refuted and one verify refuted on a budget=2 card, a dispatch spawns attempt 3 and a SendMessage resume is not denied
- budgetDenyMessage and the `(the ladder resumes from attempt <n>)` clause keep naming the counted attempts; the verdict row's `attempt <n>/<budget>` fraction for a verify record shows the counted number with the word verify, e.g. `attempt 2 (verify, counted 1/2)`, so the number the person sees matches the budget check; the single-issue text of every other row is unchanged
- tests/node/budgetcount.node.mjs: spawn+verify counts 1; spawn+verify+resume counts 2; a failed explore still does not count; a rejudge verify does not count; tests/budgetverify.test.ts (one engine test importing test from tests/harness.ts): spawn refuted, `/dispatch <id> --verify <sha>` refuted, then a dispatch of the same card is not refused on budget; CHANGELOG.md gains one line under Unreleased / Fixed
- hooks/lib/allow.ts, hooks/lib/ghguard.ts, hooks/lib/scheduler.ts and hooks/lib/configeff.ts are untouched; the validate, node and test gates are green

## Review

Diff read at 035b2d4: attempts.ts budgetCount now excludes kind=verify records; verify.ts attemptFraction gives verify rows the text "attempt N (verify, counted k/M)"; register.ts passes kind and counted through. The three budget call sites were already on budgetCount, so one refuted by-hand verify no longer exhausts a two-attempt card. New node and engine tests; the engine test seeds store records then spawns rather than running --verify. Four pinned assertions in tests/hooks2.test.ts and tests/hooks4.test.ts updated under a granted amend (legitimate: the old attempt=N/M text on --verify rows). First attempt, $0.43.
