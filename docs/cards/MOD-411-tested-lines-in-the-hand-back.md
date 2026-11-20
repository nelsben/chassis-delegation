---
id: MOD-411
title: "A worker lists what it ran as tested: lines in its hand-back; the mod keeps them on the verdict row and shows them in the merged card's Testing section"
domain: mod
tier: standard
status: merged
issue: 580
scope: [hooks/lib/handback.ts, hooks/lib/mergecmd.ts, hooks/register.ts, hooks/templates/brief.md, CHANGELOG.md, docs/contracts.md, docs/guide.md, tests/node/testedlines.node.mjs, tests/node/*.node.mjs, tests/node/*.mjs, tests/*.test.ts]
forbid: [bin/**, docs/cards/**, docs/mockups/**, docs/spikes/**, hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, docs/upgrading.md, hooks/lib/workpane.tsx, hooks/lib/work.ts, hooks/lib/verify-native.ts, hooks/lib/gaterun.ts, hooks/lib/explore.ts]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/testedlines.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

The merged card's `## Testing` section (MOD-407) says what the verifier saw: the red test and each gate. It does not say what the worker ran by hand or could not run (a type check that was not on the PATH, a manual check of a screen). The worker says this in prose today and it is lost at merge.

## Before you start

- `hooks/lib/handback.ts`: `handbackTried` (the parser to copy) and `handbackChoices`.
- `hooks/register.ts`: where `triedRead` is read and written to the verdict row (search `triedRead`), and `mergeTesting` (it builds the input of `testingSection` from the verdict row).
- `hooks/lib/mergecmd.ts`: `VerdictRow`, the ledger reader that fills it (it reads `tried`), `TestingInput`, `testingSection`.
- `hooks/templates/brief.md`: the `Choices:` bullet and the stop-rule bullet that names `tried:`.

## Design (decided by the brain; build it, do not redesign it)

1. **`handbackTested(text)` in handback.ts, pure.** The same reading as `handbackTried` with the word `tested:`: the lines above the last `[[report`, an optional list marker and backtick, distinct bodies, empty bodies skipped. It returns `{ count, lines }`, the first six lines, each cut to 160 characters.
2. **The verdict row keeps them.** Read beside `triedRead` under the same condition; when `count > 0` the verdict ledger row gains `testedLines: string[]` (the kept lines). No verdict line, claim, next step or budget reads it.
3. **The Testing section shows them.** `VerdictRow` gains `testedLines?: string[]`, read from the ledger as `tried` is (strings only). `TestingInput` gains `tested?: readonly string[]`. When it is non-empty, `testingSection` adds, directly after the test-files line: `- Worker ran:` and then one line per entry, `  - <line>` (two spaces). `mergeTesting` passes `row.testedLines`.
4. **The brief asks for them.** hooks/templates/brief.md gains one bullet directly after the `Choices:` bullet. Its text is the one line inside this fence, word for word, backticks included:

   ~~~
   - Tested: list what you ran beyond the gate and the red test, and what you could not run, one per line in your hand-back: `tested: <what you ran> -> <what it showed>`, or `tested: could not run <what> (<why>)`. With nothing beyond the gate, write no such line. The mod records them on the card and never judges them.
   ~~~

## Tests

Node tests in the new file `tests/node/testedlines.node.mjs` (write them first; they are the red test):
- `handbackTested`: two `tested:` lines above the report give count 2 and both bodies; a line below the last report is not read; a duplicate counts once; a list item whose body is wrapped in backticks (a hyphen, a space, a backtick, `tested: x`, a backtick) is read as `x`; eight lines give count 8 and six kept; a 200-character body is cut to 160; text with none gives count 0.
- `testingSection` with `tested: ['tsc -> clean', 'could not run the editor (no display)']`: `- Worker ran:` follows the test-files line, then the two indented lines; with `tested` empty or absent the output is what it is today.
- The ledger reader fills `testedLines` from a verdict row that has it and drops entries that are not strings.

## Left to you

- Whether an existing brief-template test needs its expected text extended (extend it; do not delete it).

## Done when

- A hand-back with `tested:` lines puts them on the verdict row as `testedLines`, and a merge of that card shows them under `- Worker ran:` on the card and in the PR body.
- A new brief holds the `Tested:` bullet after the `Choices:` bullet.
- The tests listed above exist in tests/node/testedlines.node.mjs and pass.
- docs/contracts.md names the `tested:` lines beside its paragraph on choice lines; docs/guide.md's `## What was tested` sample gains the `- Worker ran:` lines.
- CHANGELOG.md gains one bullet under `## Unreleased`.
- The gates validate, node and test are green.

## Review

Brain review (Fable 5.2): Built as designed. handbackTested mirrors handbackTried (lines above the last report, distinct, six kept, 160 characters each); the verdict row gains testedLines only when there are any, under the same ad hoc and cardless condition; the Testing section shows them as "- Worker ran:" after the test-files line and they pass through the same path scrub as the rest of the section; the brief bullet is word for word. Nothing reads the lines for a verdict, claim, next step or budget. Ten node tests, red before the change (9 of 10 failing). Nit: the parser is a near copy of handbackTried and the two could share one helper.
