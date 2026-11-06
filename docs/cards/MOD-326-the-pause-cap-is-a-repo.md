---
id: MOD-326
title: The pause cap is a repo option (pauseCap, default 3), so repos whose proofs run long are not charged an attempt on the third pause
domain: mod
tier: standard
status: merged
issue: 457
parent: 424
scope: [hooks/lib/waitstate.ts, hooks/lib/repoconfig.ts, hooks/register.ts, docs/configuration.md, tests/node/pausecap.node.mjs]
forbid: []
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/pausecap.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

A worker that waits on its own long job (an emulator proof run) prints a pause line; the third pause in one attempt is charged as an attempt (PAUSE_CAP = 3 in hooks/lib/waitstate.ts) even while that job is alive and progressing. Repos whose proofs routinely outlast two pauses need a higher cap, set once in the repo config.

## Done when

- hooks/lib/repoconfig.ts gains the repo key `pauseCap` (added to REPO_KEYS and the config type): a whole number from 2 to 20; absent means 3; any other value is named in the config errors as `pauseCap: needs a whole number from 2 to 20 (ignored)` and 3 is used. Model it on how `mergeStyle` and `maxWorkers` are parsed and reported.
- hooks/lib/waitstate.ts keeps `PAUSE_CAP = 3` as the default and `pauseRow` and `pauseCapLine` take the cap as an optional field/parameter (default PAUSE_CAP); every place they print `PAUSE_CAP - 1` prints `cap - 1` instead.
- hooks/register.ts uses the repo config's pauseCap (else PAUSE_CAP) at the pause decision (`if (n < cap) return pausedHandback(...)`, else `pauseCharge = pauseCapLine(n, spawn.attempt, cap)`), in pausedHandback's full and quiet rows and its debug line. For a task of another local repo the cap is that repo's config if the code already resolves that repo's config there, else this repo's.
- docs/configuration.md gains a `pauseCap` row in the same table and format as the `mergeStyle` row: repo, default `3`, what it does (pauses per attempt before the next is charged as an attempt; a worker may pause cap minus one times).
- tests/node/pausecap.node.mjs is the red test: it checks through the repoconfig parser that pauseCap 5 is read as 5, absent reads 3, 1 and 21 and 'x' each give the error line and 3; and that `pauseCapLine(5, 1, 5)` names 'pause 5' and '4 times', and `pauseRow({..., n: 2, cap: 5})` prints 'pause=2/4'. Model it on tests/node/mergestyle.node.mjs.
- No home-folder paths in any test.
- The validate, node and test gates are green.

## Review

Brain review: diff read. pauseCap parsed like mergeStyle (2..20, default 3, error line on anything else), threaded through cfg to the pause decision, both pause rows, the debug line and pauseCapLine. A task of another local repo uses this session's repo cap (the card allowed it). The worker took red after writing the fix by reverting and re-running; red file is real.
