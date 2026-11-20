---
id: MOD-407
title: "merge writes a Testing section on the merged card and in the PR body: the planned test, the red test's result, each gate's result line and time, the test files changed, and the fix rounds; the record stays in the root after finish"
domain: mod
tier: standard
status: merged
issue: 572
scope: [hooks/lib/mergecmd.ts, hooks/register.ts, CHANGELOG.md, docs/guide.md, docs/contracts.md, tests/node/testingsection.node.mjs, tests/node/*.node.mjs, tests/*.test.ts]
forbid: [bin/**, docs/cards/**, docs/mockups/**, docs/spikes/**, hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, docs/upgrading.md, hooks/lib/workpane.tsx, hooks/lib/work.ts, hooks/lib/verify-native.ts, hooks/lib/gaterun.ts, hooks/templates/**]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/testingsection.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 12
---
## Why

A merged card holds only the brain's `## Review`. The PR body's `## Gates` says pass or fail per gate and nothing more. The red test's output sits in the worktree and goes when the worktree is removed. A reader of a merged card cannot tell what was tested or what the outcome was. Since MOD-406 the verdict row keeps each gate's result line and time as `gates`.

## Before you start

- `hooks/lib/mergecmd.ts`: `markMerged(card, review?)`, `GateResult`, `prBody`, `scrubPaths`.
- `hooks/register.ts`, the merge block: where `markMerged` is called, where `merge-files.txt` and `merge-gates.txt` are written, `reusableGates` (a reused gate's label reads `gate reused`), the call to `prBody`, and `row` (the last verdict row: `row.gateTree`, `row.gates`, `row.tried`).
- `hooks/lib/gaterun.ts`: the `GateNote` type (MOD-406): `{ id, ok, ms, line?, rerun? }`.
- `hooks/lib/attempts.ts`: `AttemptRecord` (`red`, `redHeld`, `attempt`).
- The finish step's list of files kept in the root `.delegation/<ID>/` (search `merge-files.txt` in register.ts and in tests/node/finishkeep.node.mjs).

## Design (decided by the brain; build it, do not redesign it)

1. **`testingSection(input)` in mergecmd.ts, pure, returns the lines of the section body (no heading).** Input: `{ redTest: string; red?: { path: string; held: boolean }; gates: readonly GateResult[]; notes?: readonly GateNote[]; reused?: readonly string[]; testFiles: readonly string[]; testsAdded: number; tried?: number; attempts: number }`. Lines, in this order:
   - `- Planned: <redTest>`, the card's `red_test` value as written; `- Planned: none` when it is empty or `none`.
   - `- Red test: failed before the change (<path>)` when `red.held`; `- Red test: reported at <path>, not confirmed` when `red` is set and not held; `- Red test: none` otherwise.
   - One line per entry of `gates`, in order: `- Gate <id>: pass` or `fail`, then, joined with ` · `, each part that applies: the note's `line`; the note's time (`<n> s` under 90 s, rounded to whole seconds, at least `1 s`; else `<n> min`, rounded to one decimal); `run again after timeouts` or `green on a second run` for `rerun` `'timeouts'` or `'own'`; `verify pass reused at merge` when the id is in `reused`. The note is the one in `notes` with the same id; with none, the line is the bare `- Gate <id>: pass`.
   - `- Test files changed: <n> (<a>, <b>, …)`, at most 8 names then `, +<k> more`; `- Test files changed: none` for an empty list. Then on the same line, when `testsAdded > 0`: `; tests added: <n>`.
   - `- Fix rounds before hand-back: <tried>` only when `tried > 0`.
   - `- Attempts: <attempts>` only when `attempts > 1`.
2. **`isTestFile(p)` and `testsAdded(diff)` in mergecmd.ts, pure.** A test path starts with `test/` or `tests/`, or holds `/test/`, `/tests/` or `/__tests__/`, or its file name matches `/[._-](?:test|spec)\.[A-Za-z]+$/` or `/^test_.*\.py$/`. `testsAdded` counts the lines of a unified diff that match `/^\+\s*(?:test|it)(?:\.\w+)?\s*\(/` or `/^\+\s*(?:async\s+)?def\s+test_/`.
3. **`markMerged(card, review?, testing?)`.** With `testing` (a non-empty list of lines) the card gains `## Testing`, a blank line, the lines, placed directly above `## Review` (at the end when there is no review). A card that already has a `## Testing` heading has that section replaced.
4. **`prBody` gains `testing?: readonly string[]`.** With it, the body gains `## Testing` and the lines directly after the `## Gates` section. Every line passes through `scrubPaths`.
5. **The merge block in register.ts builds the input.** `gates`: the merge's own gate results. `notes`: `row.gates`. `reused`: the ids `reusableGates` returned. `testFiles`: the merge's changed files that pass `isTestFile`. `testsAdded`: from one `git diff <base>..HEAD -- <test files>` in the worktree (0 when there are no test files or the diff fails). `red`: the last attempt record of the card that has `red` set (`held` from `redHeld`). `tried`: `row.tried`. `attempts`: the highest attempt number among the card's attempt records. A failure reading any of these leaves that part out; it never stops the merge.
6. **The record stays in the root.** The merge writes the section (heading and lines) to `.delegation/<ID>/testing.md` in the root, and copies the red file, when it exists in the worktree, to `.delegation/<ID>/red.txt` in the root (its first 64 KiB). Both are added to the files the finish step keeps.

## Tests

Node tests in the new file `tests/node/testingsection.node.mjs` (write them first; they are the red test):
- `testingSection`: a full input gives every line in the order above, word for word; a gate with no note gives the bare line; 61 400 ms shows `61 s`; 150 000 ms shows `2.5 min`; 200 ms shows `1 s`; 10 test files show 8 names and `, +2 more`; `tried: 0` and `attempts: 1` add no line; `redTest: 'none'` with no `red` gives `- Planned: none` and `- Red test: none`.
- `isTestFile`: true for `tests/node/a.node.mjs`, `src/__tests__/a.ts`, `a.test.ts`, `pkg/foo_test.go`, `test_x.py`; false for `hooks/lib/contest.ts` and `docs/testing.md`.
- `testsAdded`: counts `+  test('a', …`, `+it.each(…` and `+    def test_x(`; does not count a removed line or a context line.
- `markMerged` with testing: the section sits above `## Review`; a second call replaces it and leaves one `## Testing` heading.
- `prBody` with testing: `## Testing` follows the gates section, and a home path in a line is scrubbed.

## Left to you

- How the merge block reads the attempt records and the base ref (use what the block already has in hand).
- Whether an engine test of the merge block is worth its cost; one that asserts the merged card holds `## Testing` is welcome when an existing merge test can be extended.

## Done when

- A merge writes `## Testing` on the merged card above `## Review` and in the PR body after the gates, with the lines the Design names.
- After `merge finish=true`, the root `.delegation/<ID>/` still holds `testing.md`, and `red.txt` when the card had a red file.
- The tests listed above exist in tests/node/testingsection.node.mjs and pass.
- docs/guide.md gains a short section `## What was tested` (after the section on merging) that shows a sample `## Testing` block and says where the record is kept; docs/contracts.md names `testing.md` and `red.txt` where it lists the files kept in `.delegation/<ID>/`.
- CHANGELOG.md gains one bullet under `## Unreleased`.
- The gates validate, node and test are green.

## Review

Brain review (Fable 5.2): The pure parts match the design: testingSection, isTestFile, testsAdded, markMerged with a replaced section, prBody after the gates, all scrubbed. One deviation, accepted: the gates run after the first card commit, so the section lands in a second commit with the same subject; this keeps the allowlist untouched and a second merge call makes no further commit. The worker also found that finish compared the root card with the merged one and taught cardDiff to ignore the Testing section; without it every finish would have refused. The record files fail open and never stop a merge. Nit: a failed second commit leaves the worktree dirty and is only debug-logged.
