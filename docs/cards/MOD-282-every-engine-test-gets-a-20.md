---
id: MOD-282
title: Every engine test gets a 20-second timeout through one wrapper in tests/harness.ts, and a pure check keeps new test files on it
domain: mod
tier: standard
status: merged
scope: [tests/harness.ts, tests/*.test.ts, tests/node/testimports.node.mjs, .chassis-delegation.json, CHANGELOG.md]
forbid: [hooks/**, .claude-plugin/**, docs/cards/**, tests/node/run.mjs, tests/node/register.mjs]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs — the new tests/node/testimports.node.mjs fails on main (every test file imports test from claude-code/testing) and passes after
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

The engine runner gives each test 5 seconds unless the test names timeoutMs, and none of ours do. The suite has grown to 92 files and 2088 tests, each file a child process booting the whole mod, so the first test of a file and the gate-spawning or clock-stepping tests already take 1 to 5 seconds on a quiet machine. On a loaded machine 11 to 29 of them time out, and the verifier refutes correct work on the gate (MOD-281 was refuted four times this way on 2026-11-03). One wrapper that applies a 20-second default fixes every file at once, and a pure node check stops the next test file from importing the bare runner again.

## Done when

- tests/harness.ts exports a `test` with the same signature as claude-code/testing's `test` (read TestRest and TestOptions in .claude-plugin/types/claude-code/index.d.ts, around the `export const test` line): it calls the engine's `test`, adding `timeoutMs: 20000` to the options unless the caller's options already name a timeoutMs. The constant is exported as TEST_TIMEOUT_MS with a one-line comment saying why 20 s (the first test of a file boots the mod; gate and clock tests take 1 to 5 s; a loaded machine triples that).
- Every tests/*.test.ts file imports `test` from './harness' and no longer imports `test` from 'claude-code/testing' (`expect`, `describe`, `mock` and the rest still come from 'claude-code/testing'). The import is the only change in those files: no test body, name or existing explicit timeoutMs changes. Use a script for the 92 files and show its one-line result in the report.
- A new pure test tests/node/testimports.node.mjs, in the style of the files beside it and picked up by tests/node/run.mjs, reads every tests/*.test.ts and fails naming the file if any imports `test` from 'claude-code/testing' or imports no `test` from './harness'. It is the red test: it fails on main and passes after.
- In .chassis-delegation.json, the briefExtra sentence beginning 'Red first:' gains, after 'tests/ (engine)', the words 'importing test from ./harness, never from claude-code/testing'. Nothing else in that file changes.
- CHANGELOG.md gains one line under Unreleased (create the heading above 0.9.46 if it is missing) for this change.
- No file under hooks/ changes. The engine suite passes in the worktree with 0 failures; if it has timeouts anyway, re-run it once and say so in the report.

## Review

Brain review: the wrapper in tests/harness.ts keeps the engine's signature and lets a caller's own timeoutMs win; the 92 test files changed only their import lines; the pure check fails naming any file back on the bare runner. Engine suite 2086/0 at the worker's run, consistent at the verifier.
