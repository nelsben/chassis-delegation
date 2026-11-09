---
id: MOD-340
title: tree reconcile counts a card whose status is merged even when the ledger has no merged row for it
domain: mod
tier: standard
status: merged
scope: [hooks/lib/reconcile.ts, hooks/register.ts, tests/node/reconcile.node.mjs, tests/reconcile.test.ts, tests/reconcileall.test.ts, docs/guide.md, docs/review-and-merge.md, CHANGELOG.md]
forbid: [hooks/lib/allow.ts, hooks/lib/issuematch.ts, hooks/lib/landtree.ts, hooks/lib/mergecmd.ts, hooks/lib/version.ts, hooks/templates/**, .claude-plugin/**, docs/cards/**]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/reconcile.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 8
---
## Why

`/delegation tree reconcile` finds open sub-issues whose work a merged card already did. It learns which cards are merged only from ledger rows of kind `merged`. A repo that adopted the mod before those rows existed, or whose ledger was trimmed, has cards the mod itself marked `status: merged` and no such rows: one adopting repo has 206 merged cards and 0 merged rows, so reconcile there matches nothing. The card file is the mod's own record of a merge and should count.

## Before you start

- `hooks/register.ts`, function `reconcileWith`: after reading the card folder into `cardsById` it builds `merged: MergedCard[]` in a loop over `rows.filter(r => r.kind === 'merged' && typeof r.task === 'string').reverse()` (find the comment `merged cards, newest first`). That loop is what this card moves and extends.
- `hooks/lib/reconcile.ts` (pure): `MergedCard`, `reconcileOf`, and `doneComment(card, pr?)`, which already writes a comment with no PR number.
- `tests/node/reconcile.node.mjs`: the pure test shape.

## Design (decided by the brain; build it, do not redesign it)

### 1. One pure function in `hooks/lib/reconcile.ts`

```ts
export type CardLite = { id: string; status?: string; issue?: number; parent?: number; scope: readonly string[] }
/** The merged cards reconcile matches against: ledger merged rows newest first, then cards whose status is merged that no row named. */
export function mergedCards(rows: readonly Record<string, unknown>[], cards: readonly CardLite[]): MergedCard[]
```

Rules, in order:

1. Ledger part, unchanged from today's loop: rows with `kind === 'merged'` and a string `task`, newest first (the last row first), one entry per task. Scope is the card's scope when the card exists and its scope is not empty, else the `files` of every row of that task. An entry with an empty scope is skipped. `pr` is the row's `pr` when it is a number. `issue` and `parent` come from the card.
2. Card part, new: every card whose `status` is exactly `merged` and whose id the ledger part did not produce an entry for, in the order `cards` gives them. Scope is the card's scope; a card with an empty scope is skipped. No `pr`. `issue` and `parent` from the card.
3. The result is the ledger part followed by the card part.

Only the word `merged` counts. Other words a person may have typed (`done`, `closed`) are not read: mapping a repo's own status words is a separate, later change.

### 2. The caller

`reconcileWith` replaces its loop with one call: `mergedCards(rows, [...cardsById].map(([id, c]) => ({ id, ...c })))`. Nothing else in `reconcileWith` changes: `inFlight`, the views, the text and the `--confirm` path stay as they are.

### 3. The cases (node test)

| Rows | Cards | Result |
|---|---|---|
| merged row for `A-1` with `pr: 7` | `A-1` merged, scope `['a/**']`, issue 5 | `[{ id: 'A-1', scope: ['a/**'], pr: 7, issue: 5 }]` |
| none | `A-2` merged, scope `['b/x.ts']`, issue 6, parent 3 | `[{ id: 'A-2', scope: ['b/x.ts'], issue: 6, parent: 3 }]` |
| none | `A-3` merged, scope `[]` | `[]` |
| none | `A-4` queued, scope `['c/**']` | `[]` |
| none | `A-5` with status `done` | `[]` |
| merged row for `A-1` | `A-1` merged and `A-2` merged | `A-1` once (from the row), then `A-2` |
| merged rows for `A-1` then `A-6` | both merged | `A-6` first, then `A-1` (newest first) |
| merged row for `A-7` and a row of `A-7` with `files: ['d/y.ts']` | no card for `A-7` | `[{ id: 'A-7', scope: ['d/y.ts'] }]` |

Engine (`tests/reconcile.test.ts`): with an empty ledger, a card `status: merged` with `issue: 12` and an open sub-issue #12 under the epic, reconcile lists #12 as done in that card, and with `--confirm` closes it with the comment `done in <card id>`.

### 4. Left to you (list each as a `choice:` line in your hand-back, above the report)

- Local names inside `mergedCards`.
- The wording of the docs sentence and the CHANGELOG bullet.

## Done when

- `tests/node/reconcile.node.mjs` holds every row of the table as a test; the card-part rows fail before the change and pass after.
- `mergedCards` and `CardLite` are exported from `hooks/lib/reconcile.ts` as Design 1 signs them, with no `$` call, and `reconcileWith` gets its merged list from it.
- The engine case in Design 3 passes, and every existing test in `tests/reconcile.test.ts` and `tests/reconcileall.test.ts` passes with no assertion removed.
- The docs that describe `tree reconcile` (`docs/guide.md` or `docs/review-and-merge.md`, wherever it is described) say that a card with `status: merged` counts with or without a ledger row, and that other status words do not.
- `CHANGELOG.md` has one bullet under a `## Unreleased` heading at the top (add the heading if it is absent), under `### Fixed`, in the style of the bullets below it, ending `(MOD-340).`
- All three gates pass: validate, node, test.

## Review

Brain review: diff read whole. mergedCards is the old loop moved into the pure file plus the card part, as Design 1 gives it; reconcileWith calls it once. Worker choices: local names, the docs sentence (guide only; review-and-merge has no reconcile text), the changelog wording, the engine test's card and issue numbers.
