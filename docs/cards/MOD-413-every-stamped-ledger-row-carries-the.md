---
id: MOD-413
title: Every stamped ledger row carries the brain's calls by kind (seven kinds), and the scorecard prints a brain calls/card block
domain: mod
tier: standard
status: merged
issue: 585
parent: 584
fixes: []
scope: [hooks/lib/drive.ts, hooks/lib/brain.ts, hooks/register.ts, bin/evidence.mjs, tests/node/braincalls.node.mjs, tests/node/*.mjs, tests/*.test.ts, tests/fixtures/evidence/*.jsonl, docs/spend.md, docs/guide.md, docs/internals.md, CHANGELOG.md]
forbid: [docs/cards/**, docs/spikes/**, docs/mockups/**, hooks/templates/**, hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, docs/upgrading.md]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/braincalls.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Issue #585. Across ten repos the brain is about half of spend at 26 to 38 requests per card, and the ledger cannot say what those requests are: the mod counts four kinds of main-loop call for the `brain calls:` line but the count never reaches the ledger, and calls to the mod's own tools, git and gh commands and every other tool are not counted at all. With the counts on the `brain` stamp, the scorecard can show per card where the brain's calls go, which is what the next design step (fewer brain turns per card) is waiting on.

## Before you start

- `hooks/lib/drive.ts`: `DriveRecord`, `emptyDrive`, `callKind`, `addDrive`, `driveCall`, `driveTurn`, `driveLines`. The file is pure (no `$`).
- `hooks/register.ts`: search `MOD-48: what the brain's driving costs it` for `WithDrive`, `drivePending`, `readDrive`, `flushDrive` and `driveGuard`; search `async function brainStampNow` for the one place every stamp is built (its three callers write the judged, merged and spawn rows); search `every tool call:` for the `tool.call` hook that calls `driveGuard`.
- `hooks/lib/brain.ts`: `BrainStamp` and `brainStamp`.
- `bin/evidence.mjs`: search `the brain's stamped rows, per session` for the loop that takes the difference of two stamps' `pairs` and adds it to the row's task; `perCard`; `brainOut`; and the text block that starts with `const bhead`.
- Tests to read first: `tests/node/brainstamp.node.mjs`, `tests/node/evidence.node.mjs` (how a fixture ledger under `tests/fixtures/evidence/` is read), `tests/drive.test.ts`, `tests/brain.test.ts`.

## Design (decided by the brain; build it, do not redesign it)

1. **One classification, one record.** The four old kinds keep `callKind`'s answer, so the stamp's `run`, `read`, `edit` and `spawn` always equal what the `brain calls:` line counts. `stampKind` only names the calls `callKind` returns `undefined` for. So a polled `gh pr checks` loop stays `run` and a Bash git command that writes into the root stays `edit`; `vcs` is the git and gh commands that were skipped until now.
2. **`DriveRecord` gains `mod?`, `vcs?`, `other?`.** Optional numbers. A record stored before this card has none and must read as it is. `emptyDrive()` is unchanged. `driveCall` and `addDrive` treat an absent field as 0, and `addDrive` writes one of the three keys only when either side has it, so the records the existing drive tests compare are the same as today.
3. **`driveGuard` counts the new kinds and stops.** When `callKind` gives `undefined`, count `stampKind`'s kind into `drivePending` with the same debounce flush, then return as it does today: no change to `driveTurnCalls`, to the watch, or to the warn row. The early return for a call with an `agentId` stays first.
4. **The stamp.** `BrainStamp` gains `calls?: { run, read, edit, spawn, mod, vcs, other }`, all numbers. `brainStamp` takes an optional third argument, a `DriveRecord`. Passed: the stamp has `calls` with all seven keys (0 for an absent or missing field). Not passed: no `calls` key, so every existing brainstamp test passes untouched. `brainStampNow` passes `(await readDrive($)) ?? emptyDrive()`: the stored counts plus the unflushed ones.
5. **The scorecard arithmetic.** Keep a base for `calls` separate from the `pairs` base, with the same rule: the first row of a session counts from zero; a later row counts the difference from the session's previous row that carried `calls` (each kind through the existing `diff`, which floors at 0); a row with `calls` in a session whose earlier rows had none sets the base and counts nothing. The interval goes to the row's task record (the `tasks` map entry gains a `calls` object by kind); a row with no task is not counted. A row may carry `calls` without `pairs` and the other way round: neither read depends on the other.
6. **Per card.** For a setup, `callCards` is the number of its task records that have a `calls` object, and `callsPerCard[kind]` is the sum of that kind over those records divided by `callCards`, rounded to one decimal; `all` is the sum of the seven before rounding, divided the same way. `callCards` 0 gives `callsPerCard: null`. The context buckets and the `--by-repo` block are not changed.
7. **The text block.** After the brain block and before the context block, only when at least one setup has `callCards` above 0: an empty line, then a block built with the same `block(head, rows)` helper, head `['brain calls/card', 'cards', 'run', 'read', 'edit', 'spawn', 'mod', 'git/gh', 'other', 'all']`, one row per setup with `callCards` above 0 in the brain block's order, `cards` being `callCards`, each figure with one decimal.
8. **Docs.** docs/internals.md: one `- MOD-413:` line after the `MOD-348` line, saying what `calls` holds, that it is a running total per `since` like `pairs`, which calls each of the seven kinds counts, and that a row without it is unknown. docs/guide.md: one or two sentences in the scorecard paragraph (it starts with the words "Run" and the scorecard command; search `--scorecard <repo>`) naming the `brain calls/card` block and its columns. docs/spend.md: change nothing unless a sentence there becomes false. CHANGELOG.md: a new `## Unreleased` section above `## 0.9.69`, with `### Changed` and one bold-led entry in the style of the entries below it.

## Tests

Node tests in the new file `tests/node/braincalls.node.mjs` (write them first; they are the red test):
- `stampKind`: a Read is `read`; `git status` and `gh pr view 1` are `vcs`; a repeated `git status` (`repeat` true) is `run`; `mcp__chassis-delegation__dispatch` is `mod`; `ToolSearch` and `mcp__other__thing` are `other`; an Edit is `edit`.
- `driveCall(undefined, 'mod')` has `mod` 1 and the four old counts 0; `addDrive` of a record with `vcs` 2 and one without has `vcs` 2 and no `mod` or `other` key; `driveLines` of a record with only `mod` counted is empty.
- `brainStamp` with a drive record that has `read` 3 and `mod` 2 gives `calls` equal to `{ run: 0, read: 3, edit: 0, spawn: 0, mod: 2, vcs: 0, other: 0 }`; with no third argument the stamp has no `calls` key.
- The scorecard on a new fixture `tests/fixtures/evidence/ledger-f.jsonl`: one session with two cards whose stamped rows carry `calls` and `pairs`, plus one card of a second setup whose rows carry `pairs` only. Assert the first setup's `callCards` and each `callsPerCard` figure against numbers you work out by hand in a comment; the second setup has `callCards` 0 and `callsPerCard` null; the text output has the `brain calls/card` head and exactly one row under it. Build the fixture's rows from the shape of ledger-e's rows; it must hold no real repo, product or person name and no home path.
- The text scorecard of ledger-a to ledger-e is the same as before this card; their JSON differs only by the two new keys.

One engine test (in `tests/brain.test.ts` or `tests/drive.test.ts`, whichever already has a harness that writes a stamped ledger row): after the main loop makes a Read, a `git status`, one call to a tool of the mod and one call to another tool, the next stamped ledger row's `brain.calls` has `read` 1, `vcs` 1, `mod` 1 and `other` 1.

## Left to you

- Whether the `tool.call` hook that calls `driveGuard` runs for the mod's own tools (each also has its own `tool.call` hook). The engine test above answers it. If it does not run for them, count `mod` from the mod's own tool hooks through one small helper, and say in your hand-back which it was.
- The names of the helpers and the exact wording of the doc lines and the changelog entry.
- Where in evidence.mjs the per-card figures are computed (inside `perCard` or beside it).

## Done when

- hooks/lib/drive.ts exports a pure `stampKind(tool, input, writes, repeat)` that returns `callKind`'s kind when it has one, else `mod` for a tool whose name starts with `mcp__chassis-delegation__`, else `vcs` for a Bash command whose first word is git or gh, else `other`; `callKind` itself, the drive warn row and the `brain calls:` line are unchanged
- The main loop's calls of the three new kinds are counted in the same drive record as the four old kinds (optional fields `mod`, `vcs`, `other`; absent reads as 0), flushed by the same debounce; they add nothing to `ctxTokens`, `ctxCalls` or the turn's call count; a subagent's calls are still not counted
- `brainStamp(rec, since, drive)` in hooks/lib/brain.ts writes `calls: { run, read, edit, spawn, mod, vcs, other }` (all seven keys, running session totals) when a drive record is passed and no `calls` key when none is; `brainStampNow` in hooks/register.ts always passes one, so every `brain` stamp this version writes carries `calls`
- bin/evidence.mjs --scorecard reads `brain.calls`, takes the difference between stamps of one `since` by the same rule it uses for `pairs`, attributes it to the row's task, and each `brains[<pair>]` entry of the JSON gains `callCards` and `callsPerCard` (`{ run, read, edit, spawn, mod, vcs, other, all }`, one decimal; null when no card of that setup has calls)
- The text scorecard prints a `brain calls/card` block after the brain block, one row per setup that has calls; a setup or ledger with no `calls` on any row prints no row and no block (unknown, never zero); the text scorecard of every existing fixture ledger is unchanged and their JSON differs only by the two new keys
- The new node test file tests/node/braincalls.node.mjs covers stampKind, the counting helpers, brainStamp with and without a drive record, and the scorecard on a new fixture ledger; one engine test proves a stamped ledger row carries the counts
- docs/internals.md, docs/guide.md and CHANGELOG.md (under `## Unreleased`) describe the field and the block

## Review

Brain review (Fable 5.2): The diff does what the card decided and no more. `stampKind` falls back to mod, vcs or other only where `callKind` gives none, so the four old counts and the `brain calls:` line are untouched; `driveGuard` counts the new kinds through one shared helper and returns before the turn count and the watch; `brainStamp` writes `calls` only when a drive record is passed. The scorecard keeps a base for `calls` apart from the `pairs` base and reads `calls` before the `pairs` early return, so a row may carry either. I ran the new script over this repo's real ledger: it prints as before and no calls block, as it should for rows stamped before this card. The worker's engine test settles the open question: the general tool.call hook does see the mod's own tools. One cosmetic slip, the indent of the return line in `brainStampNow`, left as it is. The attempt ran on Haiku through the explore pick; its first hand-back was judged no-report because it stopped to wait on its own engine run, then it finished and was judged consistent on the same attempt.
