---
id: MOD-305
title: A file changed in a watched outside root while a worker ran a command that never named that root is listed as foreign, not charged to the worker's write log, so a forbid refute names only paths the worker wrote
domain: mod
tier: standard
tier_reason: The cause is located and the rule is given; the work crosses the write-log hook, the claim and the verify plumbing
effort: high
effort_reason: Three code paths (hook, claim, verify) must agree on one new list and an engine replay must drive the timing
status: merged
issue: 415
scope: [hooks/register.ts, hooks/lib/norepo.ts, hooks/lib/verify-native.ts, hooks/lib/retention.ts, tests/node/deltaattrib.node.mjs, tests/norepo.test.ts, tests/harness.ts, docs/contracts.md, CHANGELOG.md]
forbid: [hooks/lib/allow.ts, hooks/lib/ghguard.ts, hooks/lib/scheduler.ts, hooks/lib/configeff.ts, hooks/lib/configtable.ts, docs/cards/**]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/deltaattrib.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Issue #415: a worker was refuted on scope for touching a forbid path in another checkout it never wrote. Its stored write log (delegation.writes.<agent>) holds 104 paths, among them that checkout's settings file, its .git internals and card files another session wrote at the same time: the Bash tool.result hook merges the outside-root delta snapshot (takeDeltaSnap, the `extra` paths beside bashWrites) into the write log for every change under a watched root during the command, whoever made it. A watched root is often a live checkout the person is working in, so the log must not claim changes the command could not have made.

## Done when

- hooks/lib/norepo.ts gains a pure `commandNamesRoot(command: string, cwd: string, root: string, home?: string): boolean`: true when cwd is under root, or any whitespace-separated word of the command, with quotes stripped and a leading `~` expanded with home (a `~` word with no home given never matches), is root or a path under it, absolute or resolved against cwd. tests/node/deltaattrib.node.mjs (new, required; run by the repo's node runner) covers it with neutral paths: `ssh host sampler.ps1` from /w/repo against root /w/other is false; `git -C /w/other pull` is true; `cat ../other/x` from /w/repo is true; cwd /w/other/sub is true; `ls ~/other` with home /w is true.
- In the Bash tool.result hook that extends the write log (hooks/register.ts, the `extra` paths from the delta snapshot, MOD-256), a snapshot change under an outside root is added to the worker's write log only when commandNamesRoot holds for that root; otherwise it goes under a new store key K.foreign(agentId) (same cap and shape as K.writes) and never under K.writes. The checkout's own dirty paths (the `here` half of the snapshot) are unchanged. This narrows MOD-256 on purpose: a script that writes into an outside root its command never names is no longer charged, because a watched root is usually a live checkout the person is working in and the write log must not claim what the command could not have made; a command that names the root keeps MOD-256's full charge, script output included.
- The verify paths (verifyNative and verifyNoRepo) pass the foreign list beside writes; outsideClaim treats a changed path in the foreign list as foreign (listed, not judged) even when the writes log is empty; attributeWrites gains an optional third parameter for it. The existing line `changed during the run, not by this worker: ` and its text are unchanged (tests/hooks2.test.ts line 837, tests/norepo.test.ts line 366 and tests/hooks4.test.ts line 804 pin it); K.foreign paths print on a separate new line `changed during the run, not by this worker's commands: <paths>`. tests/norepo.test.ts covers: an empty writes log plus a foreign list still judges a path not in the foreign list.
- A replay in tests/norepo.test.ts (not a new file): a worker with forbid=/abs/other/** runs one Bash command that names no path under /abs/other, and the test writes /abs/other/settings.json inside its Bash tool.call handler (the `during` pattern at tests/norepo.test.ts line 326, so the write lands in the command's snapshot window); the hand-back is not refuted on scope and the verdict lines carry the new foreign line naming settings.json. Two more cases: the command `touch /abs/other/settings.json` is refuted on scope as now; a command that names the root (`node /abs/other/gen.mjs`) whose script writes a forbid file under it is still refuted (MOD-256 kept).
- hooks/lib/retention.ts gains a FOREIGN prefix beside WRITES (its lines 72 and 146 today) so K.foreign entries are slimmed and pruned exactly as K.writes entries are.
- docs/contracts.md, the write-log paragraph (line 294 today), gains one sentence on the foreign list and its line.
- CHANGELOG.md gains one bullet under `## Unreleased` / `### Fixed` naming MOD-305 and #415.
- The validate, node and test gates are green.

## Review

Diff read in full. commandNamesRoot folds the cwd and each quoted or tilde word against the root; attributeWrites takes the foreign log and marks its matches as snap even when the write log is empty; outsideClaim splits foreign (write-log misses) from foreignRun (the foreign log) and verify-native and verifyNoRepo print the second line; noteWrites routes a delta-snapshot path under a watched root to K.foreign unless the command names the root, with the here checkout charged as before; retention prunes the new key like the write log. Pure node tests plus engine replay cases. Verdict consistent at 27b8b07.
