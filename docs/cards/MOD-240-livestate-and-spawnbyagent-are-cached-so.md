---
id: MOD-240
title: liveState and spawnByAgent are cached, so a worker's tool call and every live-state caller stop re-reading the store per agent
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, tests/live.test.ts, tests/identity.test.ts, tests/gitguard.test.ts, tests/harness.ts, tests/node/**, CHANGELOG.md]
forbid: []
red_test: tests/live.test.ts: a second liveState call with no state change, in a session with 30 finished agents and 1 live one, makes at most 2 store.get calls (fails today: 60+); the harness gains a w.storeGets counter
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

liveState (hooks/register.ts near 1978) loops over every agent in $.agent.list(), finished ones included, with two store.gets each via spawnByAgent (near 6462-6472), and has seven callers; a worker's Bash tool call resolves spawnByAgent 4-5 times across separate tool.call registrations (reviewerGuard, noteWrites/bashCwd, the identity hook, the git and gh guards). A time-based cache of liveState itself is unsafe (claimSlot reads it under the scheduler lock and agent status changes are not store writes), and a branchOf cache would let a `git switch` followed by `git commit` within the window bypass the branch guard, so neither is done here.

## Done when

- spawnByAgent checks the in-memory remembered map first (briefed workers only), and otherwise caches its result, including a negative result for ad hoc and review agents, per agentId for 5 s; any storeSet of a K.spawn or K.agent key clears the whole per-agent cache.
- liveState keeps a per-agent note of a spawn read as closed; an agent whose spawn was read as closed, with no K.spawn or K.agent write since and whose status is not 'running', is skipped without a store read; the first liveState after start still reads each agent once; agents with no spawn record are remembered as such.
- liveState's exclude argument and its result semantics are unchanged; no time-based cache of the liveState result is added.
- branchOf is unchanged.
- An engine test asserts a worker Bash tool call resolves its spawn with at most 2 store.get calls across all tool.call hooks.
- CHANGELOG.md gets an Unreleased line.
- Gates validate, node and test are green.
