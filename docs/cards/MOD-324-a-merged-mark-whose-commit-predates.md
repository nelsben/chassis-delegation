---
id: MOD-324
title: A merged mark whose commit predates the attempt's spawn is no merge, also when the attempt recorded no dispatch base
domain: mod
tier: standard
status: merged
issue: 455
parent: 425
scope: [hooks/lib/verdicttool.ts, hooks/register.ts, tests/node/predates.node.mjs]
forbid: []
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/predates.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

An attempt spawned before 0.9.51 records no baseSha, so the retire probe took the dispatch base (an ancestor of origin/main) as the task's landed commit and marked a paused, still-running task merged. Every later hand-back was then dropped as 'hand-back after the task closed (merged)'. MOD-316 only clears the mark when baseSha is recorded; a commit made before the attempt was spawned can never be that attempt's work, so its committer time is the fallback test.

## Done when

- hooks/lib/verdicttool.ts exports `predatesSpawn(commitSecs: number, atMs: number): boolean`, true exactly when commitSecs * 1000 < atMs and both are finite numbers (a non-finite input is false). It sits next to `landedSha`.
- In hooks/register.ts `retireProbe` takes the attempt's spawn time `at` (ms) as a new optional last parameter. When `baseSha` is undefined, a sha is given and `at` is given, it reads the sha's committer time with `git -C <root> log -1 --format=%ct <sha>` (the same run() helper and 10000 ms timeout as its other git calls); if `predatesSpawn` says true, it skips the ancestry and cherry-mark checks for that sha (the sha is not landed work; the card read, when asked, still runs). When baseSha is defined, behaviour is unchanged (landedSha rules). Every caller that has the attempt record passes its `at`.
- In hooks/register.ts `closedReason`: when the last prior attempt has `retired === 'merged'` and NO `baseSha`, and `mergedSha ?? sha` is a sha, it reads that sha's committer time the same way; if `predatesSpawn(ct, last.at)` the marker is cleared with the same patchRecord fields the MOD-316 branch clears, a debug line `<label>: retire marker cleared: <sha7> predates attempt <n>'s spawn, not the task's commit` is written, and it returns undefined. A git read that fails leaves the old behaviour (returns 'merged').
- tests/node/predates.node.mjs is the red test: it imports `predatesSpawn` from ../../hooks/lib/verdicttool.ts and checks a commit one second before the spawn (true), a commit in the same second as a spawn 500 ms into that second (false), one minute after (false), and NaN inputs (false). Model it on tests/node/blockedcount.node.mjs.
- No home-folder paths in any test (use generic paths such as /repo).
- The validate, node and test gates are green.

## Review

Brain review: diff read. predatesSpawn uses (s+1)*1000 <= at, the conservative reading of a card that contradicted itself on the same-second case (the card's fault, not the worker's). retireProbe skips ancestry and cherry checks for a pre-spawn sha only when baseSha is absent; closedReason clears a pre-0.9.51 merged marker the same way. Nit: closedReason repeats commitPredates inline instead of calling it.
