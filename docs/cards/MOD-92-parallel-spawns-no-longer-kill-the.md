---
id: MOD-92
title: Parallel spawns no longer kill the hooks worker: the agent.spawn hook decides one spawn at a time, stays inside its budget, and honours its abort signal
domain: mod
tier: frontier
status: merged
scope: [hooks/register.ts, hooks/lib/scheduler.ts, hooks/lib/serial.ts, tests/hooks.test.ts, tests/serial.test.ts, tests/scheduler.test.ts, docs/internals.md, CHANGELOG.md]
forbid: [docs/cards/**, hooks/lib/allow.ts, hooks/lib/version.ts, hooks/lib/retention.ts, hooks/lib/cleanstop.ts, .claude-plugin/**, hooks/templates/**, bin/**, .chassis-delegation.json, README.md, docs/upgrading.md]
red_test: write the three-concurrent-spawns engine case in tests/hooks.test.ts first and run `claude plugin test {worktree}`: it fails on the current hook (a shared attempt number, a slot over maxWorkers, or the decision overrunning); if the current hook passes it, write the abort case and show that one red instead; save that run as the red evidence; red first
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Issue #168 (P1): with two briefed workers live, the brain made three Agent calls in one message. The first failed with `chassis-delegation ignored its signal 2 times in a row: a runaway plugin in the hooks worker`, the host killed the hooks worker, and the chassis-delegation MCP server disconnected for the rest of the session (card, dispatch and verdict gone; running workers could not be verdicted until a restart). The host gives a hook 10 s per dispatch (HookBudget.ms), aborts `next.signal` at the end of it, and allows 5 s of linger (HookBudget.lingerMs); a hook that runs on past that twice in a row is a runaway. So the agent.spawn path ran past its budget and did not stop when aborted, at least when three spawns arrived at once. The cause is not known yet: candidates are three decisions racing on the same store records (liveState, the queue, the attempt count), a long loop or CPU-bound walk on the spawn path, or awaits that ignore next.signal. The session was on 0.9.14 with the store near its cap, which may have made every store call slower.

## Done when

- FIND. The worker reads the agent.spawn path end to end (the hook in register.ts, decideSpawn, decideReview, the queue and slot check, and everything they await) and names in the report what can run past 10 s or ignore an abort, with evidence (a timed engine test, or a measured loop). The report says plainly if the cause could not be pinned, and what was ruled out.
- SERIAL. Concurrent agent.spawn events are decided one at a time: a module-level promise chain (or a small pure helper in a new hooks/lib/serial.ts) so that the second spawn's decision sees the first's record, the slot count, the queue and the attempt number. Three spawns in one message with maxWorkers 2 and two workers live give exactly one start or queue each, with no shared attempt number.
- BUDGET. Work that need not decide the spawn (drift checks, probes, rows, cost samples, anything else found) runs after the decision is returned or is bounded; every long await on the path passes `next.signal` or checks it, so an aborted hook returns within the linger time. A spawn whose decision cannot finish in budget is denied with one clear reason (`<id>: the spawn decision ran out of time; make the Agent call again`) rather than overrunning.
- TESTS. tests/hooks.test.ts gets engine cases: three agent.spawn events dispatched at once with two live workers and maxWorkers 2 (each decided once, in order, the slots honoured); an aborted signal during a decision returns promptly. Pure cases for the serial helper if one is added, in tests/serial.test.ts. The three gates pass.
- DOCS. docs/internals.md's Known issues section loses any line this fixes, and says that the MCP server's disconnect after a hooks-worker kill is the host's behaviour (a restart brings the tools back). CHANGELOG.md gets one entry under `## Unreleased` naming #168, kept below any entry already there.

## Review

Read the whole diff. The mod's own spawns pass through the hook before the queue (selfDecided), so spawnSelf holding a turn cannot deadlock on its own hook. Before commit() every await in decideSpawn, decideReview, gateSpawn and claimSlot is raced against the stop, and claimSlot checks again inside the lock, so a stopped decision leaves holding no slot and having written nothing. After commit() a stop only skips the views, so a started subagent is always recorded. A decision stopped while waiting its turn throws at its first check when the turn arrives. The budget watch re-reads next.budget.remainingMs each time it fires, so free waits on the host are not counted twice. The overrun itself was not reproduced; the three engine cases cover the ordering, the abort and the budget refusal. Accepted.
