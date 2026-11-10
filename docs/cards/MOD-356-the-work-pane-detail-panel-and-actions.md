---
id: MOD-356
title: The Work pane's detail panel and actions: a leaf's title opens its detail (fields, activity from the ledger), and Dispatch, Review and Unblock put one line to the session
domain: mod
tier: standard
status: merged
scope: [hooks/lib/workpane.tsx, hooks/lib/work.ts, hooks/register.ts, tests/workpane.test.ts, tests/node/workdetail.node.mjs, tests/*.test.ts, tests/node/*.node.mjs, tests/harness.ts, docs/guide.md, docs/internals.md, CHANGELOG.md]
forbid: [.claude-plugin/**, bin/**, docs/cards/**, docs/mockups/**, hooks/lib/pane.tsx, hooks/lib/band.tsx, hooks/lib/allow.ts]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/workdetail.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

The Work pane (MOD-353, MOD-354) lists the work but nothing in it can be opened or acted on. The approved prototype (`docs/mockups/work-panel.html`) has a drill-down: a leaf opens a detail panel with its fields and its history, and a queued, to-review or blocked item has one action. This card builds both in the real pane. An action starts nothing itself: it puts one line to the session and the item shows that it was asked.

## Before you start

- `hooks/lib/workpane.tsx` whole and the MOD-354 block at the end of `hooks/lib/work.ts`: the drawing you extend and its helpers.
- `hooks/register.ts`: search `MOD-354` (the state variables, `workHandlers`, the `ui.render` hook on `WORK_PANE`, the `session.start` resets), `async function submitWake`, and `async function ledgerAt`.
- `tests/workpane.test.ts`: the fixtures, `mountWork`, `settle`. A mounted drawing needs `ui.redraw()` after each press, input or select (the test kit only records `$.ui.invalidate`); mount once per surface per test. A render error surfaces only as "no implementation for ui.render": the real error is in `w.debugLogs`.
- `tests/harness.ts`: `w.submitted` holds every text the mod passed to `$.prompt.submit`.
- This worktree has no generated element types and no `tsc`. The props you may use are listed in the Design; use no others.

## Design (decided by the brain; build it, do not redesign it)

### 1. Pure additions to `hooks/lib/work.ts` (append under a `// MOD-356` comment)

```ts
export type WorkAction = 'dispatch' | 'review' | 'unblock'
export const ACTION_LABEL: Record<WorkAction, string> = { dispatch: 'Dispatch', review: 'Review', unblock: 'Unblock' }
export const ASKED_TTL_MS = 10 * 60 * 1000
export const ACTIVITY_CAP = 8
export const SELECTED_BG: Record<Scheme, string> = { light: '#e9f2ff', dark: '#1c2b41' }
export type WorkAsked = { action: WorkAction; state: WorkState; at: number }
export type WorkEvent = { text: string; ago: string }

export function findItem(m: WorkModel, key: string): { item: WorkItem; trail: WorkItem[] } | undefined
export function leafOfCard(m: WorkModel, id: string): WorkItem | undefined
export function workAction(it: WorkItem): WorkAction | undefined
export function actionLine(action: WorkAction, it: WorkItem): string
export function askedOn(a: WorkAsked | undefined, it: WorkItem, now: number): boolean
export function agoText(at: number, now: number): string
export function workActivity(rows: readonly Record<string, unknown>[], card: string, now: number): WorkEvent[]
```

- `findItem`: depth-first over the roots in order; the first **leaf** (no children) whose `key` is `key`, with `trail` its ancestors, root first. A parent's key, or an unknown key, gives `undefined`.
- `leafOfCard`: the first leaf, depth-first, whose `card` is `id` or whose `key` is `id`.
- `workAction`: `undefined` for an item with children or with no `card`. Otherwise by state: `queued` gives `dispatch` unless `slot` is set (its spawn already waits for a slot: no action); `review` gives `review`; `blocked` gives `unblock`; every other state gives `undefined`.
- `actionLine` (the card id is `it.card`; these are the exact lines):
  - dispatch: `Work pane: Dispatch was pressed on <card>. Dispatch <card>.`
  - review: `Work pane: Review was pressed on <card>. Get its verdict, read its diff and say whether it should merge.`
  - unblock, with `by` ids: `Work pane: Unblock was pressed and confirmed on <card>, which waits on <ids joined with ", ">. Release its card (status queued, no blocked_by line) and say what it still overlaps.`
  - unblock, with no `by`: `Work pane: Unblock was pressed and confirmed on <card>. Release its card (status queued, no blocked_by line).`
- `askedOn`: true when `a` is defined, `a.state === it.state`, and `0 <= now - a.at < ASKED_TTL_MS`.
- `agoText`: age `max(0, now - at)`; under 60 s `just now`; under 60 min `<n> min ago`; under 24 h `<n> h ago`; else `<n> d ago` (whole numbers, floored).
- `workActivity`: one pass over `rows` in order, keeping only rows whose `task` is exactly `card`. A value counts only when it has the type named here; a row whose time is not a finite number makes no event.
  - no `kind` and `event === 'spawn'`: text `Dispatched to <alias> · attempt <attempt>/<budget>` at `at` (`alias` a string, else `a worker`; leave out `/<budget>` when `budget` is not a number; leave out ` · attempt …` when `attempt` is not a number).
  - `kind` is `spawn` or `resume`, with a string `verdict` and a numeric `verdictAt`: text `Verdict <verdict>` at `verdictAt`, with ` · $<usd to 2 places>` appended when `usd` is a number.
  - `kind === 'resume'` with a numeric `at`: also `Resumed · attempt <attempt>` at `at` (`Resumed` alone when `attempt` is not a number).
  - `kind === 'verify'` with a string `verdict` and a numeric `verdictAt`: `Verified by hand: <verdict>` at `verdictAt`.
  - `kind === 'review'` with a string `verdict` and a numeric `verdictAt`: `Review: <verdict>` at `verdictAt`.
  - `kind === 'amend'`: `Scope amended` at `at`. `kind === 'accept'`: `Accepted` at `at`. `kind === 'merged'`: `Merged` at `at`.
  - Drop an event whose text and time both equal an earlier kept event's. Sort newest first; events with the same time keep the later row first. Return the first `ACTIVITY_CAP`, each as `{ text, ago: agoText(time, now) }`.

### 2. The drawing, `hooks/lib/workpane.tsx`

`WorkView` gains one optional field and `WorkHandlers` three:

```ts
detail?: { item: WorkItem; trail: readonly WorkItem[]; action?: WorkAction; asked: boolean; confirming: boolean; activity: readonly WorkEvent[] }

/** open a leaf's detail, or close it with undefined */
select: (key: string | undefined) => void
/** the action button of an item */
act: (key: string) => void
/** the Unblock question: true is Unblock, false is Cancel */
confirm: (key: string, yes: boolean) => void
```

Props you may use on the elements (no others): `Box`: key, flexDirection, flexWrap, flexGrow, columnGap, gap, width, overflow, hover, backgroundColor, paddingLeft. `Text`: key, color, backgroundColor, dimColor, bold, italic, wrap. `Button`: key, label, plain, dimColor, variant (`primary` | `secondary`), role, onPress. `Link`: key, href, label.

**The table.** A leaf row's title becomes a plain Button, key `work-open-<slug>`, label the cut title, `dimColor` on a done leaf, `onPress` `hd.select(it.key)`. A parent row's title stays a Text. The row Box of the selected leaf takes `backgroundColor={SELECTED_BG[v.scheme]}`. Nothing else in a row changes: there is no action column in the table.

**Where the detail goes.** `side = v.columns >= 116`.
- No `v.detail`: the pane is drawn exactly as today.
- `v.detail` and `side`: the toolbar, notes and summary as today; then one row Box `flexDirection="row" columnGap={2}` holding the table, laid out with `workLayout(v.columns - 42)`, and the detail in a Box of `width={40}`.
- `v.detail` and not `side`: the toolbar, notes, summary and table are **not** drawn; the pane is the detail (width `v.columns`) and the footer.

**The detail** is one column Box, key `work-detail`, `gap={1}`, top to bottom:
1. A row: a dim Text of the trail, each ancestor's title joined with ` / ` (the group's title is `No epic`), cut to the width less 20; then the Button key `work-detail-close`, label `Close` when `side`, else `← Back to list`, `onPress` `hd.select(undefined)`.
2. A row: the type mark as in a table row (none for a card with no number: two spaces), the `#n` Link as in a table row when numbered (key `work-detail-issue`), then the full title, bold, `wrap="wrap"`.
3. A row, key `work-detail-status`: the lozenge as in a table row; then, when the item is queued with `slot`, dim ` waiting for a slot`, or with `onDisk`, dim ` worktree on disk`; then exactly one of:
   - `detail.asked`: a Text key `work-asked-<slug>`, dim and italic, `Asked · waiting for the session`;
   - `detail.confirming`: a Box key `work-confirm-<slug>` with the Text `Still waiting on <by ids joined with ", ">. Unblock anyway?` (`Unblock anyway?` alone with no ids), a Button key `work-confirm-yes-<slug>` `variant="primary"` label `Unblock` (`hd.confirm(key, true)`) and a Button key `work-confirm-no-<slug>` label `Cancel` (`hd.confirm(key, false)`);
   - `detail.action` defined: a Button key `work-act-<slug>`, `variant="primary"`, label `ACTION_LABEL[action]`, `onPress` `hd.act(key)`;
   - none of these: nothing.
4. The fields, a column Box key `work-fields`, one row each, the label a dim Text padded to 12 cells, the value after it; a value that is absent is `—`:
   - `Type`: the type with a capital first letter (`Story`, `Bug`, `Issue`); a card with no number is `Card`.
   - `Card`: `it.card`.
   - `Worker`: the tier dot and model as in the table's worker cell, without the attempt and running parts.
   - `Attempt`: `it.attempt`.
   - `Running`: only on a working item: `it.running`.
   - `Cost`: `$<usd to 2 places>`.
   - `Blocked by`: only on a blocked item: each id of `it.by`; an id for which `leafOfCard(v.model, id)` finds a leaf is a plain Button key `work-by-<keySlug(id)>` that selects that leaf, any other id a Text.
   - `Parent`: the last item of the trail: `#<n> <title>`, or `No epic`.
5. Activity, a column Box key `work-activity`: a bold Text `Activity`; then one row per event, key `work-event-<i>`: `● ` dim, the text, and the `ago` dim after two spaces. With no events: one dim Text `No activity recorded for this item.` when it has a card, `No card yet.` when it has none.

### 3. `hooks/register.ts`

- Module state beside the MOD-354 variables, all reset in `session.start`: `let workSel: string | undefined`, `let workConfirm: string | undefined`, `const workAsked = new Map<string, WorkAsked>()` (cleared with `.clear()`).
- `workHandlers` gains:
  - `select`: sets `workSel`, clears `workConfirm`, redraws.
  - `act(key)`: reads the model the same way the render hook does (`workData($, false, true)`), `findItem`, `workAction`; no item or no action: return. `unblock`: `workConfirm = key`, redraw. Otherwise: `void submitWake($, actionLine(action, item))`, `workAsked.set(key, { action, state: item.state, at: await now($) })`, redraw.
  - `confirm(key, yes)`: `workConfirm = undefined`; when `yes` and the item still has the `unblock` action, submit its line and set the asked mark as above; redraw.
  - These three may be async inside; the handler types return `void`, so call them as `void (async () => { … })()` or the like, and catch and `debug` an error.
- The render hook, after the model is read: when `workSel` is set, `findItem(d.model, workSel)`; not found: `workSel = undefined` and `workConfirm = undefined`. For every entry of `workAsked`, delete it when its item is not found or `askedOn` is false. When an item is selected, build `detail`: `action` from `workAction`, `asked` from `askedOn(workAsked.get(key), item, at)`, `confirming` `workConfirm === key`, and `activity` `workActivity((await ledgerAt($, root)).rows, item.card, at)` when it has a card, else `[]` (`root` as `workData` computes it). The hook still never awaits `gh`.
- A press works whether or not `wakeOnVerdict` is on: call `submitWake` directly, never `wakeBrain`.
- In the comment `// a screen that places no mod panes (the VS Code extension): close the waiting pane and answer in text`, replace `(the VS Code extension)` with `(an older VS Code extension, for example)`.

### 4. Tests

- `tests/node/workdetail.node.mjs` (new, one `MOD-356` describe): `findItem` (a leaf with its trail, a parent's key, an unknown key); `leafOfCard`; `workAction` for each state, for a leaf with no card, for a queued leaf with `slot`, and for a parent; the four `actionLine` texts with `toBe`; `askedOn` (same state inside the time, a changed state, past the time, undefined); `agoText` at 0 s, 59 s, 60 s, 59 min, 60 min, 23 h, 24 h, 3 d; `workActivity`: every row shape of section 1 gives its text, another task's rows are left out, a row with no time is left out, a repeated verdict row gives one event, the order is newest first, and 10 events give 8.
- `tests/workpane.test.ts`, a new `MOD-356` describe. Add to the fixtures as you need (a blocked card with `blocked_by: [MOD-9]`, a ledger file with rows for MOD-9; find the ledger's path constant in `register.ts`):
  1. At 130 columns, pressing `work-open-i13` draws `work-detail` beside `work-table`: the trail `Checkout rework / Cart totals`, the title, `MOD-9`, a `work-act-i13` button labelled `Dispatch`, and `work-detail-close` labelled `Close`.
  2. At 80 columns the same press leaves no `work-table`; `work-detail-close` reads `← Back to list`, and pressing it brings the table back with no `work-detail`.
  3. Pressing `work-act-i13` gives exactly one entry in `w.submitted`, the dispatch line for MOD-9; after a redraw the drawing has `Asked · waiting for the session` and no `work-act-i13`.
  4. The blocked card's detail has `Unblock`; pressing it submits nothing and draws the question with both buttons; `Cancel` restores the button and submits nothing; `Unblock` in the question submits the unblock line and draws the asked text.
  5. A backlog leaf (`work-open-i14`) has no action button, and its `Card` field reads `—`.
  6. With ledger rows for MOD-9, its detail lists their texts under `Activity`, newest first.
  7. With a detail open the drawing mounts on desktop, vscode and mobile.
  8. A new `session.start` closes the detail.
- Every existing test stays green; an existing test that finds a leaf's title as a Text now finds the Button: update the expectation, not the behaviour.

### 5. Docs

- `docs/guide.md`, the `## Work` section: one paragraph after the pane's description: a leaf's title opens its detail (beside the table from 116 columns, in its place below that); what the detail shows; the three actions and which state has which; that a press starts nothing itself, it puts one line to the session, and the item reads `Asked · waiting for the session` until its state changes or ten minutes pass; that `Unblock` asks first.
- `docs/guide.md`: in the two sentences that name VS Code as a screen with no panes (`A screen with no mod panes (VS Code) gets …` and `… a screen that places no panes (VS Code) gets the text form.`), replace `(VS Code)` with `(an older VS Code extension, for example)`.
- `docs/internals.md`: extend the `hooks/lib/workpane.tsx` row with the detail and the three new state names (MOD-356).
- `CHANGELOG.md`: when the file has no `## Unreleased` heading, add `## Unreleased` and `### Added` above the newest version heading; then one bullet in the style of its neighbours, ending `(MOD-356)`.

Out of this card: an action column in the table, the Board view, drawn (Svg) icons.

## Left to you (list each as a `choice:` line)

- The fixture cards, issues and ledger rows the new tests add.
- How the async handlers are wrapped, and small helper names inside `workpane.tsx`.
- The wording of the docs paragraph, the internals row and the changelog bullet.

## Done when

- The seven functions and the constants of section 1 are exported from `hooks/lib/work.ts` and behave as written; the node tests pass.
- A leaf's title opens its detail, beside the table from 116 columns and in its place below; Close or Back closes it; the selected row is tinted.
- The detail shows the status row, the fields and the activity of section 2, with exactly the keys named there.
- `Dispatch` and `Review` submit their exact line once and the item reads `Asked · waiting for the session`; `Unblock` asks first, `Cancel` submits nothing, and confirming submits its line.
- The render hook still never awaits `gh`, and the new state is reset at session start.
- The docs lines of section 5 are in place.
- The gates `validate`, `node` and `test` pass.

## Review

Brain review: read the whole diff against the card's design. work.ts: findItem, leafOfCard, workAction, actionLine (the four exact lines), askedOn, agoText and workActivity are as designed; activity dedupes on text and time, sorts newest first and caps at 8. workpane.tsx: a leaf's title is the plain button work-open-<slug>, the selected row is tinted, the detail sits in a 40-wide box beside a table laid out 42 narrower from 116 columns and replaces the toolbar, notes, summary and table below that; keys match the card. register.ts: workSel, workConfirm and workAsked are reset at session start; act and confirm submit through submitWake directly, so a press works with wakeOnVerdict off; confirm re-reads the model and submits only while the item still has the unblock action; the render hook clears a vanished selection, prunes asked marks and still never awaits gh. Worker choices accepted: the by-hand label is built from two halves to pass the consistency grep; the trail is cut to the pane width less 20 and wraps; field rows carry work-field-<label> keys; with no blockers the question reads "Unblock anyway?". Known limits: element props are not type-checked in a worktree (no generated types, no tsc); the activity list reads the session repo's ledger only; a blocked-by id with no leaf in the model is plain text.
