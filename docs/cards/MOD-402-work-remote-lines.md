---
id: MOD-402
title: "Work pane on remote surfaces: each line of controls is one Markdown, search and epic fold behind Filter, the stacked board picks its column from a line of links that opens on the first column with cards, and the lane toggle shares its title's line"
domain: mod
tier: standard
status: merged
issue: 564
scope: [hooks/lib/workpane.tsx, hooks/lib/work.ts, hooks/register.ts, CHANGELOG.md, docs/guide.md, tests/workpane.test.ts, tests/*.test.ts, tests/node/*.node.mjs, tests/harness.ts]
forbid: [bin/**, docs/cards/**, docs/mockups/**, docs/spikes/**, hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, docs/upgrading.md]
red_test: none
gate: validate, node, test
budget: 2-attempts
spend: 12
---
## Why

Issue #564. On the desktop app, a `Markdown` element is drawn as a full-width block, and since MOD-392 every pressable control on a remote surface is one. So each control breaks its row:
- The toolbar takes six rows: Work, then List, then Board beside the stretched search box, then the stretched Epic select, then Show done, then Updated and Refresh.
- The lane toggle `▾` sits alone on a line above its lane's title.
- The state chips are bordered buttons, with their colour squares set apart from them.
- Below 100 columns, the Column select opens on Working even when Working is empty, so the board shows a lone dash.

The fix: on remote surfaces, every line of controls becomes **one** Markdown that holds all its links. The terminal is unchanged throughout.

## Before you start

- `hooks/lib/workpane.tsx`:
  - `press`, `viewSwitch`, `toolbar` and `summary` (the chips);
  - in `board()`: `pick`, `picking`, `counts`, the lane head row, and the `work-board-col` Select;
  - the final `return`, which places `toolbar` and `summary`.
- `hooks/lib/work.ts`: `mdLink`, `linkHref`, `WORK_STATES`, `STATE_LABEL`, `BOARD_COLS` and `BOARD_LABEL`.
- `hooks/register.ts`: `workNotesOpen` and `workStackCol` (about line 950), `workHandlers` (about line 1625), their resets at session start (about line 11431), and the `workTree(p, { … })` call.
- `tests/workpane.test.ts`: how the tests press a remote link (`ui.press({ key, link: { href } })`) and mount on `desktop` and `mobile`.

## Design (decided by the brain; build it, do not redesign it)

### Shared pieces

- **In `work.ts`:** add `export function mdEscape(s: string): string`, which holds the escaping `mdLink` does today (each newline becomes a space, and each Markdown metacharacter gets a backslash). `mdLink` calls it, and its output is unchanged.
- **In `workTree`:** add a helper `pressLine(key: string, parts: LinePart[], o: { sep?: string; dim?: boolean } = {}): RenderNode`.
  - `type LinePart = { id: string; label: string; onPress?: () => void; bold?: boolean }`.
  - It returns one `<Markdown key={key} …/>`. Each part's text is:
    - a link `mdLink(label, linkHref(\`${key}-${id}\`))` when `onPress` is set;
    - otherwise `mdEscape(label)`;
    - wrapped in `**…**` when `bold` is set (around the link too).
  - Parts are joined by `o.sep`, which defaults to `' · '`.
  - `pressableLinks` lists only the hrefs of parts with `onPress`. `onLinkPress` runs the `onPress` of the part whose href equals `link.href`, and does nothing for any other link.
  - `dimColor` is `o.dim`.
  - It is used only where `remote` is true.

### The toolbar (remote only)

- **Line 1:** `pressLine('work-bar', parts)`, alone on its line. The parts, in this order:
  1. `{ id: 'title', label: 'Work', bold: true }`
  2. The two views. The current one is `{ bold: true }` with no `onPress`. The other is a link that calls `hd.view`. Ids are `list` and `board`, labels `List` and `Board`.
  3. Only when `!narrowSurface`: `{ id: 'filter', label: filterOn ? 'Filter (on)' : 'Filter', onPress: hd.filter }`. Here `filterOn = v.ui.query.trim() !== '' || v.ui.root !== undefined`.
  4. `{ id: 'done', label: v.ui.showDone ? '☑ Show done' : '☐ Show done', onPress: hd.showDone }`.
  5. `{ id: 'refresh', label: 'Refresh', onPress: hd.refresh }`.
  6. When present, the status as a plain part: `Reading the issues…`, or `v.updated`.
- **Line 2:** only when `v.filterOpen && !narrowSurface`, a `<Box key="work-filters" flexDirection="column" gap={1}>` holding today's search `Input` and today's Epic `Select`. They keep their keys, their props and their `roots.length < 2` rule.
- **State:**
  - `WorkView` gains `filterOpen: boolean`, and `WorkHandlers` gains `filter: () => void`.
  - In `register.ts`, `let workFilterOpen = false` sits beside `workNotesOpen`. `filter` flips it and redraws, it is reset at session start, and the `workTree` call passes `filterOpen: workFilterOpen`.
- The terminal toolbar is unchanged: Buttons, Input and Select as today, with no Filter part.

### The chips (remote only)

- The list view, and the board when not `picking`: `pressLine('work-chips', parts)` replaces the row of square-plus-Button pairs.
  - There is one part per `WORK_STATES` entry: `{ id: s, label: \`${STATE_LABEL[s]} ${count}\`, bold: on }`.
  - It gets `onPress: () => hd.chip(s)` when `on || count > 0`. A chip that is off with a count of 0 stays plain text.
  - When `filtered`, a last part `{ id: 'clear', label: 'Clear filters', onPress: hd.clear }`.
- On the terminal, the chips are unchanged.

### The stacked board (remote, `picking`)

- **The column picker** replaces the `work-board-col` Select on remote: `pressLine('work-board-col', BOARD_COLS.map(c => ({ id: c, label: \`${BOARD_LABEL[c]} ${counts[c]}\`, bold: c === pick, ...(c === pick ? {} : { onPress: () => hd.col(c) }) })))`.
  - It is drawn only when `lanes.length > 0`.
  - On remote, while `picking`, the chips line is not drawn. The column line carries the counts.
  - The terminal keeps its Select.
- **The default column, on every surface:**
  - `WorkView.stackCol` stays optional. In `register.ts`, `workStackCol` becomes `BoardCol | undefined`, starts `undefined`, and is reset to `undefined` at session start.
  - In `board()`, `pick = v.stackCol ?? firstCol(counts)`.
  - Export `firstCol` from `work.ts`: `(counts: Record<BoardCol, number>): BoardCol`. It returns the first of `working`, `review`, `queued`, `backlog` whose count is above 0, else `done`.
- **An empty picked column in a lane:** it reads `<Text dimColor>{\`None in ${BOARD_LABEL[pick]}\`}</Text>` instead of `—`. Only the `picking` branch changes; the side-by-side board keeps its `—`.

### The lane head (remote, every board mode)

- **Line 1:** `pressLine(\`work-lane-head-${k}\`, parts, { sep: ' ' })`, alone on its line. The parts:
  1. `{ id: 'toggle', label: l.open ? '▾' : '▸', onPress: () => hd.toggle(r.key) }`.
  2. When `r.number !== undefined`, a plain part `#${r.number}`.
  3. `{ id: 'title', label: <today's title text>, bold: true }`.
- **Line 2:** a row Box: `markNode(r.type)` when `mark`, then `bar(r.done, r.leaves)`.
- The GitHub issue Link is dropped from the remote lane head. The list rows and the detail keep their issue links.
- On the terminal, the lane head row is unchanged.

### Docs and marks

- Mark the change `MOD-402 (#564)` once, in the file's top comment block of `workpane.tsx`.
- `CHANGELOG.md`, `## Unreleased` (create it above `## 0.9.67` when absent), `### Fixed`: one bullet `(MOD-402, #564)`.
- `docs/guide.md`:
  - Where the Work pane toolbar is described, say that on the desktop, the editor and the phone the controls sit on one line of links, and the search and epic filters open from `Filter`.
  - Where MOD-396's Column select sentence is, say the narrow board opens on the first column with cards, and on remote surfaces the columns are a line of links.

## Tests

- **Node (`tests/node/`, a new or existing file):**
  - `firstCol` returns `working` when it has cards; `review` when only review and done do; `done` when everything else is 0.
  - `mdEscape` matches the escaping inside `mdLink`.
- **`tests/workpane.test.ts`:**
  - On desktop, `work-bar` is one Markdown whose text holds `**Work**`, a link for the other view, `Filter`, `Show done` and `Refresh`. No `work-search` and no `work-epic` are drawn until pressing the `filter` link draws both. With a query set, the label reads `Filter (on)`.
  - On desktop, pressing the `done`, `refresh` and other-view links runs those handlers.
  - On desktop in the list view, `work-chips` is one Markdown, and an off chip with a count of 0 is not a link.
  - On desktop at 80 columns, with cards only in Done and Backlog, the board opens on Backlog. `work-board-col` is a Markdown, and pressing `Done` picks Done. No chips line is drawn.
  - On desktop, a picked column with no card in a lane reads `None in <Column>`.
  - On desktop, `work-lane-head-<k>` holds the toggle link and the bold title, and pressing the toggle folds the lane.
  - On the terminal, the toolbar, chips, Column Select and lane head are as before.
  - Mobile at 40 columns: no Filter part, and the board still stacks every column.
- Update the existing remote-surface tests that press `work-view-*`, `work-done`, `work-refresh`, `work-chip-*`, `work-toggle-*` or the Column Select, so they press the new links.

## Left to you

- Fixtures, test names, and where `pressLine` sits in `workTree`.

## Done when

- On remote surfaces, the pane draws as designed, and the terminal is unchanged.
- Gate validate, node and test are green.

## Review

Brain review (Fable 5.2): As designed. On remote surfaces each line of controls is one Markdown (`pressLine`): the toolbar, the chips, the stacked board's column line and the lane head; the search and the epic select open from Filter. `firstCol` picks the first column with cards and `mdEscape` holds `mdLink`'s escaping unchanged. The terminal keeps its Buttons, Input and Select. Worker choices, all accepted: the status part is not dimmed, `Filter (on)` is not bold, the remote chip line has no coloured squares, and `None in <column>` also shows on the terminal's picking branch. One nit for the redesign's doc pass: the guide's toolbar sentence now breaks at `(the phone has no search). a row of state chips`.
