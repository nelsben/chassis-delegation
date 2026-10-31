---
id: MOD-230
title: A busy machine is named as such: dispatch warns when many queued workers share the engine gate, a gate failure under load says so, and workers re-run a timeout failure once before gate=fail
domain: mod
tier: standard
status: merged
issue: 323
scope: [hooks/register.ts, hooks/lib/verify-native.ts, hooks/lib/scheduler.ts, hooks/lib/load.ts, hooks/templates/brief.md, tests/*.test.ts, tests/node/*.mjs, docs/guide.md, CHANGELOG.md]
forbid: [hooks/lib/allow.ts, hooks/lib/version.ts, .claude-plugin/plugin.json, docs/cards/**]
red_test: claude plugin test . (new engine cases fail now: a red gate with load average 100 on 10 cores carries no load words; 4 queued lanes on the test gate give no dispatch warning)
gate: validate, node, test
budget: 2-attempts
spend: 8
---
## Why

Issue #323, items 3 and 4: with many workers on one machine, gates fail with timeouts and off-by-a-few counts that pass when run alone, and the verdict reads as a plain failure; dispatch gave no sign that nine lanes would queue on one engine gate (the mod already runs one engine gate at a time through the engine-gate lock, hooks/register.ts about line 4910). The founder's machine is often loaded by other workflows that cannot be closed, so the mod must say when load, not the change, is the likely cause.

## Done when

- A pure helper in a new hooks/lib/load.ts reads the 1-minute load average and core count from the text of `sysctl -n vm.loadavg hw.ncpu` (macOS) or `/proc/loadavg` plus `nproc` (Linux), and says the machine is loaded when the 1-minute load is at least 2 times the core count. register.ts runs the read through the existing process run path (both commands are reads; add nothing to the allowlist other than these exact argvs if the guard requires it, and say so in the report) and never fails a verdict when the read fails.
- When the verifier's gate is red or times out and the machine is loaded at that moment, the verdict row and its detail add `machine loaded (load <x> on <n> cores): may be load, not the change; re-run with /dispatch <ID> --verify <sha> once it drops`. The verdict itself (refuted or unverified) is unchanged; only the words are added. A green gate and an unloaded red gate are unchanged.
- When dispatch queues a lane, or starts one, and 3 or more live or queued briefed lanes have an engine gate (the gate the engine-gate lock serializes), its result adds one line `<k> lanes share the engine gate; it runs one at a time: expect verdict waits` (k counts this lane). Fewer than 3: no line.
- hooks/templates/brief.md, where it tells the worker how to run the gate, adds one sentence: if the gate fails with timeouts (ETIMEDOUT, a test timing out) run it once more on its own before handing back gate=fail, and say in the report that it was re-run.
- Tests: the load parser for both formats and a garbage string; the loaded-red row words; unloaded red and loaded green unchanged; the dispatch line at 3 lanes and its absence at 2; the brief template sentence present in a built brief. Existing exact-string tests that change are updated, and only those.
- docs/guide.md gains a short paragraph on running many workers on a busy machine (the dispatch line, the loaded words, the re-verify). CHANGELOG.md gains an Added entry under `## Unreleased` naming MOD-230 and #323. validate, the node tests and the engine suite pass.

## Review

The lead read the allow.ts diff. sysctl passes only with exactly `-n vm.loadavg hw.ncpu` (three args, joined exact match), and nproc only with no args. No cat. The founder approved these two argvs in chat. The load read fails open (`readMachineLoad` returns undefined on any error). The engine-lanes dispatch line (`engineLanesNote` in register.ts) is only unit-tested; it has no engine test. Attempt 1 built nothing because allow.ts was forbidden, and was recorded as unverified.
