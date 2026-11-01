---
id: MOD-245
title: The brief drops boilerplate that does not apply and keeps the pause line and the gate-tail instruction
domain: mod
tier: standard
status: merged
scope: [hooks/templates/brief.md, hooks/lib/dispatch.ts, tests/dispatch.test.ts, tests/node/**, docs/internals.md, CHANGELOG.md]
forbid: []
red_test: tests/node/templates.node.mjs: a brief rendered for a card with red_test=none has no red-evidence line and no 'Red test first' rule (fails today: both are emitted with the literal 'none')
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

A rendered brief is about 8.7 KB of which about 6.3 KB is boilerplate the same for every card; a worker on a standard model reads it in full before every attempt. Some lines do not apply to the card: the red-evidence block and the 'Red test first' rule are emitted even when red_test=none; the gate instruction is kept as written (tail -n 40 of the gate output is what the verifier reads). The MOD-226 pause bullet is present in rendered briefs and stays.

## Done when

- hooks/templates/brief.md sections are conditional through renderSections in hooks/lib/dispatch.ts (near 326-336): the red-evidence block and the 'Red test first' rule render only when red_test is not none; the resources paragraph only when resources is set; the parent-scope paragraph only when parent_scope is set; the artefacts line only when outdir is set.
- Boilerplate that repeats itself is cut: the rules list says each rule once; the report section shows the report line once with its field list; measured on the MOD-245 card itself, renderBrief's output (no header, no briefExtra) drops by at least 1 KB, from 7380 bytes to at most 6400 (the card body and lessons, about 3 KB, are not template text).
- The pause bullet (MOD-226) and the tail -n 40 gate instruction are never dropped.
- Pinned renders in tests/node/templates.node.mjs (near 54, 99, 147, 171, 186) and tests/dispatch.test.ts (near 271-283) are updated to the new text in the same change, with the assertions kept.
- docs/internals.md's brief description names the conditional sections; CHANGELOG.md gets an Unreleased line.
- Gates validate, node and test are green.
