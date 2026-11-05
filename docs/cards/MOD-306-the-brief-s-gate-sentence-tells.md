---
id: MOD-306
title: The brief's gate sentence tells the worker to run the gate in the foreground, in all three repo modes
domain: mod
tier: economy
tier_reason: Template wording and one node test; no logic
status: merged
issue: 396
scope: [hooks/templates/brief.md, tests/node/templates.node.mjs, docs/contracts.md, CHANGELOG.md]
forbid: [hooks/register.ts, hooks/lib/**, docs/cards/**]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/templates.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

A worker that ran its gate as a background command was charged two pauses, one when it started the run and one when it resumed; the same gate in the foreground costs one. The brief template never says which to use. Issue #396 picks the cheap fix: say "foreground" in the template.

## Done when

- In hooks/templates/brief.md each of the three Gate lines (the {{#worktree}}, {{#none}} and {{#here}} variants) gains, immediately before `If the gate fails with timeouts`, the text `Run it in the foreground (not run_in_background); keep its output outside the repo (under the scratch folder when the brief names one). `; no other line of the template changes.
- tests/node/templates.node.mjs gains one case per variant asserting the rendered brief contains `Run it in the foreground (not run_in_background)`; the cases fail on main and pass after; the existing MOD-230 assertion (line 27) still passes.
- docs/contracts.md, the paragraph on the brief's gate line (line 309 today), gains one sentence saying the brief asks for a foreground run because a background gate run costs a second pause.
- CHANGELOG.md gains one bullet under `## Unreleased` / `### Fixed` naming MOD-306 and #396.
- The validate, node and test gates are green.

## Review

Diff read in full: the three Gate lines in hooks/templates/brief.md gain the foreground sentence before the timeout clause, one node case per repo mode, the contracts.md gate paragraph gains one sentence, one CHANGELOG bullet. Nothing else changed. Verdict consistent at 0b1f26e.
