---
id: MOD-235
title: A worker's own engine-suite run takes the engine lock, so it never overlaps a verifier's or merge's run
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/gates.ts, hooks/lib/drive.ts, tests/verifylock.test.ts, tests/harness.ts, tests/node/**, CHANGELOG.md]
forbid: []
red_test: tests/verifylock.test.ts: a brain-spawned worker's Bash `claude plugin test .` issued while a verifier holds the engine turn does not start until the turn is released (fails today: it runs at once); the worker is spawned with the harness's brainSpawn so workerCall sees it
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Only verifiers and merge take the engine turn (takeEngineTurn callers in hooks/register.ts near 5313, 5358, 3022); a worker's self-check `claude plugin test` runs unlocked, overlaps another verifier on this loaded machine, produces 5 s timeouts and triggers timeoutRerun, so the suite runs twice. Holding the worker's run behind the same lock removes that overlap.

## Done when

- A new pure function in hooks/lib/gates.ts (beside isEngineGate) says whether a Bash command runs the engine suite: a plain `claude plugin test …`, the same after `timeout N`, `env X=1` or `npx`, and inside `&&`, `;`, `|` chains and `bash/sh/zsh -c` bodies, using the existing cutText/lexer in hooks/lib/drive.ts rather than a new parser; node tests cover each form.
- The tool.call hook for a briefed worker's Bash (not the brain's, not an ad hoc agent's) takes the engine turn through takeEngineTurn before next(e) when that function matches, and releases it after the result returns or throws.
- takeEngineTurn gains an optional maxWaitMs; the worker's wait is gateTimeoutMinutes, after which it returns with the command still run and the Bash result text gains one trailing line `(engine lock not had after <n> min; ran anyway)`.
- Re-entrancy: an in-memory Map<agentId, depth> marks the holder; a nested engine command from the agent that already holds the turn takes no second turn and cannot wait on itself (today's token is per call, so a second call would wait on the first).
- A worker Bash with run_in_background true that runs the engine suite is denied with one line asking for a foreground run, since a background run would release the turn while the suite still runs.
- The brain's own Bash and non-engine worker commands take no lock and are untouched.
- Engine tests in tests/verifylock.test.ts: the red test; a worker `node …` command does not wait; the timeout path runs the command with the trailing line; a nested call does not deadlock; the background case is denied.
- CHANGELOG.md gets an Unreleased line.
- Gates validate, node and test are green.
