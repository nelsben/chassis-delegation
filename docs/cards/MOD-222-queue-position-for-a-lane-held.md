---
id: MOD-222
title: Queue position for a lane held by the total maxWorkers cap, as for a tier cap
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/scheduler.ts, tests/*.test.ts, tests/node/*.mjs, CHANGELOG.md]
forbid: [hooks/lib/allow.ts, hooks/lib/version.ts, .claude-plugin/plugin.json, docs/cards/**]
red_test: claude plugin test . (a new tests/dispatchsays.test.ts case fails now: maxWorkers 1 with 3 dispatches shows no position)
gate: validate, node, test
budget: 2-attempts
spend: 6
---
## Why

MOD-219 added `queued: position <k> of <n> (<tier> cap <m> running)` to dispatch's queued result, but only when a tier cap (maxWorkersByTier) holds the lane. A lane held by the total maxWorkers cap still gets no position, which is the case the adopter's card also named ("or any slot cap").

## Done when

- When the total `maxWorkers` cap (not a tier cap) holds a lane, dispatch's queued result and its already-queued result end with ` — queued: position <k> of <n> (maxWorkers <m> running)`, where k is the lane's place in the queue, n the queue length and m the maxWorkers value. In hooks/register.ts this is `capHeld` (about line 1976), which today returns undefined when no tier holds the slot; in hooks/lib/scheduler.ts `tierQueueText` (or a renamed helper) builds the text for either cap.
- A lane held by a tier cap keeps its MOD-219 text exactly: ` — queued: position <k> of <n> (<tier> cap <m> running)`.
- A lane queued for a held resource (resourceDeny) gets no position text; that wording is unchanged.
- `alreadyQueuedPart` still finds the already-queued part when the suffix follows it.
- tests/dispatchsays.test.ts gains a case: maxWorkers 1, no tier caps, 3 dispatches give positions 1 of 2 and 2 of 2 with `(maxWorkers 1 running)`, and a repeat dispatch of a queued lane shows its position. Existing exact-string assertions that the new suffix changes are updated to include it, and only those.
- CHANGELOG.md gains a Fixed entry under `## Unreleased` naming MOD-222. validate, the node tests and the engine suite pass.

## Review

The total maxWorkers cap now gets "queued: position k of n (maxWorkers m running)" and the tier-cap text is unchanged. The positions follow MOD-219's count at the time of each dispatch (1 of 1, then 2 of 2); the card's literal 1 of 2 was the brain's arithmetic slip. Seven exact-string assertions were updated for the suffix. Accepted.
