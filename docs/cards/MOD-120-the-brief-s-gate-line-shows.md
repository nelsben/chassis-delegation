---
id: MOD-120
title: The brief's gate line shows the worker the command it is judged by, with {files} as a scratch listing it writes itself, and a red log under scratch= is read like one in the worktree
domain: mod
tier: standard
status: merged
scope: [hooks/lib/dispatch.ts, hooks/lib/verify.ts, hooks/lib/gates.ts, hooks/lib/report.ts, hooks/templates/**, hooks/register.ts, tests/**, docs/contracts.md, CHANGELOG.md]
forbid: [bin/**, .claude-plugin/**, docs/cards/**, .chassis-delegation.json]
red_test: the new engine test with red= under the brief's scratch= fails at the base with refuted on red
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Issue #199, items 1 and 3. The verifier fills {files}, {worktree} and {outdir} in a gate-map command, but the brief shows the worker the raw command, so a worker cannot run the gate it is judged by. And a repo that forbids .delegation/** keeps red logs in the worker's scratch dir, where the verifier refuses them: every such card came back refuted on red although its red test failed at base and passed at head.

## Done when

- The brief's gate section renders each gate id's command with {worktree} as the worktree path, {outdir} as the card's outdir and {files} as <scratch>/files.txt, plus one line telling the worker to write that file with `git diff --name-only <base>` (one path a line) before running the gate. A repo=none or repo=here brief renders the same placeholders by the same rules it already uses.
- The verifier accepts red= as an absolute path when, and only when, it lies under the brief's scratch=; it reads that file exactly as it reads a worktree-relative red log. Any other absolute red= path is refused as today, with a line that names scratch= as the allowed place.
- docs/contracts.md's red= row and gate section say both of the above. CHANGELOG gains an Unreleased entry naming #199 (items 1 and 3).
- Tests: pure (gate line rendering with all three placeholders; red path rule: worktree-relative accepted, under scratch accepted, other absolute refused) and engine (a hand-back whose red= is under scratch= and whose red test fails at base → not refuted on red).
- No machine paths, user, product or repo names. The validate, node and test gates pass.

## Review

Attempt 1 (sonnet) refuted on scope: the red path check lives in hooks/lib/verify-native.ts, which the card had scoped as verify.ts; the worker was resumed to hand back with an amend (scope+=hooks/lib/verify-native.ts), and attempt 2 was accepted with no code change. A new gateLineText renders each gate id as its command with {worktree}, {outdir} and {files} (as <scratch>/files.txt) filled, plus a note telling the worker to write that listing; redTarget accepts an absolute red= under the brief's scratch= and nothing else outside the tree. Red: four tests failed before the source change. Gates green: validate, node 990/0, plugin 1499/0.
