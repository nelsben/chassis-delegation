---
id: MOD-24
title: A repo=here card that shares a resource with an in-flight card is queued, not refused, and the band's queued line names the resource it waits for
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/scheduler.ts, hooks/lib/band.tsx, hooks/lib/live.ts, hooks/types/**, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/lib/allow.ts, hooks/lib/verify-native.ts, hooks/lib/gitguard.ts, hooks/lib/brain.ts, hooks/lib/version.ts, hooks/lib/legacy.ts, bin/**]
red_test: engine tests in tests/hooks.test.ts: two repo=here cards with disjoint scopes that share resource blender-live: the second dispatch prints the waiting line and no refusal; two repo=here cards with overlapping scopes are still refused; a band item for a resource-waiting card renders `waits for blender-live (held by OPS-8)`; red first
gate: validate, node, test
budget: 2-attempts
spend: 5
---
## Why

MOD-23 made resources part of the repo=here overlap check, which refuses at dispatch unless --force-overlap is given. The overlap refusal exists because two repo=here cards with overlapping scopes would corrupt each other's dirty-tree delta; a shared resource is a different thing, and the queue already handles it (the second card waits and becomes ready when the first hands back). Refusing makes the brain retry by hand for something the mod can just sequence, which is what the adopter asked for in public issue #33: one worker per app, enforced by the queue. Separately, the band above the prompt still says "starts when a worker slot frees" for a card waiting on a resource; the state section and the dashboard already name the resource.

## Done when

- a repo=here dispatch whose only overlap with an in-flight repo=here card is a shared resource is queued with the MOD-23 waiting line (`queued: <id> — waiting for resource <name> (held by <other>)`) and no refusal; a scope overlap is still refused exactly as before, and --force-overlap is still needed for that
- the band item for a queued card carries the resource it waits for, and the band's queued line reads `waits for <name> (held by <id>)` instead of `starts when a worker slot frees` when it does; a card waiting for a slot reads as before
- README's resource paragraph and the overlap paragraph say which one queues and which one refuses; CHANGELOG entry
