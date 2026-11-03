---
id: MOD-279
title: Auto mode: a worker's Bash runs as typed (no identity rewrite the classifier cannot review), a host-blocked attempt stops without spending budget, and dispatch shows an exploring pick before the spawn
domain: mod
tier: standard
status: merged
scope: [hooks/**, tests/**, docs/**, CHANGELOG.md]
forbid: []
red_test: a new engine test: a recorded worker spawned with permissionMode auto runs `pwd` and the command reaching the engine is exactly `pwd`; fails today because the MOD-16 hook prefixes export CHASSIS_SESSION_ID
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

An adopter on 0.9.45 in auto mode had every Bash call of a dispatched worker refused: "a hook changed this call's input after auto mode reviewed it". The only worker-Bash hook that changes input is MOD-16's identity hook (hooks/register.ts, `withIdentity` from hooks/lib/identity.ts), which prefixes `export CHASSIS_SESSION_ID=…; ` to every recorded worker's command. The worker could not run git, reported sha=unknown, was refuted as a fabrication, and two attempts were spent on nothing. The same report saw the start notice name haiku while the spawn block said sonnet (MOD-274 exploration rewrites the spawn, not tool calls), and a resume drop the explored effort from medium to low.

## Done when

- The attempt record gains `permissionMode` from the Agent spawn's pinned `permissionMode` (the parent's mode, which the subagent inherits). The MOD-16 identity hook passes a worker's Bash call on unchanged when that mode is `auto`.
- Latch: when `next(e)` for a rewritten worker Bash call comes back denied, or as an error whose text says a hook changed the call's input (match `changed this call's input`), the hook remembers the agent id and passes every later Bash call of that agent on unchanged. The result is returned with one trailing line: `(chassis-delegation: auto mode cannot review a rewritten command; this worker's Bash now runs as typed, without CHASSIS_SESSION_ID — run it again)`.
- The spawn notice of a worker started in auto mode ends with ` · auto mode: Bash runs as typed (no CHASSIS_SESSION_ID)`. docs/configuration.md or docs/guide.md, wherever MOD-16's identity is documented, says this in one sentence.
- Blocked by environment: a worker whose Bash calls were refused by the host (the engine's refusal, not a mod guard's deny; the friction log already records denials per tool) and whose report has no usable sha (`unknown`, `none` or missing) gets the verdict row `blocked by environment: Bash refused by the host (<first 80 chars of the refusal>)` and next=stop. The attempt is not counted against budget= (budgetCount, as for a failed exploratory attempt) and does not escalate. A refuted sha claim is not shown as a fabrication when that is the cause.
- Exploration is visible before the spawn: the `/dispatch` result (dry run and real) prints, above the spawn block, `this attempt explores: <alias>/<effort> (from <alias>/<effort>)` when explorePlan would explore attempt 1. The draw is deterministic, so dispatch computes it with the same rows, class and options the spawn uses. The spawn block's JSON is unchanged.
- A resume of the same agent whose attempt explored keeps the explored alias and effort on its started row and stepEffort (today the resume row showed `effort low` for a haiku/medium exploration).
- No other worker-Bash hook changes the call's input; a test asserts that, in auto mode, the git guard, gh guard, engine-turn and write-log hooks pass `e.command` through unchanged.
- Tests: auto-mode spawn → Bash unchanged; default mode → prefixed as today; the latch after a 'changed this call's input' refusal; the blocked-by-environment verdict with budget intact; the dispatch explore line; the resume keeps the explored effort. CHANGELOG.md Unreleased has one entry, and docs/upgrading.md has an Unreleased note.
