---
id: MOD-23
title: Exclusive resources and fan-out: a card can name resources it holds (one live app at a time) and the queue enforces it; the card tool writes several research lanes from one sentence with disjoint output folders and a shared forbid
domain: mod
tier: standard
status: merged
scope: [hooks/lib/card.ts, hooks/lib/dispatch.ts, hooks/lib/brief.ts, hooks/lib/scheduler.ts, hooks/lib/live.ts, hooks/lib/dashboard.ts, hooks/lib/pane.tsx, hooks/lib/compaction.ts, hooks/register.ts, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/lib/allow.ts, hooks/lib/verify-native.ts, hooks/lib/gitguard.ts, hooks/lib/brain.ts, hooks/lib/version.ts, hooks/lib/legacy.ts, bin/**]
red_test: pure tests: two queued cards that both hold blender-live: the second waits naming the first; a card with no resources is not held up; the card tool's lanes splitter writes two cards with ids N and N+1, the shared forbid, and refuses overlapping lane scopes naming both; engine tests in tests/hooks.test.ts: dispatching a second card holding a held resource prints the waiting line and spawns nothing, and the first card's hand-back carries ready: for the second; red first
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Public issue #33 (ask B) and #32 (ask 3). Two research lanes could not run at once because there was one live Blender with one open file; today that is a line the brain writes into every brief and hopes is followed. And research usually fans out: two or three workers at once, each owning an output folder, all wanting the same shared notes file, which the brain had to coordinate by hand. The mod already queues, checks overlap and enforces scope and forbid; what is missing is a resource name the queue understands and a way to write N lanes from one sentence. Depends on the research-cards card (outdir, absolute scope).

## Done when

- a card may carry resources: [names] (free-form, e.g. blender-live); the brief header carries resources=; a dispatch or a brain spawn of a card whose resource is held by a running attempt is queued with `queued: <id> — waiting for resource <name> (held by <other id>)`, and the hand-back that frees the resource carries the ready: line for it; the dashboard's worktree table and its text fallback show the resource a worker holds
- the card tool takes lanes: [{ title, scope, doneWhen? }] beside the shared fields; it writes one card per lane with sequential ids, the shared why, gate, tier, resources and forbid, and each lane's own scope and outdir; it refuses, naming both, when two lanes' scopes overlap; the dry run prints every lane's header
- the overlap check that already guards repo=here cards treats resources as overlap
- the delegation-state posture line (MOD-15) also covers a pending review spawn block (MOD-21): make the reviewer's Agent call without asking, like a ready row or a respawn block; and a row waiting on a resource is named with what it waits for
- README (resources, fan-out with a worked example of two extraction lanes sharing a forbid on the notes file) and CHANGELOG
