---
id: MOD-364
title: tree reconcile closes only what a merged card names as its own issue; a sub-issue that cards name only as parent is listed with its cards and closed by number, and one with an open card under it is never proposed
domain: mod
tier: standard
status: merged
issue: 498
scope: [hooks/lib/reconcile.ts, hooks/lib/tree.ts, hooks/register.ts, tests/reconcile.test.ts, tests/reconcileall.test.ts, tests/node/reconcile.node.mjs, tests/node/reconcileall.node.mjs, tests/node/reconcilematch.node.mjs, tests/*.test.ts, tests/node/*.node.mjs, tests/harness.ts, docs/guide.md, CHANGELOG.md]
forbid: [bin/**, docs/cards/**, docs/mockups/**, hooks/lib/allow.ts, hooks/lib/version.ts, hooks/lib/mergecmd.ts, hooks/lib/statusmap.ts, hooks/lib/work.ts, hooks/lib/workpane.tsx, .claude-plugin/plugin.json, README.md, docs/upgrading.md]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/reconcile.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

On 0.9.59 a consumer repo ran `tree reconcile all` and got 14 proposed closes, of which 4 were right. Every wrong one came from one rule (MOD-303): an open sub-issue is `done in <card>` when a merged card names it as `parent:` and none of its sub-issues is open. For an issue with no sub-issues that is true as soon as one card under it has merged, whatever else sits under it: a queued card with the same `parent:`, or work that has no card yet. The named parent was then proposed on top of those. And `--confirm` runs every proposal, so a person who agrees with some has to close by hand. This card keeps the live close for what a card names as its own issue, lists the rest for a person to judge, and lets `--confirm` take numbers.

## Before you start

- `hooks/lib/reconcile.ts`, whole: `Reconciled`, `doneIn`, `reconcileOf`, `rowsOf`, `closeLinesOf`, `reconcileAllText`, `parseReconcileArgs`, `RECONCILE_USAGE`.
- `hooks/register.ts`: `reconcileWith` (search `async function reconcileWith`), from the `inFlight` loop to the end; and its two callers (search `parseReconcileArgs(`): the `/delegation tree reconcile` command and the tree tool.
- `hooks/lib/tree.ts`: `TREE_TOOL` (description and input schema).
- `tests/node/reconcile.node.mjs` (the `MOD-362` describe), `tests/node/reconcilematch.node.mjs`, `tests/reconcile.test.ts` (the `MOD-362` describe shows the real `gh` answer shape: `subIssues: { nodes, totalCount }`, a node with no nested list).

## Design (decided by the brain; build it, do not redesign it)

### 1. Pure, `hooks/lib/reconcile.ts` (mark the additions `MOD-364`)

```ts
export type Reconciled = {
  done: { number: number; title: string; card: string; pr?: number }[]
  childrenDone: { number: number; title: string; total: number }[]
  cardsDone: { number: number; title: string; cards: { id: string; pr?: number }[] }[]   // new
  openCards: { number: number; title: string; cards: string[] }[]                         // new
  closedOpen: …; noMatch: …; notRead: …; root?: …                                          // unchanged
}
export const cardsComment = (cards: readonly { id: string; pr?: number }[]): string
export function reconcileOf(o: {
  subs; inFlight; merged; root?                                   // unchanged
  openParents?: ReadonlyMap<number, readonly string[]>            // was a set: issue number -> ids of the open cards that name it as parent
}): Reconciled
```

For an open sub-issue the loop decides in this order, and the first that holds wins:

1. In `inFlight`: no list (as today).
2. In `openParents`: `openCards`, with `cards` = the ids the map gives. This comes before the `read === false` test, since such a sub-issue is not viewed.
3. `read === false`: `notRead` (as today).
4. A merged card whose `issue` is the sub-issue: `done` (as today). A card that names it only as `parent` no longer makes it `done`.
5. It has at least one sub-issue, every one `CLOSED`, and it is not `partial`: `childrenDone` (as today, and now ahead of any `parent:` card).
6. At least one merged card whose `parent` is the sub-issue, no sub-issue that is not `CLOSED`, and not `partial`: `cardsDone`, with `cards` = every such merged card, in `merged` order, each `{ id, pr? }`.
7. Else `noMatch` (as today, with its overlap).

- `doneIn` goes; steps 4 and 6 are two plain finds.
- `root`: no change to its rule. `openParents.has(root.number)` still stops it. Its `listed` set stays `done` plus `childrenDone`, so a sub-issue in `cardsDone` or `openCards` is open and unlisted and stops the root.
- `cardsComment`: one card gives `doneComment(id, pr)`; more give `done in ` + the first five ids joined by `, `, then `, +<k> more` when there are more.
- Ids on a row: the first three joined by `, `, then `, +<k> more`.
- **Rows**, in this order: `done`; `childrenDone`; `cardsDone` rows `#<n> <title> — <k> merged cards under it, none open (<ids>): check its done-when, then close it by number` (`1 merged card under it` for one); `openCards` rows `#<n> <title> — <k> cards under it still open (<ids>)` (`1 card under it still open` for one); `closedOpen`; `noMatch`; `notRead`; the root row; the counts line.
- **Counts line**: today's line, then ` · <e> with merged cards under it` when `cardsDone` is not empty, then ` · <f> with open cards under it` when `openCards` is not empty.
- **Close lines**, in this order: `done`, `childrenDone` and the root, live, as today; then one commented line per `cardsDone` entry, `# gh issue close <n> --repo <repo> --comment '<cardsComment>'`; then the commented `not planned` lines. An `openCards` entry has no close line.
- `reconcileAllText`: a part is `nothing to reconcile` only when `cardsDone` and `openCards` are empty too.
- `parseReconcileArgs` takes `--only <list>`: the next word must match `^\d+(,\d+)*$` with every number from 1 to 999999999; duplicates are dropped and the order given is kept. `--only` without `--confirm`, a second `--only`, or a missing or bad list is the usage error. Both result shapes gain `only?: number[]` (absent when not given). `RECONCILE_USAGE` becomes `/delegation tree reconcile <n>|all [--confirm [--only <n,n,…>]]`.
- `mergedCards`, `overlapOf`, `epicsOf`, `landedFor`, `doneComment`, `childrenComment` do not change.

### 2. Wiring, `hooks/register.ts`

- `openParents` becomes a map built in the same loop, keyed by the `parent` of each card that is neither merged nor parked, its value the ids of those cards sorted with `localeCompare`.
- A sub-issue in `openParents` is not viewed: the test before the view becomes `state !== 'CLOSED' && !inFlight.has(number) && !openParents.has(number)`.
- **`--confirm` without `only`**: as today (the `done` entries, the `childrenDone` entries, then the root). `cardsDone` entries are never closed. When a part has any, one line after that part's closes: `<k> with merged cards under it left for you: /delegation tree reconcile <part number> --confirm --only <n,n,…>` with their numbers ascending.
- **`--confirm` with `only`**: per part the closes are the entries of `done`, then `childrenDone`, then `cardsDone` (comment `cardsComment(cards)`) whose number is in `only`, through the same `closeOne` (cap, pause, lines, landed-file write). The root is tried only when its own number is in `only`, and then by today's rule (every number in `root.after` closed in this run, else the `left open` line). The `left for you` line is not printed. After the last part, one line per number in `only` that matched no entry and no root in any part, ascending: `#<n>: not a proposal of this run, nothing closed`.
- With `all` and `--confirm`, a part prints `nothing to reconcile` only when it has no `done`, no `childrenDone`, no `cardsDone` and no `root`.
- The tree tool: when `input.only` is an array with at least one entry, ` --only <entries joined by ,>` is added after ` --confirm` in the text it hands `parseReconcileArgs` (a bad entry then gives the usage error). The slash command needs no change beyond the parser.
- Update `reconcileWith`'s doc comment: the six lists, what a bare `--confirm` closes, what `only` does.
- `hooks/lib/tree.ts`, `TREE_TOOL`: a property `only: { type: 'array', items: { type: 'integer', minimum: 1 }, description: 'With reconcile: true and confirm: true: close only these issue numbers, each a proposal of the run. Needed to close a sub-issue that merged cards name only as parent.' }`. In the tool description and the `confirm` description, `open parents whose sub-issues are all closed` gains `; a sub-issue that cards name only as parent is closed only when only names it`.

### 3. Not in this card

- No done-when is read, and no close is ever inferred from one.
- An in-flight sub-issue (a card names it as `issue:` and is neither merged nor parked) stays in no list.
- `reconcile all` still walks `type:epic` issues only; closed sub-issues are still not viewed.
- `hooks/lib/mergecmd.ts` and the finish's own closes are untouched.

### 4. Tests

- `tests/node/reconcile.node.mjs`, a `MOD-364` describe with `toEqual` on whole results:
  - a sub-issue with no sub-issues and one merged card naming it as `parent`: `cardsDone` with that card, not `done`; with three such merged cards: all three, in `merged` order;
  - the same with an open card under it (`openParents` map): `openCards` with the ids, and it is `openCards` even with `read: false`;
  - a merged card whose `issue` is the sub-issue while an open card names it as `parent`: `openCards`, not `done`;
  - two closed sub-issues and a merged `parent` card: `childrenDone`; one open sub-issue and a merged `parent` card: `noMatch`; `partial` with a merged `parent` card: `noMatch`;
  - root: a sub-issue in `cardsDone` gives no `root`; a sub-issue in `openCards` gives no `root`;
  - `cardsComment`: one card with a pr, one without, six cards;
  - `reconcileText`: the row order, the two new row forms in singular and plural, the id cut at three, the counts line with neither, one and both new segments, and the close block order with the commented `cardsDone` line;
  - `parseReconcileArgs`: `12 --confirm --only 3,5,3` gives `only: [3, 5]`; `all --confirm --only 7`; and the usage error for `--only` without `--confirm`, with no list, with `3,x`, with `0`, and given twice.
- The `MOD-362` cases that pass `openParents` as a set take the map; the case `a merged card naming it as parent wins: done` becomes the `childrenDone` case above.
- `tests/node/reconcilematch.node.mjs` pins the old rule (`a card whose parent is the story marks it done only when its sub-issues are all closed`): rewrite it to the new lists.
- `tests/node/reconcileall.node.mjs`: fixtures gain `cardsDone: []` and `openCards: []`; a part with only `cardsDone` or only `openCards` is not `nothing to reconcile`.
- Engine, `tests/reconcile.test.ts`, a `MOD-364` describe in the real `gh` shape: a parent with open sub-issue 71 (merged card `A-1` with `parent: 71`) and open sub-issue 72 (merged card `B-1` and queued card `B-2`, both `parent: 72`), neither with sub-issues.
  - The dry run prints the `cardsDone` row for 71 and its commented close line, the `openCards` row for 72 naming `B-2`, no live `gh issue close` line, no row for the parent, and runs no `gh issue view 72`.
  - A bare `--confirm` runs no close and prints the `left for you` line with `--only 71`.
  - `--confirm --only 71` runs one close of 71 with the comment `done in A-1` and prints `closed #71`.
  - `--confirm --only 72,99` runs no close and prints both `not a proposal of this run` lines.
  - The tree tool with `reconcile: true, confirm: true, only: [71]` runs the same one close.
- Every other existing test that pins a `done` made by a `parent:` card, the usage text, or the tool's description is updated to the new behaviour; name each in the hand-back. Change no fixture to dodge a rule.

### 5. Docs

- `docs/guide.md`: the `Imported backlogs drift` paragraph (six lists; the two new row forms and what each means; `done in` now needs the card's own `issue:`; a bare `--confirm` closes done-elsewhere, open parents and the named parent; `--only <n,n,…>` closes the numbers given and is the only way a sub-issue with merged cards under it is closed by the mod); the `**Retire what already shipped.**` step (same, in one or two sentences, with the advice to read each such issue's done-when first); the `tree reconcile <n> --confirm` table row (add `--only`).
- `CHANGELOG.md`: when the file has no `## Unreleased` heading, add it above the newest version heading. Under `### Changed` one bullet (a `parent:` card no longer makes a sub-issue done elsewhere; it is listed and closed only by number; a sub-issue with an open card under it is never proposed), and under `### Added` one bullet (`--only`, and `only` on the tool), both ending `(MOD-364)`. Add a heading when it is absent.

## Left to you (list each as a `choice:` line)

- The fixtures and fake `gh` answers of the new engine tests.
- How `closeOne`'s callers are arranged for the `only` filter.
- The wording of the docs sentences and the changelog bullets.

## Done when

- `reconcileOf` follows the seven steps of section 1 and returns `cardsDone` and `openCards`; `doneIn` is gone; the node tests pass.
- The dry run prints the new rows, the counts line with its optional segments, and a commented close line for each `cardsDone` entry; an `openCards` entry has no close line and is not viewed.
- A bare `--confirm` never closes a `cardsDone` entry and prints the `left for you` line; `--confirm --only` closes only the numbers given and names each number that was no proposal.
- The named parent is never proposed while a sub-issue sits in `cardsDone` or `openCards`.
- The tree tool takes `only`.
- The docs and the changelog carry the lines of section 5.
- The gates `validate`, `node` and `test` pass.

## Review

Brain review (Opus 5.5): reconcileOf follows the seven steps in order (openCards before the read test, done only by a card's own issue, childrenDone ahead of cardsDone, doneIn gone); the root's listed set stays done plus childrenDone, so cardsDone and openCards block it. register.ts builds openParents as a sorted id map, skips the view for a sub-issue under an open card, keeps cardsDone out of a bare --confirm with the left-for-you line, filters done, childrenDone, cardsDone and the root by --only as the card says, and names each number that was no proposal. Parser, tool schema, guide paragraph, step 6, table row and both changelog bullets match section 5. Choices accepted: real-format card ids in the engine fixtures; --only without confirm reaches the parser's usage error. Accept.
