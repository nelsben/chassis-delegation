---
id: MOD-310
title: A repo=here worker's delta subtracts every in-flight sibling card's scope, not only the files the siblings have reported so far
domain: mod
tier: standard
status: merged
issue: 399
scope: [hooks/lib/verify-native.ts, hooks/register.ts, tests/node/subtractscope.node.mjs, tests/verifynative.test.ts, tests/hooks4.test.ts, tests/harness.ts, docs/contracts.md, CHANGELOG.md]
forbid: [hooks/lib/allow.ts, hooks/lib/scheduler.ts, hooks/lib/dispatch.ts, hooks/templates/**, docs/cards/**]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/subtractscope.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Five repo=here cards ran at once in one checkout on disjoint files; on a resume, files other cards had changed since the brief was rendered counted as the worker's delta and two resumes failed on scope. Issue #399, the delta half (the gate half stays open). Today subtractDelta in hooks/lib/verify-native.ts claims a path for a sibling only from the files its attempt records already list (inFlightHere in hooks/register.ts carries scope too, unused here).

## Done when

- tests/node/subtractscope.node.mjs (new, required; subtractDelta and ignoredLine are importable from node, see tests/node/verify-native.git.node.mjs) covers the subtractDelta cases named below and fails on main; write it before any source change and save that run as the red evidence.
- subtractDelta (hooks/lib/verify-native.ts) takes an optional `scope` on each sibling and an optional own-scope argument, so the existing calls (tests/verifynative.test.ts lines 564 to 571) keep working. The order is: ignore globs, then a sibling's files (as today), then a path in the worker's own scope is kept, then a path in the worker's write log (input.writes) is kept, then a path inside a sibling's scope goes to that sibling. ignoredLine prints scope-claimed paths in the same group as that sibling's files with the suffix ` (scope)` on the group, e.g. `3 paths belonging to OPS-12 (scope) (a.md, b.md, c.md)`.
- hooks/register.ts passes `scope` from inFlightHere into `others` at the single call site (line 6324 today) and the worker's own scope and write log into subtractDelta; nothing else about inFlightHere changes.
- The repo=here brief's gate sentence is unchanged (the gate half of #399 is not this card).
- tests/node/subtractscope.node.mjs covers, and tests/verifynative.test.ts gains the same cases through verifyNative: a path under a sibling's scope but not in its files is subtracted and disclosed with (scope); a path in the worker's own scope and a sibling's scope is kept; a path in the worker's write log inside a sibling's scope is kept and judged. tests/hooks4.test.ts gains one case through the hooks where a sibling's unreported edit no longer fails a resume on scope.
- docs/contracts.md, the repo=here sentence on subtraction (line 397 today), gains one sentence saying sibling scopes are subtracted too and how the line reads.
- CHANGELOG.md gains one bullet under `## Unreleased` / `### Fixed` naming MOD-310 and #399.
- The validate, node and test gates are green.

## Review

Diff read in full. subtractDelta gains each sibling's scope and the worker's own scope and write log: ignore first, then a sibling's reported files, then the worker's own scope or write log is kept, then a path inside a sibling's scope goes to that sibling and marks the group (scope). verifyNative makes the write log repo-relative before passing it; the one call site in runVerify passes c.scope, which inFlightHere already read from the sibling brief. Pure node cases, two verifyNative cases and one hooks4 case. Verdict consistent at 27fc1a9.
