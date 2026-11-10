---
id: MOD-357
title: The Work pane's Board view: a List and Board switch, one lane per epic with the five state columns of cards, stacked under 100 columns; a card opens the same detail
domain: mod
tier: standard
status: merged
scope: [hooks/lib/workpane.tsx, hooks/lib/work.ts, hooks/register.ts, tests/workpane.test.ts, tests/node/workboard.node.mjs, tests/*.test.ts, tests/node/*.node.mjs, tests/harness.ts, docs/guide.md, docs/internals.md, CHANGELOG.md]
forbid: [.claude-plugin/**, bin/**, docs/cards/**, docs/mockups/**, hooks/lib/pane.tsx, hooks/lib/band.tsx, hooks/lib/allow.ts]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/workboard.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

The approved prototype of the Work pane (`docs/mockups/work-panel.html`) has two views of the same work: the tree table (MOD-354) and a board, where each epic is a lane and each leaf is a card in the column of its state. The board answers "what is in flight, and where is it stuck" at a glance, which the tree does not. This card adds the board to the real pane. It draws the same model with the same filters, and a card opens the detail panel MOD-356 built.

## Before you start

- `hooks/lib/workpane.tsx` whole (the table, the toolbar, and MOD-356's detail and where it is placed) and `hooks/lib/work.ts` (`workRows` and its matching rule, the MOD-354 and MOD-356 blocks).
- `hooks/register.ts`: search `MOD-354` and `MOD-356` (the state, `workHandlers`, the render hook, the `session.start` resets).
- `tests/workpane.test.ts`: the fixtures and helpers. A mounted drawing needs `ui.redraw()` after each press; mount once per surface per test. A render error surfaces only as "no implementation for ui.render": the real error is in `w.debugLogs`.
- This worktree has no generated element types and no `tsc`. Use only the element props the file already uses, plus `paddingLeft` and `paddingRight` on a Box.

## Design (decided by the brain; build it, do not redesign it)

### 1. Pure additions to `hooks/lib/work.ts` (append under a `// MOD-357` comment)

```ts
export type BoardCol = 'backlog' | 'queued' | 'working' | 'review' | 'done'
export const BOARD_COLS: readonly BoardCol[] = ['backlog', 'queued', 'working', 'review', 'done']
export const BOARD_LABEL: Record<BoardCol, string> = { backlog: 'Backlog', queued: 'Queued', working: 'Working', review: 'To review', done: 'Done' }
export const BOARD_CAP = 10
export const SURFACE_BG: Record<Scheme, string> = { light: '#f7f8f9', dark: '#22272b' }
export type BoardLane = { root: WorkItem; open: boolean; cols: Record<BoardCol, WorkItem[]>; more: Record<BoardCol, number>; doneHidden: number }

export function boardColOf(state: WorkState): BoardCol
export function workBoard(m: WorkModel, ui: WorkUi): BoardLane[]
export function boardLayout(columns: number): { mode: 'columns' | 'stack'; col: number }
```

- `boardColOf`: `blocked` gives `queued`; every other state gives the column of its own name.
- `boardLayout`: `columns >= 100` gives `{ mode: 'columns', col: Math.floor((columns - 8) / 5) }`; else `{ mode: 'stack', col: Math.max(16, columns) }`.
- `workBoard`, one lane per root, in the model's order:
  1. The roots: when `ui.root` names a root of the model, only that root; else all.
  2. A root's leaves are its leaf descendants depth-first in child order; a root with no children is its own one leaf.
  3. A leaf **passes** when (`ui.states` is empty or holds its state) and (the trimmed, lower-cased query is empty or is contained in the same text `workRows` matches: `<title> #<number> <card>`, lower-cased).
  4. `listDone` for the lane is `ui.showDone || ui.states.has('done') || ui.shown.has(root.key)`. A passing leaf that is done while `listDone` is false adds one to `doneHidden` and is placed nowhere. Every other passing leaf is appended to `cols[boardColOf(leaf.state)]`.
  5. Each column keeps at most `BOARD_CAP` items: the first ten, except `done`, which keeps the last ten. `more[col]` is the number left out (0 when none).
  6. `open` is `!ui.closed.has(root.key)`. A closed lane still carries its columns.
  7. A lane is left out when the view is filtered (a non-empty query or a non-empty `ui.states`) and it has no placed item and `doneHidden` is 0; and, when the view is not filtered, when `root.state === 'done'` and `ui.showDone` is false.

### 2. The drawing, `hooks/lib/workpane.tsx`

`WorkView` gains `view: 'list' | 'board'` and `lanes?: readonly BoardLane[]` (given when the view is `board`); `WorkHandlers` gains `view: (v: 'list' | 'board') => void`.

**The switch.** The toolbar starts, on every surface, with two Buttons: key `work-view-list` label `List` and key `work-view-board` label `Board`. The current one has `variant="primary"`, the other `plain`; each calls `hd.view(...)`.

**The board** replaces the table (key `work-table` is not drawn) wherever the table would be drawn, in a column Box key `work-board`, laid out with `boardLayout` of the width the table would have had (so `v.columns - 42` beside an open detail from 116 columns). Top to bottom:

- In `columns` mode only, one header row, key `work-board-header`: the five labels in capitals (`BACKLOG`, `QUEUED`, `WORKING`, `TO REVIEW`, `DONE`), dim, each padded to `col` cells, with `columnGap={2}`.
- Per lane, a column Box key `work-lane-<slug of root.key>`:
  - A header row: the toggle Button key `work-toggle-<slug>` (`▾` open, `▸` closed, `hd.toggle(root.key)`), the type mark (none for the group), the `#n` Link when numbered, the title in bold (`No epic` for the group), then the progress bar and `done/leaves` exactly as a parent row of the table draws them.
  - When open, in `columns` mode: one row Box with `columnGap={2}` holding five column Boxes, key `work-col-<slug>-<col>`, each `width={col}` and `flexDirection="column"` with `gap={1}`: its cards; then, when `more[col] > 0`, a dim Text `+<n> more`; a column with no card and nothing else to show holds a dim `—`.
  - When open, in `stack` mode: for each column of `BOARD_COLS` that has a card, a hidden-done button or a `more` line, in that order: a dim Text `<LABEL IN CAPITALS> · <number of cards placed>`, then a Box key `work-col-<slug>-<col>` with the same content at the full width.
  - The `done` column of a lane with `doneHidden > 0` holds a plain dim Button key `work-show-<slug>`, label `<n> done · show`, `hd.show(root.key)`.
- **A card** is a column Box key `work-card-<slug of item.key>`, `backgroundColor` `SURFACE_BG[v.scheme]` (`SELECTED_BG[v.scheme]` when it is the item of the open detail), `paddingLeft={1}` and `paddingRight={1}`, with these rows:
  1. The title as a plain Button key `work-open-<slug>`, label the title cut to the card's width less 2, `dimColor` when done, `hd.select(item.key)`. (The table is not drawn in this view, so the key is still unique in the drawing.)
  2. A row: the type mark, the `#n` Link when numbered (key `work-issue-<slug>`), and the card id dim.
  3. Only for a working or to-review item with a model: the tier dot, `model · attempt`, and the cost when known, as the table's worker and cost cells word them.
  4. Only for a blocked item: the `BLOCKED` lozenge as the table draws it, then dim ` by <ids>` when it has them. Only for a queued item with `slot`: dim `waiting for a slot`; with `onDisk`: dim `worktree on disk`.
- No lanes: the table's empty states, unchanged in wording (`Reading the issues…`, `No work breakdown yet` with its hint, `No work matches.`, `Everything here is done.`).

A card has no action button: the actions stay in the detail.

**The detail** (MOD-356) is unchanged except its close button's label when it replaces the view: `← Back to board` when `v.view` is `board`.

### 3. `hooks/register.ts`

- `let workView: 'list' | 'board' = 'list'` beside the other pane state, reset to `'list'` in `session.start`.
- `workHandlers` gains `view`: sets `workView` and redraws.
- The render hook passes `view: workView` and, when it is `board`, `lanes: workBoard(d.model, workUi)`.
- Nothing else changes: the same filters, the same read, the same detail.

### 4. Tests

- `tests/node/workboard.node.mjs` (new, one `MOD-357` describe): `boardColOf` for the six states; `boardLayout` at 99, 100, 130 and 40 columns; `workBoard` on a small model built with `workModel`: each leaf lands in its column and a blocked leaf in `queued`; done leaves are counted in `doneHidden` by default and listed under `showDone`, under `shown` for that root only, and under the `done` state filter; a query and a state filter keep only the passing leaves and drop a lane with none; `ui.root` keeps one lane; an all-done root is dropped by default and kept under `showDone`; a column of 12 keeps 10 with `more` 2, and `done` keeps the last 10; `open` follows `ui.closed`.
- `tests/workpane.test.ts`, a new `MOD-357` describe:
  1. At 130 columns, pressing `work-view-board` draws `work-board`, `work-board-header` and no `work-table`; the lane `work-lane-i10` holds `work-card-i13` and `work-card-i14`; pressing `work-view-list` brings the table back.
  2. The lane's done column offers `work-show-i10` reading `1 done · show`; pressing it draws `work-card-i12`.
  3. At 80 columns the board has no `work-board-header` and the lane shows the text `QUEUED · 1`.
  4. With the Queued chip on, the board has `work-card-i13`, no `work-card-i14` and no `work-lane-i30`.
  5. Pressing `work-toggle-i10` removes that lane's cards and leaves its header; pressing again brings them back.
  6. At 80 columns, pressing `work-open-i13` on the board opens the detail with `← Back to board`, and pressing that brings the board back.
  7. The board mounts on desktop, vscode and mobile.
  8. A new `session.start` returns the pane to the list.
- Every existing test stays green.

### 5. Docs

- `docs/guide.md`, the `## Work` section: one paragraph on the Board: the switch, a lane per epic with five columns (a blocked item sits in Queued with its lozenge), stacked under 100 columns, done cards behind `N done · show`, at most ten cards a column per lane, the same filters, and a card's title opens the detail.
- `docs/internals.md`: extend the `hooks/lib/work.ts` and `hooks/lib/workpane.tsx` rows with the board and `workView` (MOD-357).
- `CHANGELOG.md`: when the file has no `## Unreleased` heading, add `## Unreleased` and `### Added` above the newest version heading; then one bullet in the style of its neighbours, ending `(MOD-357)`.

## Left to you (list each as a `choice:` line)

- Whether `workBoard` shares the matching rule with `workRows` through a small helper or repeats it.
- The fixtures of the new tests, and helper names inside `workpane.tsx`.
- The wording of the docs paragraph, the internals rows and the changelog bullet.

## Done when

- The exports of section 1 exist in `hooks/lib/work.ts` and behave as written; the node tests pass.
- The toolbar switches between the list and the board on every surface; the board draws lanes, columns (side by side from 100 columns, stacked below) and cards with exactly the keys named in section 2.
- The filters, Show done, the per-lane show button and the lane toggle act on the board; a card's title opens the detail, whose back button names the board.
- The view is reset to the list at session start, and the render hook still never awaits `gh`.
- The docs lines of section 5 are in place.
- The gates `validate`, `node` and `test` pass.

## Review

Brain review: read the whole diff against the card's design. work.ts: boardColOf, boardLayout and workBoard are as designed (blocked sits in queued; done leaves counted in doneHidden unless Show done, the done filter or the lane's show; ten a column, Done keeps the last ten; a filtered lane with nothing is dropped, an all-done root is dropped unless Show done); the query text is now one helper shared with workRows. workpane.tsx: the List and Board buttons lead the toolbar on every surface; the board replaces the table, side by side from 100 columns and stacked below, with the keys the card names; a card's title opens the detail, whose back button names the board. register.ts: workView is reset at session start and the render hook builds the lanes only for the board and still never awaits gh. Worker choices accepted: in stack mode each column's heading and box sit in a work-colbox wrapper; the lane title is cut to two column widths; no board header when there are no lanes. Known limits: element props are not type-checked in a worktree; a childless root is a lane holding itself as one card, so the lane header and the card carry the same issue-link key under different parents (keys are sibling-scoped, so harmless); a queued card that both waits for a slot and has a worktree on disk shows both notes; cards carry no action button, by design.
