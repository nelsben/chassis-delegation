---
id: MOD-354
title: The Work pane, list view: /delegation work opens a tracker table (epics, features, leaves; status lozenges, progress, card, worker, cost) with state filters, search, an epic select and Show done; a screen with no panes gets the text
domain: mod
tier: standard
status: merged
scope: [hooks/lib/workpane.tsx, hooks/lib/work.ts, hooks/register.ts, tests/workpane.test.ts, tests/work.test.ts, tests/node/worklayout.node.mjs, tests/node/work.node.mjs, tests/*.test.ts, tests/node/*.node.mjs, tests/harness.ts, docs/guide.md, docs/internals.md, CHANGELOG.md]
forbid: [.claude-plugin/**, bin/**, docs/cards/**, docs/mockups/**, hooks/lib/pane.tsx, hooks/lib/band.tsx, hooks/lib/allow.ts]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/worklayout.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

MOD-353 built the Work view's data (`hooks/lib/work.ts`: `workModel`, `workRows`, `workText`) and a cached read of the issues (`workData` in `hooks/register.ts`). This card draws it: a pane titled `Work`, the list view of the tracker the person approved as a prototype. A pane is drawn in character cells from the host's elements (Box, Text, Button, Input, Select, Link), not in HTML, so the prototype's pixels are mapped to cells here and every mapping is decided below. The item detail panel, the per-row actions and the board view are later cards: do not start them.

## Before you start

- `hooks/lib/work.ts`, whole: the types and functions this card draws from. Do not change what they return; this card only adds to the file.
- `hooks/lib/pane.tsx`, whole (read only, it is forbidden): how this repo draws a pane. Note `PaneTable` (import it from there), `const { Box, Text, Button } = p.t`, fixed-width cells made with a `pad` helper, `<Text wrap="truncate-end">`, keyed boxes, and that the file takes no `$`: `register.ts` hands in the handlers.
- `hooks/register.ts`: `workData` and `workCache` (search `async function workData`); the `work` branches of the command router (search `arg === 'work'`); the `dashboard` branch just beside them (how a pane is opened, and what is answered when it is not placed); the dashboard's render hook (search `requestId: DASH_PANE }`); `redraw` (search `function redraw(`); the `session.start` hook (search `workCache = undefined`); `now($)`.
- `hooks/lib/live.ts`: `pickScheme` and the `Scheme` type.
- `.claude-plugin/types/claude-code/index.d.ts` (read only): `ButtonProps`, `InputProps`, `SelectProps`, `LinkProps`, `BoxProps`, `TextProps`. Grep for the name; the file is long.
- `tests/dashboard.test.ts`: how a pane test opens the pane with a command, mounts it (`$.ui.mount({ … component: 'Pane', requestId, props })`), finds elements (`ui.find({ key })`, `ui.find({ type: 'Text', text: /…/ })`), and how `world(on, { panesUnplaced: '…' })` makes a screen that places no panes. A mounted drawing also has `ui.press({ key })`, `ui.input({ key, text })` and `ui.select({ key, value })`.
- `tests/work.test.ts`: the MOD-353 engine tests of `/delegation work`.

## Design (decided by the brain; build it, do not redesign it)

### 1. Pure additions to `hooks/lib/work.ts`

```ts
import type { Scheme } from './live'   // a type only

export type WorkLayout = { mode: 'wide' | 'medium' | 'narrow'; work: number; status: number; progress: number; card: number; worker: number; cost: number }
/** Cells per column for a body `columns` cells wide; 0 means the column is not drawn. */
export function workLayout(columns: number): WorkLayout
/** Filled cells of a parent's progress bar. */
export function progressCells(done: number, leaves: number, width?: number): number
export const LOZENGE: Record<WorkState, Record<Scheme, { bg?: string; fg: string }>>
export const TYPE_MARK: Record<WorkType, { glyph: string; color: string }>
export const TIER_COLOR: Record<Tier, string>
/** `#13` → `i13`; any other key unchanged. The part of an element key that names an item. */
export function keySlug(key: string): string
```

- `workLayout`: `status` is always 12. `columns >= 116`: `wide`, progress 16, card 10, worker 22, cost 8, `work = columns - 68`. `columns >= 72`: `medium`, progress 16, card 10, worker 0, cost 0, `work = columns - 38`. Otherwise `narrow`: the other four are 0 and `work = Math.max(16, columns - 12)`.
- `progressCells(done, leaves, width = 8)`: 0 when `leaves <= 0` or `done <= 0`; `width` when `done >= leaves`; otherwise `Math.round(done / leaves * width)` held between 1 and `width - 1`.
- `LOZENGE` (light, then dark): working bg `#e9f2ff` fg `#0055cc`, bg `#09326c` fg `#85b8ff` · review bg `#fff7d6` fg `#7f5f01`, bg `#533f04` fg `#f5cd47` · queued bg `#f1f2f4` fg `#44546f`, bg `#2c333a` fg `#9fadbc` · blocked bg `#ffeceb` fg `#ae2e24`, bg `#5d1f1a` fg `#fd9891` · done bg `#dcfff1` fg `#216e4e`, bg `#164b35` fg `#7ee2b8` · backlog no bg, fg `#626f86`, fg `#8c9bab`.
- `TYPE_MARK`: epic `◆` `#8270db` · feature `▲` `#f38a3f` · story `■` `#22a06b` · task `✓` `#1d7afc` · bug `●` `#e2483d` · spike `?` `#626f86` · issue `○` `#626f86`.
- `TIER_COLOR`: economy `#22a06b`, standard `#1d7afc`, frontier `#8270db`, premium `#f38a3f`.

The type icons are coloured glyphs on every surface in this card (the prototype's 16px icon squares are not expressible in cells; an Svg icon per row on the surfaces that have Svg is a later decision, after the person has seen the pane).

### 2. `hooks/lib/workpane.tsx`, new: the drawing, no `$`

```ts
export type WorkView = {
  model: WorkModel
  rows: readonly WorkRow[]        // workRows(model, ui), made by register.ts
  ui: WorkUi
  columns: number                 // e.props.bodyColumns
  scheme: Scheme
  updated?: string                // 'Updated 4 min ago'
  notes: readonly string[]
  reading: boolean                // a read of the issues is running
  repo?: string                   // owner/name, for the issue links
}
export type WorkHandlers = {
  toggle: (key: string) => void      // open or close a parent
  show: (parent: string) => void     // show a parent's hidden done children
  chip: (state: WorkState) => void   // a state filter on or off
  query: (text: string) => void
  root: (value: string) => void      // 'all' or a root's key
  showDone: () => void
  clear: () => void
  refresh: () => void
  close: () => void
}
export function workTree(p: PaneTable, v: WorkView, h: WorkHandlers): RenderNode
```

One column Box, `gap={1}`, key `work-pane`, holding in this order:

**Toolbar**, key `work-toolbar`: a row Box, `flexWrap="wrap"`, `columnGap={2}`.
- On every surface but `mobile` (its table has no Input and no Select; narrow on `p.surface` as `pane.tsx` does for Raster and Svg): `<Input key="work-search" placeholder="Search work" value={v.ui.query} submitLabel="Search" onSubmit={text => h.query(text)} />` (no `onInput`: the list filters on Enter, so a redraw never lands mid-word), then, only when the model has two or more roots, `<Select key="work-epic" label="Epic" options={[{ value: 'all', label: 'All' }, …one per root: value its key, label `#10 Checkout rework` or `No epic`]} value={v.ui.root ?? 'all'} onSelect={value => h.root(value)} />`.
- `<Button key="work-done" plain label={v.ui.showDone ? '☑ Show done' : '☐ Show done'} onPress={h.showDone} />`.
- A dim Text: `Reading the issues…` when `v.reading`, otherwise `v.updated` when given.
- `<Button key="work-refresh" label="Refresh" onPress={h.refresh} />`.

**Notes**: each of `v.notes` as a dim Text with `wrap="wrap"`; nothing when there are none.

**Summary**, key `work-summary`: a row Box, `flexWrap="wrap"`, `columnGap={2}`; for each state of `WORK_STATES`, a row Box holding `<Text color={LOZENGE[s][scheme].fg}>■ </Text>` and `<Button key={`work-chip-${s}`} label={`${STATE_LABEL[s]} ${v.model.counts[s]}`} … onPress={() => h.chip(s)} />`. The Button is `plain` when the state is not in `v.ui.states` and `variant="primary"` (not plain) when it is. The counts are the model's totals, whatever the filters. After the six, when the view is filtered (a query, a state or a root is set): `<Button key="work-clear" plain label="Clear filters" onPress={h.clear} />`.

**Table**, key `work-table`: a column Box. `L = workLayout(v.columns)`.
- Header: a row Box of dim Texts, each padded to its column: `Work` (`L.work`), `Status` (`L.status`), and when their width is not 0 `Progress`, `Card`, `Worker`, `Cost`.
- One row Box per entry of `v.rows`:
  - `item`, key `` `work-row-${keySlug(item.key)}` ``, with `hover={{ backgroundColor: scheme === 'light' ? '#f1f2f4' : '#2c333a' }}`. Cells, left to right:
    - **Work**, a row Box of `width={L.work}`, `overflow="hidden"`: the indent (two spaces per depth, depth held at 6); for a parent `<Button key={`work-toggle-${keySlug(item.key)}`} plain label={open ? '▾' : '▸'} onPress={() => h.toggle(item.key)} />` and one space, for a leaf two spaces; the type glyph in its colour and one space (the `No epic` group draws two spaces in place of a glyph); for an item with a number, `#<number>` and one space, as `<Link href={`https://github.com/${v.repo}/issues/${number}`} label={`#${number}`} />` when `v.repo` is given and a dim Text otherwise; then the title as one Text, cut with `…` to the cells that are left (`L.work` minus everything before it, at least 4), bold on a parent, `dimColor` on a done leaf.
    - **Status** (`L.status` cells): a leaf draws its lozenge, `<Text bold color={fg} backgroundColor={bg}>{` ${STATE_LABEL[state].toUpperCase()} `}</Text>` (no `backgroundColor` for backlog), in a Box of that width. A parent draws nothing there, except in `narrow` mode, where it draws a dim `` `${done}/${leaves}` ``.
    - **Progress** (when not 0): a parent draws `progressCells(done, leaves)` cells of `█` in the done lozenge's `fg`, the rest of the 8 as dim `░`, a space, and `` `${done}/${leaves}` ``; a leaf draws blanks.
    - **Card** (when not 0): a leaf's card id, or blanks.
    - **Worker** (when not 0), for a leaf: with a `model`, `<Text color={TIER_COLOR[tier]}>● </Text>` (dim when it has no tier) and `sonnet · 1/2`, plus `` ` · ${running}` `` when working; otherwise, dim: `waiting for a slot` when `slot`, `worktree on disk` when `onDisk`, `` `by ${by.join(', ')}` `` when blocked; otherwise blanks. Cut to the column.
    - **Cost** (when not 0): `$0.31` when `usd` is a number, else blanks.
  - `hidden`: the indent for its depth plus two spaces, then `<Button key={`work-show-${keySlug(parent)}`} plain dimColor label={`${n} done hidden · show`} onPress={() => h.show(parent)} />`.
  - `older`: the same indent, a dim Text `` `${n} older done not shown` ``.
  - `more`: a dim Text `` `… ${n} more rows: narrow the list with search or a filter` ``.
- With no rows:
  - `v.model.total === 0` and `v.reading`: a dim Text `Reading the issues…`.
  - `v.model.total === 0` otherwise: a bold Text `No work breakdown yet` and a dim Text `Import one with /delegation tree import <file>, or start one with /delegation land epic <title>.`
  - filtered: a Text `No work matches.` (the `Clear filters` button is already in the summary).
  - otherwise (everything is done and hidden): a Text `Everything here is done.` (the `Show done` button is in the toolbar).

**Footer**: `<Button key="work-close" label="close" role="dismiss" onPress={h.close} />` in a row Box.

Every key above is exact: the tests and the next cards address elements by them.

### 3. `hooks/register.ts`

- `const WORK_PANE = 'delegation-work'` beside `DASH_PANE`.
- Module state beside `workCache`: `let workUi: { closed: Set<string>; shown: Set<string>; query: string; states: Set<WorkState>; root?: string; showDone: boolean }` (starting as `DEFAULT_UI`'s values with fresh sets), `let workReading = false`, `let workTriedAt: number | undefined`, `let workFail: { repo: string; why: string } | undefined`. `session.start` resets all four where it resets `workCache`.
- `workData` changes:
  - a third parameter `noRead = false`. With it true, `gh` never runs: a `workCache` for this repo is used whatever its age, and with none there are no issues.
  - whenever it does run `gh` it first sets `workTriedAt` to the time now; a failed read sets `workFail` for this repo (the `why`, at most 200 characters) and a successful one clears it. The two failure notes of MOD-353 are built from `workFail` (when it is for this repo) in place of a local value, so a later `noRead` call still carries the note.
  - its result gains `stale: boolean` (the origin is GitHub, and there is no cache for this repo or the cache is `WORK_TTL_MS` old or older) and `repo?: string` (the `owner/name`).
- The render hook, `on('ui.render', { component: 'Pane', requestId: WORK_PANE }, …)`, in the shape of the dashboard's (try, and on a throw `debug($, …)` and `return next(e)`):
  1. `const at = await now($)`; `const d = await workData($, false, true)`.
  2. When `d.stale && !workReading && (workTriedAt === undefined || at - workTriedAt >= WORK_TTL_MS)`: start one background read, not awaited: set `workReading = true`, then `void workData($, true).catch(() => undefined).then(() => { workReading = false; redraw($) })`.
  3. Return `workTree(p, { model: d.model, rows: workRows(d.model, workUi), ui: workUi, columns: e.props.bodyColumns, scheme: pickScheme(e), updated: …updatedText when d.at is set, notes: d.notes, reading: workReading, repo: d.repo }, handlers)`.
  The hook itself never awaits a `gh` call.
- The handlers, each ending in `redraw($)`: `toggle` adds the key to `workUi.closed` or removes it; `show` adds the parent to `workUi.shown`; `chip` adds the state to `workUi.states` or removes it; `query` sets `workUi.query` to the text trimmed; `root` sets `workUi.root` (`'all'` clears it); `showDone` flips it (and, turning it off, empties `workUi.shown`); `clear` empties the query, the states and the root; `refresh` does nothing while `workReading`, otherwise sets it, redraws, awaits `workData($, true)` (a throw is swallowed), clears it and redraws; `close` is `void $.ui.close({ id: WORK_PANE })`.
- The command:
  - `work` and `work refresh`: `workData($, <refresh>)` first (so the pane opens on fresh data), then `$.ui.open({ id: WORK_PANE, title: 'Work', focus: true })` exactly as the `dashboard` branch opens its pane. Placed: `{ text: 'Work opened in a pane.' }`. Not placed: close it as the dashboard branch does and answer `` `This screen does not show a mod's panes (${why}), so here is the work list as text.` ``, a blank line, and the `workText` MOD-353 printed.
  - `work text`: the `workText`, and no pane is opened.
  - The usage line and the `argumentHint` read `work [refresh|text]`.

### 4. Tests

- `tests/node/worklayout.node.mjs` (new), one `MOD-354` describe: `workLayout` at 60, 71, 72, 115, 116 and 160 columns (mode and every width); `progressCells` for 0/9, 1/9, 3/9, 8/9, 9/9, 1/100, 99/100 and 0 leaves; `keySlug`; every state has a `LOZENGE` entry for both schemes and every type a `TYPE_MARK`.
- `tests/workpane.test.ts` (new), one `MOD-354` describe, over scripted `gh` output and cards on disk as `tests/work.test.ts` lays them (add a card with a live or verdict state only if the harness makes that a few lines; the lozenge of a queued, backlog and done leaf is enough). Mount props: `{ title: 'Work', isFocused: false, bodyColumns: <n>, placement: 'dock', scroll: { bodyRows: 30 }, view: {} } as never`, with `requestId: 'delegation-work'`:
  - `/delegation work` opens the pane (`w.opened` holds `delegation-work`) and answers `Work opened in a pane.`; mounted on the terminal at 130 columns the drawing has `work-toolbar`, `work-summary`, `work-table`, a row keyed for an epic, the six chips with their counts, and a `WORKING` (or another expected) lozenge Text;
  - at 80 columns there is no `Worker` header and at 50 no `Progress` header;
  - pressing a parent's toggle removes its children's rows, and pressing it again brings them back;
  - pressing a chip leaves only rows of that state under their parents, and `work-clear` restores the list;
  - `ui.input({ key: 'work-search', text: … })` filters by a title word and by a card id;
  - `ui.select({ key: 'work-epic', value: … })` leaves one root;
  - a done leaf is absent, its parent ends with the `done hidden · show` button, pressing it shows the leaf, and `work-done` shows every done leaf;
  - `work-refresh` runs one more `gh issue list` (count `w.runs`);
  - mounted in a fresh session with no command first, the drawing has the card rows, and however many times it is mounted again exactly one `gh issue list` has run in total; when that read fails, no second read runs on the next mount and the `cards only` note is drawn;
  - the drawing mounts on `desktop`, `vscode` and `mobile` without a refusal, and on `mobile` there is no `work-search`;
  - with `panesUnplaced`, `/delegation work` answers with the text form and its first line; `/delegation work text` opens no pane.
- `tests/work.test.ts`: the MOD-353 tests that read the text of `/delegation work` now run `/delegation work text` (and `work refresh` is checked by its `gh` count); keep what each one proves.
- Any test that pins the usage line or the `argumentHint` is updated.

### 5. Docs

- `docs/guide.md`: the `## Work` section says the command opens a pane and describes it in a short table or list (toolbar, state chips, the columns by width, expand and collapse, hidden done rows), that `work text` prints the listing and that a screen with no panes gets the text; the commands table row reads `/delegation work [refresh|text]`. In the list of states there, the Queued line becomes: `**Queued**: it has a card that has not started (it may be waiting for a slot, or have a worktree on disk from an earlier session).`
- `docs/internals.md`: a table row for `hooks/lib/workpane.tsx`, and one line on the pane's state (`workUi`, the background read, `workFail`).
- `CHANGELOG.md`, under `## Unreleased` → `### Added`: one bullet in the style of its neighbours, ending `(MOD-354)`.

## Left to you (list each as a `choice:` line)

- The private helpers in `workpane.tsx` and how the cells are padded.
- The wording of comments and of the docs lines.
- How the engine tests are split into cases.

## Done when

- `workLayout`, `progressCells`, `LOZENGE`, `TYPE_MARK`, `TIER_COLOR` and `keySlug` are exported from `hooks/lib/work.ts` as section 1 says; the node tests pass.
- `/delegation work` opens the pane titled `Work` and the drawing carries the elements and keys of section 2 on all four surfaces; the toggles, chips, search, epic select, Show done, the hidden-done button, Clear filters and Refresh behave as section 3 says; the engine tests of section 4 pass.
- The render hook runs no `gh` itself: a stale or missing list starts one background read at most per five minutes and redraws when it ends.
- A screen that places no panes gets the text form; `/delegation work text` always prints it.
- No detail panel, no per-row action and no board view is added; the dashboard pane, the band and the allowlist are untouched.
- The guide, internals and changelog carry the lines of section 5.
- The gates `validate`, `node` and `test` pass.

## Review

Brain review: diff read whole. The drawing in hooks/lib/workpane.tsx carries every key the Design names and takes no host handle; the layout, colour and key helpers in hooks/lib/work.ts are the Design's. In hooks/register.ts the render hook reads with noRead and never awaits the issue list: a stale or missing list starts one background read, guarded by workReading and workTriedAt, so a failed read is not retried inside five minutes and its note is carried by workFail. Each handler changes workUi and redraws; the pane state is reset at session start. work and work refresh read first and then open the pane, a screen that places no panes gets the text, and work text opens no pane. Worker choices accepted: the handler parameter is named hd because h is the element factory; rows are Boxes instead of fragments; extra keys on the header, state cells, notes, footer and issue links. Known limits, left for later cards: element props are not type-checked in a worktree (no generated types there), a root whose leaves are all done has no hidden-done row, and type marks are coloured glyphs on every surface.
