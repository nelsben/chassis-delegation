---
id: MOD-417
title: A review's ledger row carries the worker's tier, where the reviewer's copy of the hand-back came from, and the refuted and misreported rows' text
domain: mod
tier: standard
status: merged
issue: 592
parent: 589
fixes: []
spike: MOD-414
scope: [hooks/lib/review.ts, hooks/lib/attempts.ts, hooks/register.ts, tests/node/reviewledger.node.mjs, tests/node/*.mjs, tests/*.test.ts, docs/internals.md, docs/review-and-merge.md, CHANGELOG.md]
forbid: [docs/cards/**, docs/spikes/**, docs/mockups/**, hooks/templates/**, hooks/lib/version.ts, hooks/lib/waitstate.ts, hooks/lib/quiet.ts, hooks/lib/brief.ts, .claude-plugin/plugin.json, README.md, docs/upgrading.md, bin/**]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/reviewledger.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Issue #592. A review row's tier is the reviewer's tier and the row keeps only counts, so the MOD-414 audit had to read every reviewer's transcript for the claim text and find the worker's tier on another row; it could not say which path had filled the reviewer's hand-back. With the worker's tier, the hand-back's source and the rows on the review row, the next audit (after the review-on trial) reads the ledger alone.

## Before you start

- `hooks/lib/review.ts`: `ReviewMarker`, `reviewMarker`, `parseReviewMarker` (its `WORD` pattern already allows the two words), `ReviewedHandback` and `reviewHandback` (MOD-416: the source is `given`, `transcript` or `report-only`), `cutTo`.
- `hooks/register.ts`: `SpawnRecord` (search `review?: { worker?: string; sha?: string }`); `async function prepareReview` (it calls `reviewHandback` inside the `handback:` value and builds the marker a few lines above); `async function decideReview` (it has `worker`, the worker's spawn record, and `reviewed`, the reviewed attempt record, and builds the reviewer's `SpawnRecord` with `review: { worker, sha }`); `async function orphanReview` (it builds a spawn record from `latest`, the reviewed attempt); `async function finalizeReview` (its last `appendLedger` call writes the row; `shown` is the refuted lines under the verdict and `misRows` the misreported rows).
- Tests to read first: `tests/review.test.ts` (the marker tests near `parseReviewMarker`, the harness that spawns a reviewer through the spawn hook, and the `MOD-258: orphanReview` describe with its `ledger(w)` helper), `tests/node/reviewlabel.node.mjs`.
- Docs: the line in `docs/internals.md` that starts "- A reviewer's line has", and the sentence in `docs/review-and-merge.md` that starts "With `verdictVerbosity: full`".

## Design (decided by the brain; build it, do not redesign it)

1. **The marker.** `ReviewMarker` gains `handback?: 'transcript' | 'report-only'`. `reviewMarker` writes ` handback=<word>` after the sha (after the worker when there is no sha) only when it is set. `parseReviewMarker` returns it when the value is one of the two words; any other value is dropped and the rest of the marker parses as it does today.
2. **`prepareReview`.** Call `reviewHandback` once, before the plan is built, keep the result, use it for the `handback:` value as today, and add `handback: <source>` to the marker when the source is not `given`. A hand-back with words of its own therefore gives the same prompt as before this card, character for character.
3. **The spawn record.** `SpawnRecord.review` gains `workerTier?: Tier` and `handback?: 'transcript' | 'report-only'`. `decideReview` sets `workerTier` to `worker?.tier ?? reviewed?.tier` (absent when neither is known) and `handback` from the marker. `orphanReview` sets `workerTier` to `latest.tier` and no `handback` (it cannot know).
4. **The ledger row.** In `finalizeReview`, the object passed to the last `appendLedger` gains, after the spread of the judged record: `workerTier` from `spawn.review?.workerTier` when set; `handback` from `spawn.review?.handback` when set; `refutedLines` from `shown`; `misreportedLines` from `misRows`. The two lists go through one new pure export in hooks/lib/review.ts, `ledgerLines(lines)`: the first 12 lines, each cut to 300 characters with the file's `cutTo`; the caller leaves the key off when the list is empty. The row's `tier` and `alias` stay the reviewer's.
5. **Ledger only.** Do not add any of the four to the `AttemptRecord` that `patchReview` stores: the store is near its size limit (the same rule as MOD-338's `choiceLines`). `hooks/lib/attempts.ts` is in scope only in case the ledger row's type lives there and needs the four optional keys; change nothing else in it.
6. **Left as it is.** The template, `reviewAdvice`, the verdict row's text, the quiet row and `bin/evidence.mjs` are not changed.
7. **Docs.** docs/internals.md, on the reviewer's line: the row's `tier` is the reviewer's tier; `workerTier` is the tier of the worker whose hand-back was reviewed; `handback` is `transcript` or `report-only` when the reviewer's copy of the hand-back did not come with the worker's own turn (absent otherwise, and on rows written before this version); `refutedLines` and `misreportedLines` are the rows as shown, at most 12, each cut to 300 characters. docs/review-and-merge.md: one sentence after the ledger sentence naming the four keys. CHANGELOG.md: one bold-led entry under `## Unreleased`, `### Changed`, ending `(MOD-417, #592)`.

## Tests

Node tests in the new file `tests/node/reviewledger.node.mjs` (write them first; they are the red test):
- `reviewMarker` with `handback: 'transcript'` ends ` handback=transcript]]` and `parseReviewMarker` of it returns the same marker; the same for `report-only`; a marker with no `handback` is the exact string it is today (assert the full string for one with a worker and a sha).
- `parseReviewMarker` of a marker line with `handback=given` or `handback=other` returns the marker with no `handback` key.
- `ledgerLines`: 14 lines give the first 12; a 400-character line comes back 300 characters long ending in `…`; an empty list gives an empty list.

Engine tests in `tests/review.test.ts`, two:
1. Through the spawn hook: a worker at a known tier, a reviewer spawned with a marker that names that worker and `handback=transcript`, and a reviewer hand-back with one refuted row, one misreported row and a matching block. The review's ledger row has `workerTier` equal to the worker's tier, `handback` equal to `transcript`, `refutedLines` holding the refuted line and `misreportedLines` holding the misreported line, and its `tier` is the reviewer's.
2. In the `MOD-258: orphanReview` describe: the review's ledger row has `workerTier` equal to the reviewed attempt's tier and no `handback` key.

Change no existing expectation. If an existing test fails, the code is wrong, not the test.

## Left to you

- The names of private helpers, and the exact wording of the doc sentences and the changelog entry.
- Which existing harness in `tests/review.test.ts` the first engine test is built on.

## Done when

- The review marker takes an optional handback word, transcript or report-only: reviewMarker writes it after the sha when it is set and writes nothing for it otherwise, so a marker without it is the same string as before this card; parseReviewMarker reads it when it is one of the two words and drops any other value while still parsing the marker
- prepareReview in hooks/register.ts puts the source of the hand-back it chose (the reviewHandback result) into the marker when that source is not given
- The reviewer's spawn record (its review object) carries workerTier, the tier of the worker whose hand-back is reviewed, and the marker's handback word when it has one: decideReview sets them from the worker's spawn record or the reviewed attempt record, and orphanReview sets workerTier from the reviewed attempt
- The ledger row finalizeReview appends carries workerTier when it is known, handback when the spawn record has it, refutedLines (the refuted lines shown under the verdict) and misreportedLines (the misreported rows), each list holding at most the first 12 lines, each line cut to 300 characters, and each key absent when its list is empty; the row's tier stays the reviewer's tier
- None of the four new values is written to the stored attempt record: they are on the ledger row only, and the spawn record gains only the two short words
- The new node test file tests/node/reviewledger.node.mjs covers the marker round trip and the line cutting; the engine suite proves a review's ledger row carries workerTier, handback, refutedLines and misreportedLines, and that an orphan review's row carries workerTier and no handback key
- docs/internals.md says a review row's tier is the reviewer's and names the four new keys; docs/review-and-merge.md names them where the ledger's review row is described; CHANGELOG.md has one bold-led entry under the existing Unreleased section

## Testing

- Planned: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/reviewledger.node.mjs
- Red test: failed before the change (.delegation/MOD-417/red-1.txt)
- Gate validate: pass · ✔ Validation passed with warnings · 12 s · verify pass reused at merge
- Gate node: pass · 2181 pass, 0 fail, 1230 skipped (engine tests: claude plugin test runs them) · 18 s · verify pass reused at merge
- Gate test: pass · 2348 pass, 0 fail, Ran 2348 tests across 111 files. [306.62s] · 5.1 min · verify pass reused at merge
- Test files changed: 3 (tests/hooks4.test.ts, tests/node/reviewledger.node.mjs, tests/review.test.ts); tests added: 9
- Worker ran:
  - red test before the change -> `tests/node/reviewledger.node.mjs` failed because `review.ts` had no `ledgerLines` export (saved in red-1.txt).
  - the two new engine tests -> both pass (spawn-hook ledger row and orphan row).

## Review

Brain review (Fable 5.2): I read the whole diff at 62e92a2. It builds the card's design: the marker's optional handback word, written only when set and read only when it is one of the two words; the worker's tier and that word on the reviewer's spawn record; and the four keys on the ledger row alone, with the lists cut by one pure helper. The stored attempt record is untouched, and so is hooks/lib/attempts.ts, since the ledger row is an untyped record. The card said to change no existing expectation and the worker changed one, in tests/hooks4.test.ts, and said so: the verify-path test's expected marker now ends handback=report-only. That is the behaviour this card asks for, so the card's rule was too strict and the change stands. It also lengthened the worker's fixture text in two other tests there, which shows a consequence of MOD-416 I had not spelled out: a real hand-back with fewer than 40 characters of its own words beside the report is treated as report-only, gets the note and now the ledger word. I accept that: such a hand-back gives the reviewer nothing more than the report line, though the note's words (could not be read) are loose for that case. The worker's amend line for tests/hooks4.test.ts was not needed, as the scope's test glob already covers it. Its first two engine runs had load timeouts in unrelated tests; its third run and the verifier's own gate were clean. Not checked: the type-check (no tsc on PATH).
