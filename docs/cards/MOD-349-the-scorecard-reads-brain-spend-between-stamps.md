---
id: MOD-349
title: The scorecard reads the brain's spend between stamps: dollars and requests per card and per week, setups by model version and effort, cards by context size, and which cards a later card repaired
domain: mod
tier: standard
status: merged
scope: [bin/evidence.mjs, tests/node/evidence.node.mjs, tests/fixtures/evidence/ledger-e.jsonl, docs/internals.md, docs/guide.md, CHANGELOG.md]
forbid: [hooks/**, bin/evidence-charts.mjs, docs/evidence.md, docs/evidence/**, tests/fixtures/evidence/ledger-a.jsonl, tests/fixtures/evidence/ledger-b.jsonl, tests/fixtures/evidence/ledger-c.jsonl, tests/fixtures/evidence/ledger-d.jsonl, .claude-plugin/**, docs/cards/**]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/evidence.node.mjs
gate: validate, node
budget: 2-attempts
spend: 8
---
## Why

The 0.9.55 scorecard reads one total and one setup per brain session. A session that cuts thirty cards over three weeks, or changes model or effort part way, reads as one setup, and all its dollars land in the week of its newest row. So the brain's dollars per card and its weekly share are wrong for exactly the long sessions that spend the most.

MOD-348 put the running totals of every model-and-effort pair on each stamp (`brain.pairs`, with `usd`, `turns`, `steps` and `ctx`) and put the stamp on spawn rows. The difference between two stamps of one session is what the brain spent between the two rows. This card makes the scorecard read those differences. It also joins a card's `fixes` back to the card it repaired, so the scorecard can say which week, worker model and brain setup produced work that passed its verdict and was later repaired.

## Before you start

- `bin/evidence.mjs`, whole. `scorecardOf` is the function this card changes; `R.brain`, `when`, `order`, `weekOf`, `nearest`, `round`, `cardKey` and the `cards` map are what it builds on.
- `docs/internals.md`, Store and ledger: the MOD-342, MOD-344 and MOD-348 bullets on the `brain` stamp.
- `tests/node/evidence.node.mjs`, whole, and `tests/fixtures/evidence/ledger-c.jsonl` and `ledger-d.jsonl`.

## Design (decided by the brain; build it, do not redesign it)

### 1. Stamped rows in order

A **session** is one `[repo, brain.since]`, as today. Its **stamped rows** are the rows that carry a `brain` object with a numeric `since` and have a time (`when(row)` is not null), in ascending `order(row)`; rows with equal order keep their file order. Every kind of row counts (spawn, judged, merged).

### 2. Weekly brain dollars (replaces the largest-usd rule)

Walk each session's stamped rows whose `brain.usd` is a number. Each row's dollars are `brain.usd` minus the `brain.usd` of the previous such row of the session (0 before the first), never below 0. They are added to the week of that row's time. A week's `brainUsd` is the sum over all sessions, 2 decimals; `null` when no such row falls in the week. `brainShare` is computed from it as today.

### 3. Intervals (rows that carry `brain.pairs`)

Walk each session's stamped rows in order, keeping a base (the `pairs` and `compactions` of the last row that carried `pairs`).

- A row whose `brain.pairs` is an object **closes an interval** when it is the session's first stamped row (the base is then empty: every value 0) or when a base exists.
- A row with `pairs` that comes after stamped rows without `pairs`, and before any base exists, closes nothing: it only becomes the base. (A session that was running when the mod was upgraded.)
- A row without `pairs` closes nothing and leaves the base alone.

An interval has, for each pair in the row's `pairs`: `usd`, `turns`, `steps`, `ctx`, each the row's value minus the base's value for that pair (an absent or non-numeric value is 0), never below 0. It has `compactions`: the row's `brain.compactions` minus the base's, never below 0. It has the row's `task`, repo and week. Its **top pair** is the pair with the most interval `usd` (ties: more `steps`, then the name that sorts first), and it has none when no pair has `usd` or `steps` above 0. After closing, the row becomes the base.

### 4. Tasks

A **task** is `[repo, task]` with a non-empty task id. Over its intervals it has: dollars per pair, and the totals `usd`, `steps` and `ctx` over all pairs. Its **setup** is the pair with the most dollars over its intervals (ties: more `steps`, then the name that sorts first); a task none of whose intervals has a pair with `usd` or `steps` above 0 has no setup. Its **context** is `ctx / steps`, absent when `steps` is 0.

A card (as the scorecard already defines it, with an attempt-1 judged row) takes the setup and the context of its task.

### 5. `scorecard.brains`, keyed by pair (replaces the MOD-345 block)

One entry per pair that has `usd` or `steps` above 0 in at least one interval, key-sorted. No `@window` in the key any more.

| Key | Meaning |
|---|---|
| `sessions` | sessions with an interval in which this pair has `usd` or `steps` above 0 |
| `brainUsd` | the pair's `usd` over all intervals, 2 decimals |
| `turns`, `steps` | the pair's `turns` and `steps` over all intervals |
| `usdPerStep` | `brainUsd / steps` from the unrounded sum, 4 decimals; `null` when `steps` is 0 |
| `ctxPerStep` | the pair's `ctx / steps`, rounded to a whole number; `null` when `steps` is 0 |
| `compactions` | the `compactions` of the intervals whose top pair this is |
| `cards` | cards whose task has this setup |
| `firstTry`, `firstTryStrict`, `rework` | as the scorecard defines them, over those cards |
| `choicesMean` | the mean `choices` over the folded judged rows of those cards that have a number; 2 decimals; `null` when none |
| `grants` | rows with `kind: 'amend'` whose `source` is not `'worker'` and whose task has this setup |
| `workerUsd` | the dollars of the folded judged rows of those cards, 2 decimals |
| `repaired` | of those cards, the ones a later card repaired (Design 7) |
| `brainUsdPerCard` | the total `usd` (all pairs) of the tasks with this setup that have a card, each task once, divided by `cards`; 2 decimals; `null` when `cards` is 0 |
| `brainUsdMedian` | `nearest(sorted, 0.5)` over those per-task totals; 2 decimals; `null` when there are none |
| `stepsPerCard` | the total `steps` of those tasks divided by `cards`; 1 decimal; `null` when `cards` is 0 |
| `brainShare` | that total `usd` over itself plus `workerUsd`; 2 decimals; `null` when the sum is 0 |

So `brainUsd`, `turns`, `steps`, `usdPerStep` and `ctxPerStep` are exactly what was spent on that pair; the per-card keys describe the cards that were run mainly on it. With no interval, `brains` is `{}`.

### 6. `scorecard.contexts` (new)

Cards grouped by the context of their task, in buckets of 50,000 tokens: the bucket's lower bound in thousands is `Math.floor(context / 50000) * 50`, and its key is `` `${lo}-${lo + 50}k` `` (`200-250k`). Entries are written in ascending order of the lower bound (not key-sorted). Each entry: `cards`, `firstTry`, `firstTryStrict`, `rework`, `repaired`, `brainUsdPerCard` and `stepsPerCard` (the last two as in Design 5, over the tasks in the bucket that have a card). A card whose task has no context is in no bucket. With none, `contexts` is `{}`.

### 7. Repaired cards (joins `fixes` back)

The scorecard already collects, per week, the `[repo, id]` pairs that attempt-1 spawn rows name in `fixes`. Take the union of those pairs over the whole run. For each pair, the **repaired cards** are the cards of that repo whose task is the id and whose lineage is the largest among them; an id that matches no card marks nothing; a card named twice is marked once. Then:

- each week gains `repaired`: cards placed in that week that are repaired;
- each `models` entry gains `repaired`: its cards that are repaired;
- `brains` and `contexts` entries carry `repaired` as their tables say.

`fixCards` and `escaped` keep their meaning (they count in the week of the repairing card).

### 8. The text form

- The week and model lines gain a `repaired` column directly after `escaped`.
- The brains block (when `brains` is not empty): one line per pair, most `cards` first, then by name. Columns in this order: `brain`, `sessions`, `cards`, `1st try` (`firstTry/cards` and a percent; `-` when `cards` is 0), `strict`, `rework`, `repaired`, `choices`, `grants`, `compactions`, `reqs` (`steps`), `ctx/req` (`ctxPerStep` in whole thousands with a `k`, such as `113k`), `$/req` (`usdPerStep`, 2 decimals), `brain $/card`, `median`, `reqs/card`, `brain` (the share as a percent), `brain $`.
- A contexts block after it (when `contexts` is not empty): a blank line, a header, one line per bucket in the JSON's order. Columns: `context`, `cards`, `1st try`, `strict`, `rework`, `repaired`, `brain $/card`, `reqs/card`.
- In the brains block and the contexts block the first column is left-aligned (as the brains block is today), so a line starts with its key.
- A `null` prints as `-`. Nothing else in the text form changes. The header of the brains block still contains the word `sessions`.

### 9. The fixture and its expected numbers

New file `tests/fixtures/evidence/ledger-e.jsonl`. Every row has `subtask: 'main'` and `lineage: 1`; every spawn and judged row has `alias: 'sonnet'`; every stamp has `edits: 0`. Times are UTC on 2026-11-10 (09:00 is `at` 1794301200000) except the last row of the table. Write `P` for the pair `opus-5.5/medium`, `F` for `fable-5.2/high`, `O` for `opus/medium`; a pairs value is written `usd/turns/steps/ctx`.

| Time | Row | `brain` |
|---|---|---|
| 09:00 | spawn `E-1` attempt 1, `linked: true` | `since 500, usd 2, turns 4, compactions 0, pairs { P: 2/4/10/1000000 }` |
| 09:30 | judged `E-1` attempt 1 `consistent`, `usd: 1`, `choices: 1` | `since 500, usd 3, turns 6, compactions 0, pairs { P: 3/6/14/1600000 }` |
| 09:40 | `kind: 'merged'`, task `E-1` | `since 500, usd 3.5, turns 7, compactions 0, pairs { P: 3.5/7/16/1900000 }` |
| 10:00 | spawn `E-2` attempt 1, `linked: false` | `since 500, usd 7.5, turns 10, compactions 1, compactTokens 240000, pairs { P: 3.5/7/16/1900000, F: 4/3/8/2000000 }` |
| 10:20 | judged `E-2` attempt 1 `refuted`, `usd: 1` | `since 500, usd 8.5, turns 12, compactions 1, pairs { P: 4/8/18/2200000, F: 4.5/4/9/2250000 }` |
| 10:25 | `kind: 'amend'`, task `E-2`, `source: 'brain'` | none |
| 10:30 | judged `E-2` attempt 1 `consistent` (the same key, a re-verify), `usd: 1`, `choices: 3` | `since 500, usd 9.5, turns 13, compactions 1, pairs { P: 4/8/18/2200000, F: 5.5/5/11/2750000 }` |
| 11:00 | judged `E-3` attempt 1 `consistent`, `usd: 2`, `choices: 0` | `since 600, usd 10, turns 30, compactions 0, pair 'opus/medium', window 1000000` (a 0.9.55 stamp: no `pairs`) |
| 11:30 | spawn `E-4` attempt 1, `linked: true`, `fixes: ['E-1']` | `since 600, usd 12, turns 34, compactions 0, pairs { O: 10/30/0/0, P: 2/4/9/900000 }` |
| 12:00 | judged `E-4` attempt 1 `refuted`, `usd: 1` | `since 600, usd 13, turns 36, compactions 0, pairs { O: 10/30/0/0, P: 3/6/13/1300000 }` |
| 12:30 | judged `E-4` attempt 2 `consistent`, `usd: 1` | `since 600, usd 14, turns 38, compactions 0, pairs { O: 10/30/0/0, P: 4/8/17/1700000 }` |
| 14:00 | judged `E-5` attempt 1 `consistent`, `usd: 1` | none |
| 2026-11-17 09:00 (`at` 1794906000000) | `kind: 'merged'`, task `E-4` | `since 600, usd 15, turns 39, compactions 0, pairs { O: 10/30/0/0, P: 5/9/18/1750000 }` |

How it reads: session 500's first stamped row closes an interval from zero. Session 600's 11:30 row follows a stamp without `pairs`, so it only sets the base; `O` never moves, so it is in no entry. `E-3` and `E-5` have no setup and no context.

Tasks: `E-1` is all `P`: usd 3.5, steps 16, ctx 1900000 (context 118750). `E-2`: `F` 5.5 and `P` 0.5, so setup `F`; total usd 6, steps 13, ctx 3050000 (context 234615). `E-4`: `P` usd 3, steps 9, ctx 850000 (context 94444).

Expected for that file alone:

- `weeks['2026-W46']`: `cards 5, firstTry 4, firstTryStrict 3, rework 1, usd 7, choicesStated 3, choicesMean 1.33, linkedKnown 3, linked 2, fixCards 1, escaped 1, repaired 1, merged 1, brainUsd 23.5, brainShare 0.77`
- `weeks['2026-W47']`: `cards 0, firstTry 0, firstTryStrict 0, rework 0, usd 0, choicesStated 0, choicesMean null, linkedKnown 0, linked 0, fixCards 0, escaped 0, repaired 0, merged 1, brainUsd 1, brainShare 1`
- `models.sonnet`: `cards 5, firstTry 4, firstTryStrict 3, rework 1, usd 7, choicesStated 3, choicesMean 1.33, repaired 1`
- `Object.keys(brains)`: `['fable-5.2/high', 'opus-5.5/medium']`
- `brains['opus-5.5/medium']`: `sessions 2, brainUsd 7, turns 13, steps 27, usdPerStep 0.2593, ctxPerStep 112963, compactions 0, cards 2, firstTry 1, firstTryStrict 1, rework 1, choicesMean 1, grants 0, workerUsd 3, repaired 1, brainUsdPerCard 3.25, brainUsdMedian 3, stepsPerCard 12.5, brainShare 0.68`
- `brains['fable-5.2/high']`: `sessions 1, brainUsd 5.5, turns 5, steps 11, usdPerStep 0.5, ctxPerStep 250000, compactions 1, cards 1, firstTry 1, firstTryStrict 0, rework 0, choicesMean 3, grants 1, workerUsd 1, repaired 0, brainUsdPerCard 6, brainUsdMedian 6, stepsPerCard 13, brainShare 0.86`
- `Object.keys(contexts)`: `['50-100k', '100-150k', '200-250k']`, in that order
- `contexts['50-100k']`: `cards 1, firstTry 0, firstTryStrict 0, rework 1, repaired 0, brainUsdPerCard 3, stepsPerCard 9`
- `contexts['100-150k']`: `cards 1, firstTry 1, firstTryStrict 1, rework 0, repaired 1, brainUsdPerCard 3.5, stepsPerCard 16`
- `contexts['200-250k']`: `cards 1, firstTry 1, firstTryStrict 0, rework 0, repaired 0, brainUsdPerCard 6, stepsPerCard 13`

Other files:

- `ledger-c.jsonl`: every number the existing test asserts stays, and the entries gain `repaired`: `weeks['2026-W45'].repaired` 2 (`T-1` and `T-2`), `weeks['2026-W46'].repaired` 0, `models.sonnet.repaired` 2, `models.haiku.repaired` 0. Its `brains` and `contexts` are `{}` (no `pairs`), and its weekly `brainUsd` stays 5 and 1.
- `ledger-d.jsonl`: `brains` is `{}` and `contexts` is `{}`.
- `ledger-a.jsonl` and `ledger-b.jsonl`: `brains` and `contexts` are `{}`; every week's `repaired` is 0.

Text form tests:

- `--scorecard` over `ledger-e.jsonl` has a line starting `fable-5.2/high` that contains `1/1 100%`, a line starting `opus-5.5/medium` that contains `1/2 50%` and `113k`, a line starting `200-250k`, and no `E-1`.
- `--scorecard` over `ledger-a.jsonl` still prints no `sessions` and no `@`.

### 10. Existing assertions

Three MOD-345 tests assert the old setups of `ledger-d` (`opus/medium @250k` and the others) and `unknown @unknown` over `ledger-a`, `-b` and `-c`. Replace them with the `{}` assertions above and the `ledger-e` text test. The `ledger-c` weeks and models test gains the `repaired` keys in its expected objects, and the test that lists the zero keys of an old ledger may gain `repaired: 0`. Change no other existing assertion.

### 11. Left to you (list each as a `choice:` line in your hand-back, above the report)

- Local names and helpers, and how the walk is structured.
- Column widths and the header lines.
- The wording of the docs sentences and the CHANGELOG bullets.

## Done when

- `tests/fixtures/evidence/ledger-e.jsonl` holds the rows of the table, and `tests/node/evidence.node.mjs` asserts every number in Design 9 and the text form tests; the new tests fail before the change and pass after.
- The script still prints no path, task id, sha, session id, agent id or free text.
- `docs/internals.md`, in Evidence: the `brainUsd` bullet says the new weekly rule; the `brains` passage is rewritten for Designs 3 to 5 (how an interval is closed, what a task's setup is, each key); a `contexts` passage and a `repaired` bullet are added; the opening sentence names `scorecard: { weeks, models, brains, contexts }`; the text-form paragraph names the contexts block.
- `docs/guide.md`, in the "Is the mod working?" passage: `repaired` in the list of columns (cards from that week that a later card had to repair), and the brains sentences replaced by a short paragraph: a setup is the brain's model version and effort; `reqs`, `ctx/req` and `$/req` are what was spent on it; the per-card columns are the cards run mainly on it; the contexts block shows whether cards cut at a larger context pass less often.
- `CHANGELOG.md`, under `## Unreleased`: one `### Added` bullet (contexts, repaired, the new brains keys) and one `### Changed` bullet (weekly `brainUsd` is now the sum of the differences between stamps; `brains` is keyed by pair and reads only stamps that carry `pairs`, so 0.9.55 stamps no longer appear there). Bold like their neighbours, each ending `(MOD-349).`
- Both gates pass: validate, node.

## Review

Brain review: the diff matches Designs 1 to 10. Stamped rows are walked per session in order with a stable sort; weekly brainUsd is the sum of the differences between stamps; an interval closes on a session's first stamped row or once a base exists, and a pairs row after pairless stamps only sets the base; tasks take the pair with the most dollars as their setup and ctx/steps as their context; brains is keyed by pair, contexts is written in ascending bucket order, and repaired marks the cards of the largest lineage named in an attempt-1 spawn's fixes. The fixture numbers in the test are the card's. The worker's choices (a non-object pair value is skipped; a grant counts for the setup of its task with no card needed; an empty task id feeds the pair totals but forms no task) are within the design. Left as is: the MOD-342 history bullet in internals still says a reader takes the largest usd per since.
