---
id: MOD-406
title: "The verifier records each gate run on the verdict row: its id, pass or fail, how long it took, its result line, and whether it was run again"
domain: mod
tier: standard
status: merged
issue: 571
scope: [hooks/lib/gaterun.ts, hooks/lib/verify-native.ts, hooks/register.ts, CHANGELOG.md, docs/contracts.md, tests/node/gatenotes.node.mjs, tests/node/*.node.mjs, tests/*.test.ts]
forbid: [bin/**, docs/cards/**, docs/mockups/**, docs/spikes/**, hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, docs/upgrading.md, hooks/lib/workpane.tsx, hooks/lib/work.ts, hooks/lib/mergecmd.ts, hooks/templates/**]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/gatenotes.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

A card's test record is thin. When a gate passes at verify, the verifier keeps only the tree it passed on (`gateTree`): the output, the count of tests and the time taken are dropped. The merge then reuses that pass without running the gate, so nothing anywhere says "2074 pass, 0 fail in 41 s". A later card (MOD-407) writes a `## Testing` section on the merged card from what this card records.

## Before you start

- `hooks/lib/verify-native.ts`, the gate loop (search `const runGate = async`): each run's `ExecOut`, the `rerun` value (`'own' | 'timeouts'`), `passedOf`, and the return at the end of the function (`...(gateTree ? { gateTree } : {})`).
- `hooks/lib/gaterun.ts`: `outputTail`, `gateIdOf`, `passedGateLines`.
- `hooks/register.ts`: the `VerifyResult` type, the line that maps the native result to it (search `...(r.gateTree ? { gateTree: r.gateTree } : {})`), and the verdict row written with `appendLedger` (search `...(gateTree ? { gateTree } : {})`).

## Design (decided by the brain; build it, do not redesign it)

1. **`gateSummaryLine(stdout, stderr)` in gaterun.ts, pure.** Take the last 12 non-blank lines (`outputTail(stdout, stderr, 12)`), each trimmed. Keep those that match `/\b\d+\s+(?:pass|passed|passing|fail|failed|failing|skipped|tests?|errors?|warnings?)\b/i`, in order, joined with `, `. When none match, the result is the last non-blank line. When there is no output, the result is `''`. Cut the result to 160 characters, the last one `…` when cut.
2. **`GateNote` type in gaterun.ts:** `{ id: string; ok: boolean; ms: number; line?: string; rerun?: 'own' | 'timeouts' }`. `line` is left out when it is `''`.
3. **A clock on the verifier's io.** `NativeIo` gains `now?: () => number`; the gate loop reads `io.now ?? Date.now`.
4. **The gate loop records one note per gate id.** For every run whose command ran and exited (any exit code other than 126 and 127), time it from before `runGate(run)` to after it (a rerun's time counts; the wait for the engine-gate turn counts). Notes are per gate id in first-run order: a gate id with several runs has one note, `ms` the sum, `ok` true only when every run exited 0, `line` from the last run of that id, `rerun` from the first run of that id that was run again. A run that did not run (`!r.ok`) or exited 126 or 127 adds no note. The run that goes red still gets its note (`ok: false`) before the loop breaks.
5. **The result carries them.** The native result gains `gates?: GateNote[]` (left out when empty). `VerifyResult` in register.ts gains the same field, passed through beside `gateTree`, and the verdict ledger row gains `gates` beside `gateTree` (left out when empty). Nothing reads it yet. No verdict, claim line, next step or budget changes.

## Tests

Node tests in the new file `tests/node/gatenotes.node.mjs` (write them first; they are the red test):
- `gateSummaryLine`: the node runner's ending (`\n 2074 pass\n 0 fail\n 2 skipped (engine tests: claude plugin test runs them)\n`) gives `2074 pass, 0 fail, 2 skipped (engine tests: claude plugin test runs them)`; output with no count line gives its last non-blank line; empty output gives `''`; a 300-character last line is cut to 160 ending `…`; a count line on stderr is read.
- The gate loop, driven through the verifier's exported entry with a fake io and a fake clock, the way the existing node tests of verify-native do it (find one and copy its setup): a passing gate gives one note with `ok: true`, the summary line and the clock's difference as `ms`; a red gate gives `ok: false`; a gate that exits 127 gives no note; a red first run of a gate=pass claim that passes when run again gives `rerun: 'own'` and `ok: true`.

## Left to you

- The names of local variables and where the helper sits inside gaterun.ts.
- Whether the verdict-row pass-through needs an engine test or is covered by a type check alone.

## Done when

- `gateSummaryLine` and `GateNote` are exported from hooks/lib/gaterun.ts and behave as the Design says.
- The native verifier returns `gates` as the Design says, and a verdict row written after a gate ran holds `gates`.
- The tests listed above exist in tests/node/gatenotes.node.mjs and pass.
- docs/contracts.md, in `## How a report is verified`, gains one paragraph saying the verdict row keeps each gate's id, result, time in ms and result line as `gates`.
- CHANGELOG.md gains one bullet under `## Unreleased` (add the heading at the top of the list of versions when it is missing).
- The gates validate, node and test are green.

## Review

Brain review (Fable 5.2): Built as designed. One note per gate id is kept in first-run order, with the red run noted before the loop breaks and 126/127 runs left out; the clock is read once before and once after each run so a rerun's time counts. The pass-through to the verdict row sits beside gateTree and is left out when empty. No verdict, claim or next step changes. Nit, not blocking: when a gate id has several runs and the last one prints nothing, the id's note carries no line.
