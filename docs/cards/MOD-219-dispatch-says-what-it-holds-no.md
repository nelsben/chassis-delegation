---
id: MOD-219
title: Dispatch says what it holds: no outside-scope warning for read-only red_test paths, queue position for a tier-capped lane, and the verdict says when a gate was reused
domain: mod
tier: standard
status: merged
scope: [hooks/lib/dispatch.ts, hooks/lib/card.ts, hooks/lib/verify-native.ts, hooks/lib/live.ts, hooks/register.ts, tests/*.test.ts, tests/node/*.mjs, CHANGELOG.md]
forbid: [hooks/lib/allow.ts, hooks/lib/version.ts, .claude-plugin/plugin.json, docs/cards/**]
red_test: claude plugin test . (the red_test warning, queue position and reused-gate cases fail now)
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Adopter feedback: a red_test pointing at a read-only validator outside the repo triggers the outside-scope warning; maxWorkersByTier.frontier=2 silently queued 7 of 9 lanes; and a repo=here card's gate reuses the recorded pass (suite not re-run) without the verdict line saying so.

## Done when

- The dispatch and card warnings about paths outside the repo or scope no longer fire for a path named only in red_test= or gate= (those are read); a path in scope=, outdir= or artefacts still warns as today.
- When a lane is held by maxWorkersByTier (or any slot cap), dispatch's result says `queued: position <k> of <n> (<tier> cap <m> running)` and the band row for it shows the position; when it starts, the started line says `started after <minutes> min in queue`.
- A verdict whose gate was taken from the recorded pass instead of re-run carries `gate reused (recorded pass, not re-run)` in the verdict row itself, not only in the detail.
- Tests (engine) cover each: no warning for an outside red_test path, the warning kept for an outside scope path, the queue position line with a frontier cap of 2 and 4 dispatches, and the reused-gate words in the row.
- CHANGELOG.md gains Fixed entries under `## Unreleased` naming MOD-219. validate, the node tests and the engine suite pass.

## Review

Attempt 1's reused-gate trigger keyed on the _empty swap, which runs a gate; sent back and attempt 2 keys it on the verifier's "gate not re-run" claim lines, with tests for both. Scope amend for scheduler.ts and verify.ts approved after reading. Queue position shows for tier caps only (not the total maxWorkers cap); the band row already showed the position. red_test paths outside the repo no longer warn; repo paths outside scope still do.
