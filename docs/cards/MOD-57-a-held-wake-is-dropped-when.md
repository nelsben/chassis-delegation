---
id: MOD-57
title: A held wake is dropped when the brain has already sent its worker a message after the wake was held, so a resume after a consistent verdict does not bring back a stale next=accept
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, tests/**, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/templates/**, bin/**, hooks/lib/verify-native.ts, hooks/lib/allow.ts, hooks/lib/gitguard.ts]
red_test: the new resume-after-consistent case in tests/wakes.test.ts fails on main because the stale wake is submitted; red first
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

MOD-51 drops a held wake when its task has a later attempt record. A resume after a refute records the next attempt when the brain's SendMessage is delivered, so that case is covered. A resume after a consistent verdict is recorded only when the worker hands back (MOD-41), so if the brain resumes the worker in the same turn the verdict landed in, the held `next=accept` wake still reaches the brain at the turn's end while the worker is busy on attempt 2. This happened twice on 2026-10-12, for MOD-52.

## Done when

- a held wake records when it was held; the SendMessage hook in hooks/register.ts records, for each delivered message to an agent, the agent id and the time, whether or not it records a new attempt
- flushWakes drops a held verdict wake whose spawn's agentId was sent a delivered message after the wake was held, with a debug line `wake skipped: <task> attempt N: the brain already messaged its worker`; its ready lines are still delivered, as MOD-51 does
- a message sent before the wake was held does not drop it, and a wake for another agent is unaffected; the records are cleared when the wakes are flushed
- engine test in tests/wakes.test.ts: attempt 1 consistent while the brain's turn is open, the brain resumes the worker with SendMessage in the same turn, the turn ends: no wake is submitted; and a control where the SendMessage went to a different agent: the wake is submitted
- a CHANGELOG entry under Unreleased; the three gates pass
