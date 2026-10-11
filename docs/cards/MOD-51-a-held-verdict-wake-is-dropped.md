---
id: MOD-51
title: A held verdict wake is dropped at delivery when its task has moved on: a later attempt exists, or the task is merged or accepted, whatever the verdict
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/attempts.ts, tests/**, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/templates/**, bin/**, hooks/lib/verify-native.ts, hooks/lib/allow.ts, hooks/lib/gitguard.ts]
red_test: tests/wakes.test.ts case (1) fails on main because both wakes are submitted at turn end; red first
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

On 2026-10-12 a refuted wake for a task's attempt 1 reached the brain after the brain had already amended the brief and attempt 2 had passed. MOD-42 holds wakes while the brain's turn is open and, at the turn's end, drops only a consistent wake whose task is merged; a refuted, no-report, unverified or over-spend wake is always delivered, even when the brain resumed or respawned the worker in the same turn, so the brain gets a stale next=resume after the fact. Issue 108 counted 25 brain turns at about 460K context each spent answering wakes like these.

## Done when

- flushWakes in hooks/register.ts drops a held wake when the task's attempt records (same task, subtask and lane) hold an attempt numbered above the wake's spawn.attempt, whatever that attempt's verdict, with a debug line `wake skipped: <task> attempt N superseded by attempt M`
- flushWakes also drops a held wake of any verdict (refuted, no-report, unverified, over-spend) whose task is merged or accepted by delivery time, by the same retire check MOD-35 uses, not only a consistent one
- a ready: line held with a dropped verdict is still delivered: the held entry keeps the verdict row and its ready lines apart (or an equivalent), and a held wake with nothing left to say is not submitted
- a held wake that is neither superseded nor merged is delivered exactly as today, and a wake raised while no brain turn is open is unchanged
- engine tests in a new file tests/wakes.test.ts built on tests/harness.ts: (1) attempt 1 refuted while the brain's turn is open, the brain resumes, attempt 2 consistent in the same turn: at turn end only attempt 2's wake is submitted; (2) a refuted wake whose task is accepted before the turn ends is not submitted; (3) a ready line is submitted alone when its verdict is dropped; (4) a lone refuted wake still wakes the brain
- a CHANGELOG entry under Unreleased; the three gates pass
