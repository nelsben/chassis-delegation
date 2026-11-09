---
id: MOD-343
title: The evidence script prints a scorecard by week and by model: first-try rate, rework, choices, escaped defects, issue links and the brain's share
domain: mod
tier: standard
status: merged
scope: [bin/evidence.mjs, tests/node/evidence.node.mjs, tests/fixtures/evidence/ledger-c.jsonl, docs/internals.md, docs/guide.md, CHANGELOG.md]
forbid: [hooks/**, bin/evidence-charts.mjs, docs/evidence.md, docs/evidence/**, tests/fixtures/evidence/ledger-a.jsonl, tests/fixtures/evidence/ledger-b.jsonl, .claude-plugin/**, docs/cards/**]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/evidence.node.mjs
gate: validate, node
budget: 2-attempts
spend: 6
---
## Why

`bin/evidence.mjs` turns ledgers into one anonymized summary of outcomes and cost over the whole window. It does not say whether the mod is getting better or worse week on week, and it does not read the fields three recent cards put on the ledger: a worker's choice count (`choices`, MOD-338), the cards a card repairs and whether it has an issue link (`fixes`, `linked` on the spawn row, MOD-341), and the brain's running spend (`brain` on judged and merged rows, MOD-342). This card adds a scorecard that reads them. It must work on a ledger that has none of those fields.

## Before you start

- `bin/evidence.mjs`, whole (133 lines). Note: the fold `R.judged`, keyed `[task, subtask, lineage, attempt]`, where the newest row by `at` wins; spawn rows (`r.event !== undefined`) are skipped today; `fold` reads the old word `verified` as `consistent`; the header comment's promise that no path, task id, sha, session id, agent id or free text is ever printed.
- `tests/node/evidence.node.mjs` and the two fixtures beside `tests/fixtures/evidence/ledger-a.jsonl`: the test shape (it spawns the script).
- `docs/internals.md`, the Evidence section.

## Design (decided by the brain; build it, do not redesign it)

### 1. The command line

- `node bin/evidence.mjs <ledger>…` prints the JSON as now, with one more top-level key, `scorecard`.
- `node bin/evidence.mjs --scorecard <ledger>…` prints the scorecard as plain text instead of the JSON. `--scorecard` may sit anywhere among the arguments. Any other argument that starts with `--` is an error: the usage line on stderr, exit 2. The usage line becomes `usage: node bin/evidence.mjs [--scorecard] <ledger.jsonl> [<ledger.jsonl>...]`.

### 2. The definitions

A **card** is one `[repo, task, subtask, lineage]` (the existing fold key without the attempt). A row's **time** is `verdictAt` when it is a number, else `at`; a row with neither is left out of the scorecard. A **week** is the ISO week of that time in UTC, written `2026-W45` (2 to 8 November 2026 is `2026-W45`).

Per week:

| Key | Meaning |
|---|---|
| `cards` | cards whose attempt 1 has a judged row, placed in the week of the earliest judged row of attempt 1 |
| `firstTry` | of those, cards whose newest attempt-1 row is `consistent` and that have no judged row with an attempt above 1 |
| `firstTryStrict` | of those, cards whose earliest attempt-1 row is `consistent` and that have no attempt above 1 |
| `rework` | of those, cards with a judged row whose attempt is above 1 |
| `usd` | the dollars of the folded judged rows (as `R.judged` keeps them, so a re-verify is not counted twice) whose time is in the week, 2 decimals |
| `choicesStated` | folded judged rows in the week whose `choices` is a number |
| `choicesMean` | the mean of those numbers, 2 decimals; `null` when `choicesStated` is 0 |
| `linkedKnown` | attempt-1 spawn rows (`event: 'spawn'`, `attempt` 1) in the week whose `linked` is a boolean; one per card, the earliest |
| `linked` | of those, the ones with `linked: true` |
| `fixCards` | attempt-1 spawn rows in the week, one per card, with a non-empty `fixes` array |
| `escaped` | the number of distinct `[repo, id]` pairs those rows name in `fixes` |
| `merged` | distinct tasks with a `kind: 'merged'` row in the week |
| `brainUsd` | for each `[repo, brain.since]`, the largest `brain.usd` on any row; placed in the week of the newest row that carries that `since`; summed, 2 decimals; `null` when no row in the week placed one |
| `brainShare` | `brainUsd / (brainUsd + usd)`, 2 decimals; `null` when `brainUsd` is `null` or the sum is 0 |

Per model (the `alias` of the row, `unknown` when absent): `cards`, `firstTry`, `firstTryStrict`, `rework` by the alias of the card's earliest attempt-1 judged row; `usd`, `choicesStated`, `choicesMean` by each folded row's own alias. No other keys.

The JSON: `scorecard: { weeks: { '2026-W45': {…} }, models: { sonnet: {…} } }`, both key-sorted, every key above present in every entry. Only counts, dollars, week labels and model aliases are printed: no task id from `fixes` reaches the output.

### 3. The text form

A title line, then one line per week oldest first, then a blank line, then one line per model. Columns in this order, right-aligned under a header line: `week`, `cards`, `1st try` (as `firstTry/cards` and a percent, `2/3 67%`), `strict` (percent), `rework`, `choices` (the mean, or `-`), `linked` (`linked/linkedKnown`, or `-` when `linkedKnown` is 0), `escaped`, `brain` (the share as a percent, or `-`), `usd`. A model line has the same columns with `-` where it has no key. A percent over 0 cards is `-`. With no judged row at all, the text is the single line `no judged attempts`.

### 4. The fixture and its expected numbers

New file `tests/fixtures/evidence/ledger-c.jsonl`. All times UTC; write `at` in milliseconds. Task ids are `T-1` to `T-5`, subtask `main`, lineage 1.

| Time | Row |
|---|---|
| 2026-11-03 09:00 | spawn `T-1` attempt 1, alias `sonnet`, `linked: true` |
| 2026-11-03 09:10 | judged `T-1` attempt 1 `consistent`, alias `sonnet`, `usd: 1`, `choices: 2`, `brain: { since: 100, usd: 3, turns: 4, edits: 0 }` |
| 2026-11-03 09:20 | `kind: 'merged'` `T-1` |
| 2026-11-03 10:00 | spawn `T-2` attempt 1, alias `sonnet`, `linked: false` |
| 2026-11-03 10:10 | judged `T-2` attempt 1 `refuted`, `firstFailed: 'scope'`, alias `sonnet`, `usd: 2` |
| 2026-11-03 10:15 | judged `T-2` attempt 1 `consistent` (the same key, a re-verify), alias `sonnet`, `usd: 2`, `choices: 0`, `brain: { since: 100, usd: 5, turns: 9, edits: 0 }` |
| 2026-11-03 10:20 | `kind: 'merged'` `T-2` |
| 2026-11-03 11:00 | spawn `T-3` attempt 1, alias `haiku` (no `linked` key) |
| 2026-11-03 11:10 | judged `T-3` attempt 1 `refuted`, alias `haiku`, `usd: 0.5` |
| 2026-11-03 11:20 | spawn `T-3` attempt 2, alias `haiku` |
| 2026-11-03 11:30 | judged `T-3` attempt 2 `consistent`, alias `haiku`, `usd: 0.5` |
| 2026-11-10 09:00 | spawn `T-4` attempt 1, alias `sonnet`, `linked: true`, `fixes: ['T-1', 'T-2']` |
| 2026-11-10 09:10 | judged `T-4` attempt 1 `consistent`, alias `sonnet`, `usd: 1`, `brain: { since: 200, usd: 1, turns: 2, edits: 0 }` |
| 2026-11-10 10:00 | spawn `T-5` attempt 1, alias `sonnet`, `linked: true`, `fixes: ['T-1']` |
| 2026-11-10 10:10 | judged `T-5` attempt 1 `consistent`, alias `sonnet`, `usd: 1`, `choices: 4` |

Expected `scorecard` for that file alone:

- `weeks['2026-W45']`: `cards 3, firstTry 2, firstTryStrict 1, rework 1, usd 4, choicesStated 2, choicesMean 1, linkedKnown 2, linked 1, fixCards 0, escaped 0, merged 2, brainUsd 5, brainShare 0.56`
- `weeks['2026-W46']`: `cards 2, firstTry 2, firstTryStrict 2, rework 0, usd 2, choicesStated 1, choicesMean 4, linkedKnown 2, linked 2, fixCards 2, escaped 2, merged 0, brainUsd 1, brainShare 0.33`
- `models.sonnet`: `cards 4, firstTry 4, firstTryStrict 3, rework 0, usd 5, choicesStated 3, choicesMean 2`
- `models.haiku`: `cards 1, firstTry 0, firstTryStrict 0, rework 1, usd 1, choicesStated 0, choicesMean null`

Further tests:

- Over `ledger-a.jsonl` and `ledger-b.jsonl` (which have none of the new fields): every week entry has `choicesStated 0`, `choicesMean null`, `linkedKnown 0`, `fixCards 0`, `escaped 0`, `brainUsd null`, `brainShare null`, and the sum of `cards` over the weeks equals the number of cards with a judged attempt 1.
- Every other top-level key of the JSON is unchanged for `ledger-a` and `ledger-b`: the existing assertions stay, and the one that pins the list of top-level keys gains `scorecard`.
- `--scorecard` over `ledger-c.jsonl` prints text that is not JSON, holds a line starting `2026-W45` that contains `2/3 67%`, a line starting `2026-W46`, and lines for `sonnet` and `haiku`; it contains no `T-1`.
- `--scorecard` over an empty file prints `no judged attempts`.
- `--nope` exits 2 with the usage line on stderr.

### 5. Left to you (list each as a `choice:` line in your hand-back, above the report)

- Local names and how the script is split into helpers.
- Column widths and the title line of the text form.
- The wording of the docs sentences and the CHANGELOG bullet.

## Done when

- `tests/fixtures/evidence/ledger-c.jsonl` holds the rows of the table, and `tests/node/evidence.node.mjs` asserts every number listed in Design 4 and the further tests; the new tests fail before the change and pass after.
- The script still reads only the files named, writes nothing, uses only Node built-ins, and prints no path, task id, sha, session id, agent id or free text in either form.
- `docs/internals.md`, in Evidence, lists each scorecard key with its meaning and names `--scorecard`; `docs/guide.md` gains a short "Is the mod working?" passage with the one command to run and how to read the columns.
- `CHANGELOG.md` has one bullet under a `## Unreleased` heading at the top (add the heading if it is absent), under `### Added`, in the style of the bullets below it, ending `(MOD-343).`
- Both gates pass: validate, node.

## Review

Brain review: script diff read whole. The scorecard keys, the week and card definitions, the fold for dollars and choices, the spawn-row counts and the brain share are as Design 2 gives them; the text form and the usage error are as Designs 1 and 3. The hand-back had no report line, so the brain ran the verifier on the head; consistent. Worker choices (4 listed): helper names, column widths and title, docs wording, and that repo means the ledger's argument label.
