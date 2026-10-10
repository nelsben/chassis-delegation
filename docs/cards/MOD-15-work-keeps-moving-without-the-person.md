---
id: MOD-15
title: Work keeps moving without the person: a verdict wakes the brain as its own turn, the brain is told to make ready and respawn calls without asking, and a worktree row left unclaimed self-spawns after a timeout
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/scheduler.ts, hooks/lib/compaction.ts, hooks/lib/brain.ts, hooks/lib/quiet.ts, hooks/lib/attempts.ts, .claude-plugin/plugin.json, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/types/**, .chassis-delegation.json, docs/**, hooks/lib/allow.ts, hooks/lib/verify-native.ts, hooks/lib/gitguard.ts, hooks/lib/card.ts, hooks/lib/setup.ts, hooks/lib/dispatch.ts, hooks/lib/update.ts, hooks/lib/cleanstop.ts, hooks/lib/findings.ts, hooks/lib/redact.ts, hooks/lib/debriefcheck.ts, hooks/lib/version.ts]
red_test: engine tests in tests/hooks.test.ts: a verified hand-back leads to exactly one $.prompt.submit whose text holds the verdict row and next=accept, with no asUser; with wakeOnVerdict false there is none; a hand-back that frees a slot submits the ready: line; the prompt.compose section carries the posture line while a row is ready and not otherwise; with readyFallbackMinutes 1 and the clock advanced, a ready worktree row is self-spawned and recorded with source fallback, while a ready repo=here row is not spawned and its line names the wait; the node spawn test accepts the fallback caller; red first
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Since 0.7.0 dispatch prints an Agent call the brain makes, so the queue and the respawn ladder are advice. Two gaps stall work: the verdict row reaches the brain only inside the person's next message (the founder had to type something about a dozen times on 2026-10-10/11 just to wake the brain after a hand-back), and nothing tells the brain to act on a ready: line or a respawn block without asking. The engine offers $.prompt.submit({ text }), a turn of the brain's own once the session is idle, which the model reads as "The chassis-delegation plugin sent a message". For a brain that still does not act, or a session left idle, a timer fallback self-spawns the row the old way, limited to worktree rows: a self-spawned worker runs outside the mod's hooks (no git guard, no effort, cost only at the end), and a repo=here worker shares the person's checkout, so it always waits for the brain.

## Done when

- after the mod posts a verdict row, it calls $.prompt.submit once with that row and the next action (accept, resume, the ready: line, or the respawn spawn block), never asUser; a new boolean option wakeOnVerdict (default true) turns it off; one submit per verdict, none for a verdict the brain itself produced by --verify in its own turn, and none while the person is mid-prompt (the engine queues it until idle)
- the delegation-state section prompt.compose adds carries one posture line while any row is ready or a respawn block is pending: make a ready: row's spawn call or a respawn block's Agent call without asking the person; ask only when a verdict is refuted on a claim the brain cannot amend, over-spend, or needs an amend approved
- a ready row left unclaimed for readyFallbackMinutes (new option, default 10; 0 means off) is self-spawned through spawnSelf exactly as before MOD-12 when its brief is a worktree brief; it is recorded with source fallback and the row says it ran outside the mod's hooks (no git guard, no effort setting, cost known only at the end); a repo=here or repo=none brief is never self-spawned and its ready line instead says how long it has waited
- the MOD-12 node test that pins spawnSelf callers allows the fallback path as a third named caller and still fails on any other
- README (the Spawn contract, the queue, a Waking the brain paragraph, the two options) and CHANGELOG; the manifest declares wakeOnVerdict and readyFallbackMinutes
