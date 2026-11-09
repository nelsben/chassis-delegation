---
id: MOD-347
title: The Work pane mockup is redrawn as a modern work tracker: one page, docs/mockups/work-panel.html, with a tree table, a board and a drill-down detail panel
domain: mod
tier: standard
status: merged
scope: [docs/mockups/work-panel.html, docs/mockups/work-panel-list.html, docs/mockups/work-panel-board.html]
forbid: [hooks/**, tests/**, docs/cards/**, .claude-plugin/**, bin/**, CHANGELOG.md, README.md]
red_test: none
gate: validate
budget: 2-attempts
spend: 8
---
## Why

The first two mockups of the Work pane (MOD-332, MOD-333) were drawn as monospace text on a character grid. The founder's verdict: they read as terminal output and an old design, with no tables and nothing to drill into. He wants a fresh, modern tracker in the manner of Jira: a table with columns, rows that expand, and an item you can open for its detail. The first card limited the drawing to four text elements, which was wrong for the editor and desktop side panel: there a pane can draw far more (listed below). This card replaces both pages with one working prototype.

## What is being mocked

The mod will gain a pane titled `Work`: a work tracker over the epic → feature → story/task/bug/spike hierarchy the mod files on GitHub, joined to the mod's own cards (units of delegated work with ids like MOD-900; a card usually belongs to one leaf issue). The page is a static, self-contained HTML prototype the founder judges before any pane code is written.

## What a pane can draw in the editor and desktop side panel (stay inside this)

- Flex boxes (row or column, gap, padding, margin, fixed or percentage width, wrap, overflow hidden) with a background colour, a border and a hover style.
- Text with a colour, a background colour, bold, italic, and truncation with an ellipsis.
- Buttons, primary or secondary; a one-line text input; a select (dropdown); links.
- Inline SVG, which may be clickable: use it for the type icons, chevrons, the progress bars and the tier dots.
- Not available, so do not draw: drag and drop, modal dialogs, tooltips, animation or transitions, images, web fonts, sticky headers, shadows deeper than a 1px border look. Corner radius: at most 4px on boxes and 3px on lozenges.

## Design (decided by the brain; build it, do not redesign it)

### Page frame

- Page heading `Work pane (prototype)` and, beside it, a preview-width control outside the pane: `Side panel 420` · `Split 720` · `Wide 1100` (default Wide). It sets the pane frame's width in px; the pane lays itself out from its own width (a `ResizeObserver` or the chosen value, not the window's media queries).
- One pane frame, 1px border, radius 4px. Under it a `Notes` list (see Done when).
- Font: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`, 13px, line height 20px. Numbers and ids use `font-variant-numeric: tabular-nums`. No monospace anywhere.

### Colour tokens (custom properties on `:root`; the dark set under `prefers-color-scheme: dark`)

| Token | Light | Dark |
|---|---|---|
| `--bg` | `#ffffff` | `#1d2125` |
| `--surface` | `#f7f8f9` | `#22272b` |
| `--hover` | `#f1f2f4` | `#2c333a` |
| `--selected` | `#e9f2ff` | `#1c2b41` |
| `--border` | `#dcdfe4` | `#38414a` |
| `--text` | `#172b4d` | `#b6c2cf` |
| `--subtle` | `#626f86` | `#8c9bab` |
| `--accent` | `#0c66e4` | `#579dff` |
| `--on-accent` | `#ffffff` | `#1d2125` |

Status lozenges (background / text), light then dark: working `#e9f2ff`/`#0055cc`, `#09326c`/`#85b8ff` · to review `#fff7d6`/`#7f5f01`, `#533f04`/`#f5cd47` · queued `#f1f2f4`/`#44546f`, `#2c333a`/`#9fadbc` · blocked `#ffeceb`/`#ae2e24`, `#5d1f1a`/`#fd9891` · done `#dcfff1`/`#216e4e`, `#164b35`/`#7ee2b8` · backlog: transparent with a 1px `--border` outline, text `--subtle`.

Type icons: a 16px rounded square (radius 3px) with a white glyph, as inline SVG: epic `#8270db` (bolt), feature `#f38a3f` (flag), story `#22a06b` (bookmark), task `#1d7afc` (check), bug `#e2483d` (dot), spike `#626f86` (question mark).

Tier dot: a 8px circle, economy `#22a06b`, standard `#1d7afc`, frontier `#8270db`, before the model name.

### States (a leaf has exactly one; first match wins)

`done` (issue closed or card merged) · `working` (a worker is on its card now) · `to review` (the worker handed back) · `blocked` (its card waits on another card) · `queued` (card cut, not started; may be `waiting for a slot`) · `backlog` (open issue, no card). Lozenge labels in capitals, 11px, bold: `WORKING`, `TO REVIEW`, `QUEUED`, `BLOCKED`, `DONE`, `BACKLOG`.

### Toolbar (top of the pane, both views; wraps to two rows at 420)

- Left: the title `Work` (16px, bold), then a segmented control `List` | `Board` (the current segment has the `--selected` background and accent text). It switches the view and works.
- Middle: a search input, placeholder `Search work`, that filters as you type on title, issue number and card id (case-insensitive).
- Right: a select `Epic: All` (All, then each epic), a checkbox-style toggle button `Show done` (off by default), then, in `--subtle`, `Updated 4 min ago` and a secondary `Refresh` button (it does nothing).

### Summary strip (under the toolbar, both views)

Six filter chips in a row, each a count in bold over a label: `2 Working` · `1 To review` · `3 Queued` · `1 Blocked` · `7 Backlog` · `6 Done`. Each chip has a 3px left edge in its status text colour. A click selects that status as a filter (the chip takes the `--selected` background); a second click clears it. Several may be selected. The counts are always the totals, not the filtered counts.

### List view: a tree table

Columns, with a header row (11px, capitals, `--subtle`, bottom border; `--surface` background):

| Column | Content | Shown at |
|---|---|---|
| Work | indent (20px per level), chevron for a parent, type icon, issue number as a link in `--subtle` (`#13`), title (truncates) | all widths |
| Status | the lozenge for a leaf; nothing for a parent | all widths |
| Progress | parents only: a 64px by 6px bar (done part in the done text colour, rest `--border`) and `3/9` | 720 and up |
| Card | the card id, `--subtle` | 720 and up |
| Worker | tier dot, model, then `· 1/2` attempt; working and to-review rows only | 1100 only |
| Cost | `$0.31`, right-aligned | 1100 only |
| Action | one button, see Actions | all widths |

- Rows are 36px high with a 1px bottom border, and take the `--hover` background on hover. An epic row is bold; a feature row is semi-bold.
- A click on a parent row's chevron or title expands or collapses it. A click on a leaf row selects it (the `--selected` background and a 2px accent left edge) and opens the detail panel.
- Open by default: Epic A with both features, Epic B with Weekly digest. Closed by default: CSV export.
- After the epics, a parent-style row `No epic` (no type icon) holding the card with no issue (MOD-906, shown with the task icon and `—` for its number) and issue #70.
- `Show done` off: done leaves are hidden, and an epic whose leaves are all done is hidden. Each parent with hidden done children ends with one indented `--subtle` row `2 done hidden · show`, whose `show` is a link that reveals that parent's done rows. Progress always counts done leaves.
- With a search text, a status chip or an epic selected, the table lists only the matching leaves, each under its ancestors (kept open); a parent with no match is not drawn. With no match at all: one centred `--subtle` row `No work matches. Clear filters` whose second sentence is a link that clears them.
- The empty state (no data at all): the toolbar, zero counts, and a centred block: `No work breakdown yet`, bold, then in `--subtle`, `Import one with /delegation tree import <file>, or start one with /delegation land epic <title>.`

### Board view

- Five columns, equal width with an 8px gap: `Backlog`, `Queued`, `Working`, `To review`, `Done`. Each has a header (11px capitals, `--subtle`, with its count) on a `--surface` column background, radius 4px. A blocked item sits in `Queued` and carries the `BLOCKED` lozenge. The column counts therefore read Backlog 7, Queued 4, Working 2, To review 1, Done 6.
- Swimlanes by epic: a full-width lane header row per epic (chevron, epic icon, title, progress bar and `3/9`), collapsible; then a last lane `No epic`. Epic C's lane is closed by default; the others are open.
- A card is a `--bg` box with a 1px border, radius 4px, 8px padding: the title (wraps to at most two lines, then an ellipsis); under it one row with the type icon, the issue number, and at the right the card id in `--subtle`; a working or to-review card adds a row with the tier dot, model, attempt and cost; a card with an action ends with its button, full width. Hover gives the `--hover` background; a click opens the detail panel.
- `Show done` off: the `Done` column shows no cards, only `6 done · show` (per lane: that lane's count); `show` turns the toggle on.
- At 720 the columns keep a minimum width of 150px and the board scrolls sideways inside the pane. At 420 the board becomes one column at a time: a select `Column: Working` above the cards picks which.
- Search, the chips and the epic select filter the board the same way as the list. An empty column shows `—` in `--subtle`.

### Detail panel (the drill-down)

- Opens for the selected leaf. At 1100 it is a 340px column at the right of the pane with a left border, beside the list or board, which narrows. At 720 and 420 it replaces the view: the toolbar stays, and the panel starts with a link `← Back to list` (or `board`).
- Content, top to bottom:
  1. A breadcrumb of links in `--subtle`: `Checkout rework / Saved carts` (a click selects nothing but filters to that epic), and at the right a secondary `Close` button.
  2. The type icon, issue number, and the title at 16px bold, wrapping.
  3. The status lozenge and, when it has one, the action button (primary).
  4. A two-column field grid (label in `--subtle`, value): `Type`, `Card`, `Worker` (tier dot and model), `Attempt`, `Running` (minutes, working only), `Cost`, `Blocked by` (blocked only, a link that selects that card's item), `Parent`. A field with no value shows `—`.
  5. `Activity`, a heading, then a vertical timeline (a 1px `--border` line with 8px dots): the newest first, each with a `--subtle` relative time. Build it from the state: backlog has `Issue opened`; queued adds `Card MOD-902 cut`; working adds `Dispatched to sonnet, attempt 1 of 2`; to review adds `Handed back, gates green`; blocked adds `Blocked by MOD-901: its scope overlaps`; done adds `Verdict consistent`, `Merged`. Invent plausible times, descending.
- A parent row has no detail panel.

### Actions (list, board and detail)

- `queued` → `Dispatch` · `blocked` → `Unblock` · `to review` → `Review`. Nothing else has one. In the table and on board cards the button is secondary; in the detail panel it is primary.
- A press starts nothing itself in the real pane: it puts one line to the session and the item waits. So a click on `Dispatch` or `Review` replaces the button, everywhere that item is drawn, with `--subtle` italic text `Asked · waiting for the session`.
- `Unblock` asks first, inline where it was pressed, with no modal: the text `MOD-901 still overlaps it. Unblock anyway?` and two buttons, `Unblock` (primary) and `Cancel`. `Cancel` restores the button; `Unblock` gives the asked text. In a table row the question takes the row's full width below the row.

### Sample data (use exactly this, in one `const DATA` literal at the top of the script; everything is rendered from it)

- Epic A `#10 Checkout rework`
  - Feature `#11 Saved carts`
    - story `#12 Save a cart from the basket`: done
    - story `#13 Restore a saved cart`: working, MOD-900, standard sonnet, attempt 1/2, 6 min, $0.31
    - story `#14 Expire saved carts after 30 days`: queued, MOD-902
    - bug `#15 Saved cart loses the coupon`: backlog
  - Feature `#20 Address book`
    - story `#21 Pick a saved address`: done
    - story `#22 Edit an address inline`: done
    - story `#23 Validate postcodes per country`: to review, MOD-901, standard sonnet, attempt 1/2, $0.52
    - story `#24 Default address per account`: blocked, MOD-903, by MOD-901
    - task `#25 Migrate old address rows`: backlog
- Epic B `#30 Reporting`
  - Feature `#31 Weekly digest`
    - story `#32 Digest email template`: working, MOD-904, economy haiku, attempt 2/2, 2 min, $0.02
    - story `#33 Pick the digest day`: queued, MOD-905, waiting for a slot
    - story `#34 Unsubscribe link`: backlog
    - spike `#35 Can the digest reuse the export job?`: backlog
  - Feature `#40 CSV export`
    - story `#41 Export orders as CSV`: done
    - story `#42 Export filters`: backlog
    - story `#43 Scheduled exports`: backlog
- Epic C `#60 Sign-in hardening`
  - Feature `#61 Passkeys`
    - story `#62 Register a passkey`: done
    - story `#63 Sign in with a passkey`: done
- No epic: card MOD-906 `Bump the lint config`, queued, no issue; issue `#70 Typo on the pricing page`, backlog

Totals: 2 working, 1 to review, 3 queued (MOD-902, MOD-905, MOD-906), 1 blocked, 7 backlog (#15, #25, #34, #35, #42, #43, #70), 6 done.
Progress: Saved carts 1/4 · Address book 2/5 · Epic A 3/9 · Weekly digest 0/4 · CSV export 1/3 · Epic B 1/7 · Passkeys 2/2 · Epic C 2/2.
`waiting for a slot` shows as `--subtle` text after the `QUEUED` lozenge at 1100 and in the detail panel's status row.

### Left to you (list each as a `choice:` line in your hand-back, above the report)

- The SVG paths of the icons and chevrons, and exact paddings and gaps inside the rules above.
- Column widths, and how the script is structured.
- The invented activity times.
- How the empty state is reached for viewing (see Done when).

## Done when

- `docs/mockups/work-panel.html` exists: one self-contained file (inline CSS, script and SVG; no network request, no external font, script or image) that opens from disk in a browser with no console error. `docs/mockups/work-panel-list.html` and `docs/mockups/work-panel-board.html` are deleted. No other file changes.
- Everything is rendered by the script from the one `const DATA` literal, and every colour used is one of the tokens or status, type or tier colours above, set as custom properties with the dark set under `prefers-color-scheme: dark`.
- At each of the three preview widths, in light and in dark: nothing overlaps or overflows the pane frame, no text is clipped without an ellipsis, and the columns shown are the ones the List table names for that width.
- These work on click: the List and Board switch; expand and collapse of epics, features and board lanes; selecting a leaf and the detail panel (side column at 1100, replacing the view below that, with Back and Close); the search input; the six chips; the epic select; `Show done` and the per-parent `show` links; the three actions, the asked text and the Unblock question with Cancel, kept in step between list, board and detail; `Clear filters`.
- A link `View empty state` under the pane (outside it) redraws the pane from an empty copy of the data, and `View sample` brings it back.
- Every number on the page agrees with `Totals` and `Progress`, and with the board's column counts.
- Nothing on the page is outside `What a pane can draw`, and there is no monospace text, no ASCII-art bar, no bracketed `[Button]` label.
- Under the pane, `Notes`: at most five short lines on what the prototype cannot show of the real pane (rows redrawing as workers hand back; keyboard: Tab walks the controls; the terminal draws a plainer text version of the same data; corner radius and the select's look are the host's; nothing here calls GitHub).
- Names are the invented ones above: no real product, customer, employer or machine names, and no home folder paths.
- The validate gate is green.

## Review

Brain review: page rendered in a headless browser and viewed at 1100 (list, board, detail beside each) and at 420 (list). The toolbar, the six status chips, the tree table, the board with epic swimlanes and the detail panel are as the design gives them. Known flaws: at 420 the updated time is cut with an ellipsis; with the detail panel open at 1100 the list uses the 720 column set and the board scrolls sideways; the light theme was not checked by eye. Worker choices: 21 listed.
