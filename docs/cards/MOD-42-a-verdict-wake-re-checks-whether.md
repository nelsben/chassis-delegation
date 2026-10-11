---
id: MOD-42
title: A verdict wake re-checks whether the task is merged when it is about to be delivered, not when the verdict lands
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/scheduler.ts, hooks/lib/attempts.ts, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/templates/**, hooks/lib/allow.ts, hooks/lib/verify-native.ts, hooks/lib/gitguard.ts, hooks/lib/brain.ts, hooks/lib/version.ts, hooks/lib/legacy.ts, hooks/lib/cleanstop.ts, bin/**]
red_test: engine test in tests/hooks.test.ts: a consistent hand-back lands while the brain's turn is open; within that turn the harness reports the task's sha merged; at turn end no prompt.submit is made (fails today: the wake was submitted at the verdict); a refuted hand-back's wake is still submitted at turn end; red first
gate: validate, node, test
budget: 2-attempts
spend: 5
---
## Why

MOD-35 skips a wake when the task is already merged, but it decides at the moment the verdict lands; the engine delivers a plugin's prompt.submit only once the session is idle. Between the two, the brain usually reads the verdict from the ledger and merges in its current turn, so the wake still arrives afterwards with a stale next=accept. Seen live on 2026-10-11 after the 0.8.2 reload: MOD-37 and MOD-40 were merged and their wakes still arrived, batched into one turn. Each one costs the person a turn and reads as an alert for nothing.

## Done when

- instead of submitting at the verdict, the mod keeps pending wakes in session state and submits them at the main loop's turn end (the session going idle), re-running MOD-4's merged check for each just before submitting; a wake whose task is merged (or accepted) by then is dropped with the debug line `wake skipped: <id> merged before delivery`; the rest are submitted as one message, as today
- a wake for a refuted, over-spend, no-report or ready: row is never dropped by this rule; if the session never goes idle before it ends, nothing is lost that the ledger and the state section do not already hold
- an engine test: a consistent verdict lands, the brain's turn then merges the task (the harness reports the sha an ancestor of origin/main), and at the turn's end no wake is submitted; a refuted verdict's wake is submitted; README (Waking the brain) and CHANGELOG
