---
id: MOD-149
title: A gate the verifier finds red says why on the verdict row: the exit code, the path of the gate's full output saved under the session's .delegation/<ID>/, and `the worktree changed while the gate ran` (unchecked, not refuted) when the worktree is gone or its HEAD moved by the end of the run
domain: mod
tier: standard
status: merged
scope: [hooks/lib/verify-native.ts, hooks/register.ts, tests/**, CHANGELOG.md]
forbid: [docs/cards/**, bin/**, hooks/templates/**, .chassis-delegation.json, .claude-plugin/**, README.md, docs/upgrading.md, hooks/lib/allow.ts]
red_test: engine test: a worker's gate exits 1 printing `FAILED test_x`; the verdict row reads `… RED at <sha> (exit 1; output <root>/.delegation/T-3/verify-gate-1.txt)` and that file holds `FAILED test_x`; at base the row ends `(exit 1)` and no file is written. Red first
gate: validate, node, test
budget: 2-attempts
spend: 6
---
## Why

Follow-up on #222: seven tasks in a row were refuted with `gate=pass claimed but the gate is RED at <sha> (exit 1)` while the worker's own run and the lead's run after merging both passed. The row carries no output, so the lead could not tell a failing test from a gate disturbed by its own concurrent run or a worktree removed mid-run, and paid a full gate run each time to find out. The verifier already keeps the output tail in its detail lines; it should save the whole output where the lead can read it, and not call a run red when the tree it ran in changed under it.

## Done when

- hooks/lib/verify-native.ts: when a gate run exits non-zero, its full stdout and stderr are written (io.write) to `<outDir>/verify-gate-<attempt>.txt`, where register.ts passes outDir as the session root's `.delegation/<task>` (not the worker's worktree), and the refuted claim reads `gate=pass claimed but the gate is RED at <sha> (exit <n>; output <path>)`; the output tail lines stay as today. With no outDir or a failed write, the claim reads as today.
- After a gate run that exited non-zero, the verifier reads the worktree's HEAD again: when the worktree no longer exists or HEAD is not the sha it ran at, the gate claim is `unchecked` with `the worktree changed while the gate ran (<gone | HEAD now <short>>); the gate was not judged`, not `failed`, so the verdict is not refuted on gate.
- hooks/register.ts passes outDir to verifyNative on the worktree path (repo=here and repo=none unchanged unless they already have an outDir).
- Tests: a node or engine test where the gate exits 1 writes verify-gate-1.txt with the full output and the row names its path; a test where the gate command removes the worktree (or moves HEAD) before exiting 1 gives an unchecked gate claim with the changed-tree text and a verdict that is not refuted on gate; the existing gate-red tests are updated to the new claim text. CHANGELOG.md Unreleased gets one Changed entry. Wording generic: no product, repo, person, path or session names.

## Review

Consistent on attempt 1. A red gate run in a worktree re-reads HEAD: gone or moved gives an unchecked claim `the worktree changed while the gate ran (…)`, not a refutation; repo=here is exempt because its HEAD moves legitimately. Otherwise the full stdout+stderr is written to <root>/.delegation/<task>/verify-gate-<attempt>.txt (the session root, not the worktree) and the claim names it; a missing outDir or a failed write leaves the claim as before. The one-line row still truncates the reason, so the path is readable on the claim lines and cut on the row; left as is. verify-native.ts change approved by Ben for this card.
