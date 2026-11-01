---
id: MOD-249
title: The band and pane reuse one live model per redraw burst
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, tests/dashboard.test.ts, tests/harness.ts, tests/node/**, CHANGELOG.md]
forbid: []
red_test: tests/dashboard.test.ts: one tick that renders the Pane and then the AbovePrompt band calls liveState once (fails today: twice, each render resolves liveModel on its own)
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

With the band or pane on, each render calls liveModel (hooks/register.ts near 1812; AbovePrompt near 9157, Pane near 9176), which re-runs liveState, readQueue, session usage, readBrain, adhocSpend, planOfQueue, liveLabels and readSpend; the pane adds a second readBrain via readDrive. allRecords and worktreeList are already cached for 15 s; the rest is not.

## Done when

- The band (AbovePrompt) and the pane render from one shared builder whose result is keyed on a generation counter, not on time: the counter advances on any storeSet of a task, spawn, queue or agent key, on redraw(), on a $.context change and on MOD-240's per-agent cache clearing. tests/dashboard.test.ts (near 231-243) changes w.context with no clock advance and must still see the new value.
- Within one generation the second render reuses the built state; a different generation rebuilds.
- Rendered text is unchanged for the same state (existing dashboard and band tests stay green).
- CHANGELOG.md gets an Unreleased line.
- Gates validate, node and test are green.
