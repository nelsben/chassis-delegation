---
id: MOD-345
title: The scorecard compares brain setups: cost, compactions and card outcomes by the brain's model, effort and context window
domain: mod
tier: standard
status: merged
scope: [bin/evidence.mjs, tests/node/evidence.node.mjs, tests/fixtures/evidence/ledger-d.jsonl, docs/internals.md, docs/guide.md, CHANGELOG.md]
forbid: [hooks/**, bin/evidence-charts.mjs, docs/evidence.md, docs/evidence/**, tests/fixtures/evidence/ledger-a.jsonl, tests/fixtures/evidence/ledger-b.jsonl, tests/fixtures/evidence/ledger-c.jsonl, .claude-plugin/**, docs/cards/**]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/evidence.node.mjs
gate: validate, node
budget: 2-attempts
spend: 6
---
## Why

MOD-343 gave `bin/evidence.mjs` a scorecard by week and by worker model. MOD-344 put on each brain stamp how the brain was run: its model and effort (`pair`), its context window, and its compactions. The person running the mod wants to know which brain setup to use when: what each costs per card, and whether the cards a setup cut pass first time. This card adds that comparison.

## Before you start

- `bin/evidence.mjs`, whole, as MOD-343 left it: the scorecard's definitions of a card, a row's time, `firstTry`, `firstTryStrict`, `rework`, `choicesMean`, and how `brainUsd` takes the largest `brain.usd` per `[repo, brain.since]`.
- `docs/internals.md`, Store and ledger: the `brain` stamp's keys (`since`, `usd`, `turns`, `edits`, `pair`, `window`, `compactions`, `compactTokens`).
- `tests/node/evidence.node.mjs` and `tests/fixtures/evidence/ledger-c.jsonl`.

## Design (decided by the brain; build it, do not redesign it)

### 1. Sessions and setups

- A **session** is one `[repo, brain.since]` over every row that carries a `brain` stamp. Its facts come from its newest stamped row (by the row's time): `pair`, `window`, `compactions`, `compactTokens`, `usd`, `turns`. Its `usd` and `turns` are the largest seen on any of its rows.
- A session's **window label**: when `compactTokens` is a number, that number rounded to the nearest 50,000 and written in thousands (`250k`); else when `window` is a number, the same rounding of `window`; else `unknown`.
- A session's **setup** is `` `${pair ?? 'unknown'} @${window label}` ``, for example `opus/medium @250k`.
- A **card belongs to** the session whose `since` is on the earliest judged row of its attempt 1. A card whose row has no stamp belongs to no session and is left out of this section.
- A grant is a row with `kind: 'amend'` whose `source` is not `'worker'`. It belongs to the session that the card of its `task` belongs to (subtask `main` when the row names none). An amend row has no lineage: when the task and subtask have more than one card, take the one with the largest lineage. As in MOD-343, `repo` here is the ledger's argument label, and "earliest" and "newest" compare `at`.

### 2. The keys

`scorecard.brains` is an object keyed by setup, key-sorted. Each entry:

| Key | Meaning |
|---|---|
| `sessions` | sessions with this setup |
| `brainUsd` | the sum of their `usd`, 2 decimals |
| `turns` | the sum of their `turns` |
| `compactions` | the sum of their `compactions` (absent counts as 0) |
| `cards` | cards that belong to those sessions |
| `firstTry`, `firstTryStrict`, `rework` | as MOD-343 defines them, over those cards |
| `choicesMean` | the mean `choices` over the folded judged rows of those cards that have a number; 2 decimals; `null` when none |
| `grants` | grants that belong to those sessions |
| `workerUsd` | the dollars of the folded judged rows of those cards, 2 decimals |
| `brainUsdPerCard` | `brainUsd / cards`, 2 decimals; `null` when `cards` is 0 |
| `turnsPerCard` | `turns / cards`, 1 decimal; `null` when `cards` is 0 |
| `brainShare` | `brainUsd / (brainUsd + workerUsd)`, 2 decimals; `null` when the sum is 0 |

With no stamped row, `brains` is `{}`. No `since`, session id or task id is printed.

### 3. The text form

`--scorecard` gains a third block after the models block, when `brains` is not empty: a blank line, a header line, then one line per setup, most `cards` first (then by name). Columns in this order: `brain`, `sessions`, `cards`, `1st try` (`firstTry/cards` and a percent), `strict` (percent), `rework`, `choices`, `grants`, `compactions`, `brain $/card`, `turns/card`, `brain` (the share as a percent), `brain $`. A `null` prints as `-`.

### 4. The fixture and its expected numbers

New file `tests/fixtures/evidence/ledger-d.jsonl`. All times UTC on 2026-11-10; `at` in milliseconds; subtask `main`, lineage 1, worker alias `sonnet` on every judged row.

| Time | Row |
|---|---|
| 09:00 | judged `D-1` attempt 1 `consistent`, `usd: 1`, `choices: 1`, `brain: { since: 100, usd: 2, turns: 10, edits: 0, pair: 'opus/medium', window: 1000000, compactions: 0 }` |
| 10:00 | judged `D-2` attempt 1 `refuted`, `usd: 1`, `brain: { since: 100, usd: 4, turns: 20, edits: 0, pair: 'opus/medium', window: 1000000, compactions: 1, compactTokens: 243000 }` |
| 10:05 | `kind: 'amend'`, task `D-2`, `source: 'brain'` |
| 10:10 | judged `D-2` attempt 1 `consistent` (the same key, a re-verify), `usd: 1`, `choices: 3`, `brain: { since: 100, usd: 5, turns: 24, edits: 0, pair: 'opus/medium', window: 1000000, compactions: 1, compactTokens: 243000 }` |
| 11:00 | judged `D-3` attempt 1 `consistent`, `usd: 2`, `choices: 0`, `brain: { since: 200, usd: 6, turns: 12, edits: 0, pair: 'fable/low', window: 1000000, compactions: 0 }` |
| 12:00 | judged `D-4` attempt 1 `refuted`, `usd: 1`, `brain: { since: 300, usd: 1, turns: 4, edits: 0, compactions: 0 }` (a stamp from before MOD-344: no `pair`, no `window`) |
| 12:30 | judged `D-4` attempt 2 `consistent`, `usd: 1`, `brain: { since: 300, usd: 2, turns: 8, edits: 0, compactions: 0 }` |
| 13:00 | `kind: 'amend'`, task `D-1`, `source: 'worker'` |
| 14:00 | judged `D-5` attempt 1 `consistent`, `usd: 1` (no stamp) |

Expected `scorecard.brains` for that file alone:

- `'opus/medium @250k'`: `sessions 1, brainUsd 5, turns 24, compactions 1, cards 2, firstTry 2, firstTryStrict 1, rework 0, choicesMean 2, grants 1, workerUsd 2, brainUsdPerCard 2.5, turnsPerCard 12, brainShare 0.71`
- `'fable/low @1000k'`: `sessions 1, brainUsd 6, turns 12, compactions 0, cards 1, firstTry 1, firstTryStrict 1, rework 0, choicesMean 0, grants 0, workerUsd 2, brainUsdPerCard 6, turnsPerCard 12, brainShare 0.75`
- `'unknown @unknown'`: `sessions 1, brainUsd 2, turns 8, compactions 0, cards 1, firstTry 0, firstTryStrict 0, rework 1, choicesMean null, grants 0, workerUsd 2, brainUsdPerCard 2, turnsPerCard 8, brainShare 0.5`

`D-5` is in no entry. The worker's amend on `D-1` is not a grant.

Further tests:

- Over `ledger-a.jsonl`, `ledger-b.jsonl` and `ledger-c.jsonl`: `ledger-c`'s stamps have no `pair` or `window`, so its sessions fall under `unknown @unknown`; `ledger-a` and `ledger-b` alone give `brains: {}`. Every number MOD-343's tests assert is unchanged.
- `--scorecard` over `ledger-d.jsonl` holds a line starting `opus/medium @250k` that contains `2/2 100%`, and contains no `D-1`.
- `--scorecard` over `ledger-a.jsonl` prints no third block.

### 5. Left to you (list each as a `choice:` line in your hand-back, above the report)

- Local names and helpers.
- Column widths and the header line.
- The wording of the docs sentences and the CHANGELOG bullet.

## Done when

- `tests/fixtures/evidence/ledger-d.jsonl` holds the rows of the table, and `tests/node/evidence.node.mjs` asserts every number in Design 4 and the further tests; the new tests fail before the change and pass after.
- No existing assertion is removed, and every other key of the JSON is unchanged.
- The script still prints no path, task id, sha, session id, agent id or free text.
- `docs/internals.md`, in Evidence, lists each `brains` key with its meaning and how a setup is named; `docs/guide.md`, in the "Is the mod working?" passage, says in a short paragraph how to read the brains block and that a setup's cards are the ones whose first attempt that session judged.
- `CHANGELOG.md` has one bullet under `## Unreleased` / `### Added`, ending `(MOD-345).`
- Both gates pass: validate, node.

## Review

Brain review: script diff read whole. Sessions, the window label, the setup name, which session a card belongs to, grants and every key of the brains entry are as Designs 1 and 2 give them; the text block is as Design 3. Worker choices (7 listed): where grants are collected, building sessions inside scorecardOf, counting a session with no judged card, column padding, the header line, the dash for a setup with 0 cards, docs wording.
