---
id: MOD-362
title: tree reconcile lists an open sub-issue whose own sub-issues are all closed, and the named parent once its sub-issues are closed, with a live close line; --confirm closes them
domain: mod
tier: standard
status: merged
issue: 494
parent: 492
scope: [hooks/lib/reconcile.ts, hooks/lib/tree.ts, hooks/register.ts, tests/reconcile.test.ts, tests/reconcileall.test.ts, tests/node/reconcile.node.mjs, tests/node/reconcileall.node.mjs, tests/*.test.ts, tests/node/*.node.mjs, tests/harness.ts, docs/guide.md, CHANGELOG.md]
forbid: [bin/**, docs/cards/**, docs/mockups/**, hooks/lib/allow.ts, hooks/lib/version.ts, hooks/lib/mergecmd.ts, hooks/lib/statusmap.ts, hooks/lib/work.ts, hooks/lib/workpane.tsx, .claude-plugin/plugin.json, README.md, docs/upgrading.md]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/reconcile.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

A parent issue whose children are all closed is closed by the mod in one place only: inside `merge --finish`, after the card's own issue closes. A repo that closes its leaf issues by hand, by a pull request or at import never runs that step, so the parent stays open. A study of adopter repos counted 13, 28 and 10 such parents in three repos. `tree reconcile` reads exactly the data that shows it (each sub-issue with its own sub-issues' states), yet today it files such a parent under `no match` and prints a commented `not planned` close line for it, which is the wrong advice. This card gives reconcile a list for them, with a live close line, and has `--confirm` close them.

## Before you start

- `hooks/lib/reconcile.ts`, whole (150 lines): `Reconciled`, `reconcileOf`, `doneIn`, `rowsOf`, `closeLinesOf`, `reconcileText`, `reconcileAllText`.
- `hooks/register.ts`: `reconcileWith` (search `async function reconcileWith`), from the `inFlight` set to the end of the confirm loop.
- `hooks/lib/mergecmd.ts`, `walkAncestors`: the comment a finish writes on an ancestor it closes (`all <n> sub-issues done`). Read-only for you.
- `tests/node/reconcile.node.mjs`, `tests/node/reconcileall.node.mjs`, `tests/reconcile.test.ts`, `tests/reconcileall.test.ts`: the tests to extend, and how the engine tests fake `gh`.

## Design (decided by the brain; build it, do not redesign it)

### 1. Pure, `hooks/lib/reconcile.ts` (mark the additions `MOD-362`)

```ts
export type Reconciled = {
  done: { number: number; title: string; card: string; pr?: number }[]
  childrenDone: { number: number; title: string; total: number }[]   // new
  closedOpen: { number: number; title: string; open: number[] }[]
  noMatch: { number: number; title: string; overlap?: string }[]
  notRead: number[]
  root?: { number: number; title: string; total: number; after: number[] }   // new
}
export const childrenComment = (total: number): string => `all ${total} sub-issues done`
export function reconcileOf(o: {
  subs: readonly ReconSub[]; inFlight: ReadonlySet<number>; merged: readonly MergedCard[]
  openParents?: ReadonlySet<number>                                // new, default empty
  root?: { number: number; title: string; state: string }          // new
}): Reconciled
```

- **`childrenDone`.** In the loop, for an open sub-issue that is not in flight and was read, after `doneIn` finds no card: when it has at least one sub-issue, every one of them is `CLOSED`, and its number is not in `openParents`, it goes to `childrenDone` with `total` = the number of its sub-issues. Otherwise it goes to `noMatch` as today. A `doneIn` match still wins and still goes to `done`.
- **`openParents`** is the set of issue numbers that a card neither merged nor parked names as its `parent:`. Such a card is work under that parent with no issue of its own yet, so the parent is not finished.
- **`root`.** Set after the loop when all of these hold: `o.root` is given and its `state` (upper-cased) is not `CLOSED`; `subs` is not empty; its number is in neither `inFlight` nor `openParents`; `closedOpen` is empty; and every sub-issue is `CLOSED`, or is in `done`, or is in `childrenDone`. Test that last condition directly over `subs`: an open sub-issue that is in flight is in no list, and it must stop the root, as a `noMatch` or a `notRead` entry does. Then `root = { number, title, total: subs.length, after }`, where `after` is the numbers in `done` and `childrenDone`, ascending (empty when every sub-issue is already closed).
- **Rows** (`rowsOf`), in this order: the `done` rows; the `childrenDone` rows `#<n> <title> — open, all <total> sub-issues closed`; the `closedOpen` rows; the `noMatch` rows; the `notRead` rows; then the root row `#<n> <title> — open, all <total> sub-issues closed`, with ` once the closes above run` appended when `after` is not empty; then the counts line.
- **Counts line**: `<a> done elsewhere · <b> open with every sub-issue closed · <c> closed with open children · <d> no match`, where `b` is `childrenDone.length` plus 1 when `root` is set.
- **Close lines** (`closeLinesOf`), in this order: the `done` lines as today; one live line per `childrenDone` entry, `gh issue close <n> --repo <repo> --comment 'all <total> sub-issues done'`; the root's line in the same form; then the commented `not planned` lines as today.
- `reconcileAllText`: an epic's part is `nothing to reconcile` only when `childrenDone` is empty and `root` is unset too.
- `mergedCards`, `doneIn`, `overlapOf`, `parseReconcileArgs`, `epicsOf` and `landedFor` do not change.

### 2. Wiring, `reconcileWith` in `hooks/register.ts`

- Beside `inFlight`: `openParents`, built from the same `cardsById` values: every `parent` of a card whose status is neither `merged` nor `parked`.
- The call becomes `reconcileOf({ subs, inFlight, merged, openParents, root: { number: epic.number, title: <the parent view's title when it is a string, else epic.title>, state: <the parent view's state when it is a string, else ''> } })`. The part's title for the `all` heading does not change.
- **Under `--confirm`**, per part, the closes run in this order through the one loop that exists today (same `treeImportBatch` cap counted over all closes of the run, same 1000 ms pause, same `closed #<n>` and `close #<n> failed: …` lines, same closed line written to a landed file): the `done` entries with `doneComment`, then the `childrenDone` entries with `childrenComment(total)`, then the root with `childrenComment(total)`.
- The root is closed only when every number in `root.after` got its `closed #<n>` line in this run. When one did not (a failed close, or the cap stopped the run first), the root is not tried and one line is added: `#<n> left open: run again once its sub-issues are closed`.
- With `all` and `--confirm`, a part prints `nothing to reconcile` only when it has no `done`, no `childrenDone` and no `root`.
- Without `--confirm` nothing is closed, as today.
- Update the function's doc comment: four lists, and what `--confirm` closes.
- `hooks/lib/tree.ts`, the tool's `confirm` description: `runs the done-elsewhere closes` becomes `runs the closes: sub-issues a merged card already did, and open parents whose sub-issues are all closed`. Nothing else in the file changes.

### 3. Not in this card

- `reconcile all` still walks the open `type:epic` issues only. A feature above the epics is reconciled by naming it: `/delegation tree reconcile <n>`.
- One level per run: a parent whose sub-issues close in this run is closed in the same run only when it is the named parent (the root). Nothing walks further up.
- `hooks/lib/mergecmd.ts` and the finish's own ancestor closes are untouched.

### 4. Tests

- `tests/node/reconcile.node.mjs`, a `MOD-362` describe with `toEqual` on whole results:
  - an open sub-issue with two closed sub-issues and no card: in `childrenDone` with `total: 2`, not in `noMatch`;
  - the same with one sub-issue open: `noMatch`; with no sub-issues: `noMatch`;
  - the same with its number in `openParents`: `noMatch`;
  - the same with a merged card naming it as `parent`: `done` (the card wins), not `childrenDone`;
  - the same in flight, and the same with `read: false`: as today (no list; `notRead`);
  - root: every sub-issue closed gives `root` with `after: []`; one sub-issue in `done` and one in `childrenDone` gives `after` with both numbers ascending; a `noMatch` entry, a `notRead` entry, an open sub-issue in flight, a `closedOpen` entry, a root that is `CLOSED`, a root in `inFlight`, a root in `openParents`, no `subs`, and no `o.root` each give no `root`;
  - `reconcileText`: the row order, the root row with and without ` once the closes above run`, the counts line, and the close lines in order with the two comments.
- `tests/node/reconcileall.node.mjs`: a part with only `childrenDone` or only `root` is not `nothing to reconcile`; the close block keeps a part's root line after that part's sub-issue lines.
- Engine, in `tests/reconcile.test.ts` (a `MOD-362` describe built as its neighbours): a parent with one open sub-issue whose two sub-issues are closed and one closed sub-issue. The dry run prints the `childrenDone` row, the root row with ` once the closes above run`, and both close lines, and runs no `gh issue close`. With `--confirm` it runs the two closes in order (the sub-issue, then the parent) with the comment `all 2 sub-issues done` each (the parent has two sub-issues) and prints both `closed #<n>` lines. A second case: the sub-issue's close fails; the parent is not tried and the `left open` line prints.
- Every existing test that pins the counts line or a whole reconcile text is updated to the new counts line. Change no fixture to dodge it.

### 5. Docs

- `docs/guide.md`:
  - the paragraph beginning `Imported backlogs drift`: four lists instead of three, with the new row form and what it means; `--confirm` runs the done-elsewhere closes and the closes of open parents whose sub-issues are all closed, the named parent last; in the same paragraph the sentence that says other status words such as `done` or `closed` are not read becomes: a card's status is read through `statusMap` (MOD-361), so a repo's own word for merged counts once it is mapped.
  - the adoption step that begins `**Retire what already shipped.**`: four lists, and one sentence that a feature above the epics is reconciled by naming it.
  - the table row for `tree reconcile <n> --confirm`: add the open parent whose sub-issues are all closed.
- `CHANGELOG.md`: when the file has no `## Unreleased` heading, add `## Unreleased` above the newest version heading; under `### Added` (add the heading when absent) one bullet in the style of its neighbours, ending `(MOD-362)`.

### 6. Amendment after the first attempt (brain review; a design gap, not a worker fault)

The real `gh issue view <n> --json …,subIssues` answers `"subIssues": { "nodes": [{ id, number, state, title, url }], "totalCount": <k> }`. A node carries no sub-issue list of its own, so the nested list section 1 relies on is always empty against the real gh and `childrenDone` would never fire. The open sub-issue's own view, which reconcile already runs for its body, carries the list.

- `ReconSub` gains `partial?: boolean`: its sub-issue list was cut short (`totalCount` above the nodes returned). A partial sub-issue is never `childrenDone`; it falls to `noMatch` as before. `o.root` gains `partial?: boolean`; a partial root gives no `root`.
- `reconcileWith`: after an open sub-issue's own view, when that view's `subIssues` has at least one entry it replaces the nested list (same mapping); when it has none the nested list stays. `partial` is set on the sub-issue from its own view and on the root from the parent's view, by one helper beside `subsOf` (true when the value is an object whose numeric `totalCount` is above the number of entries read).
- Tests: node cases for a partial sub-issue and a partial root; the engine fixture takes the real shape (`{ nodes, totalCount }`, no nested list on a node, the open sub-issue's sub-issues in its own view), plus one case each for a sub-issue and a parent whose list is cut short.
- `docs/guide.md`: one sentence that an issue whose sub-issue list was cut short is never listed as open with every sub-issue closed.
- Known and left: a closed sub-issue is not viewed, so against the real gh the `closed with open children` list stays empty; that predates this card.

## Left to you (list each as a `choice:` line)

- The fixtures and fake `gh` answers of the new engine tests.
- How the confirm loop is reshaped to take the three kinds of close in one pass.
- The wording of the docs sentences and the changelog bullet.

## Done when

- `reconcileOf` returns `childrenDone` and `root` as section 1 says, and `mergedCards`, `doneIn` and the other exports are unchanged; the node tests pass.
- The dry run prints the new rows, the new counts line and the live close lines, and closes nothing.
- `--confirm` closes the `done` entries, then the `childrenDone` entries, then the root, under the existing cap and pacing; the root is not tried unless every close it waits on succeeded in the run.
- An open sub-issue whose sub-issues are all closed no longer gets a commented `not planned` line.
- The docs and the changelog carry the lines of section 5.
- The gates `validate`, `node` and `test` pass.

## Review

Brain review: read both commits whole. Attempt 1 built sections 1 to 5 as written: reconcileOf returns childrenDone and root, the root test runs over subs so an open in-flight sub-issue stops it, the rows, counts line and close lines follow the card, and the confirm loop takes the three kinds of close through one closeOne helper under the same cap, pause, lines and landed-file write, with the root tried only when every number in after closed in the run. The review then found a gap in the brain's own card, not in the work: a live read of the issue view showed that a sub-issue node carries number, state and title but no sub-issue list of its own, so the nested list the card relied on is always empty against the real gh and childrenDone would never have fired; the fixtures faked the nested shape, which is why the gates were green. Attempt 2 (section 6) takes an open sub-issue's sub-issues from its own view, which the run already makes for the body, keeps the nested list when that view has none, and marks a sub-issue or the root partial when totalCount is above the nodes returned, so a list cut short closes nothing. The engine fixture is now in the real shape, with one case each for a sub-issue and a parent cut short. Side effect, a repair: the rule that a merged card naming a sub-issue as its parent marks it done only while every child is closed now sees the real children of an open sub-issue; before, it saw none. One existing node test (a scope overlap alone is no match) had its only child made open, since all-closed is now childrenDone by design. Known and left: a closed sub-issue is not viewed, so the closed-with-open-children list stays empty against the real gh, and it cannot stop the root; that predates this card. Decisions the owner may overrule: reconcile all still walks type:epic issues only; one level per run apart from the named parent; with all and --confirm an epic whose sub-issues are all closed is now closed. Approved by the owner on 2026-11-09 as a harness logic change.
