---
id: MOD-332
title: Mockup screen 1: docs/mockups/work-panel-list.html draws the Work pane's List view (Now, Queued, and the epic, feature, story, issue backlog outline) with its actions, from the fixed sample data
domain: mod
tier: standard
status: merged
scope: [docs/mockups/work-panel-list.html]
forbid: [hooks/**, tests/**, docs/cards/**, .claude-plugin/**, CHANGELOG.md, README.md]
red_test: none
gate: validate
budget: 2-attempts
spend: 4
---
## Why

Teams know the epic, feature, story, issue structure, so the mod's work panel should show the work breakdown in that shape and behave like a work tracker, not like the growing-tree picture tried before. This is the first of two mockup screens (the Board view follows in MOD-333 and reuses this page's data and styles); the founder judges the layout from them before any pane code is written.

## Design (decided by the brain; draw it, do not redesign it)

### What is being mocked

The mod will gain a pane titled `Work`, opened by `/delegation work`: a work tracker over the epic → feature → story → issue hierarchy the mod already files on GitHub, joined to the mod's own cards. It has two views of the same data, switched by a `List` / `Board` toggle in its header. This card draws one of them as a static HTML page so the founder can judge it before pane code is written. The mod's cards are units of delegated work (ids like MOD-900); a card usually belongs to one issue (a story, task, bug or spike).

### What a pane can draw (the mockup must stay inside this)

A real pane is drawn in a terminal or a desktop side panel from four elements only: a box (row or column layout, fixed width in character cells, text-colour borders), text (colour, dim, bold), a button (a text label; a click or a hotkey presses it) and a link. Therefore, in the mockup:

- Everything is monospace text on a character grid. Size the panel in `ch` units. One font size.
- No SVG, images, icon fonts, shadows, gradients, rounded pills, animation, hover-only affordances, tooltips, modals, drag and drop, or wrapped titles. Titles truncate with `…`.
- A disclosure is a full-width button whose label starts `▸` (closed) or `▾` (open). A progress bar is 8 text cells, `▰` done and `▱` not, done cells = round(8 × done / total).
- A button is drawn as `[Label]` in the accent colour. An issue number (`#13`) is a link (href `#`).
- Colour is text colour only: green = done, amber = waiting (queued, to review, waiting for a slot), red = blocked, accent blue = working and buttons, dim grey = secondary lines. Light and dark via `prefers-color-scheme`.
- Tier glyphs before a model name: 🟢 economy, 🔵 standard, 🟣 frontier.

### States (a leaf issue or a card has exactly one; first match wins)

`done` (issue closed or card merged) · `working` (a worker is on its card now) · `to review` (the worker handed back; waiting for the reviewer) · `blocked` (card waits on another card) · `queued` (card cut, not started; may add `waiting for a slot`) · `backlog` (open issue, no card).

### Header (both views)

Line 1: `Work` then the toggle `[List] [Board]` (the current one bold, not a button) and, right-aligned, `as of 4 min ago [Refresh]`.
Line 2, dim: `2 working · 1 to review · 3 queued · 1 blocked · 7 backlog`.

### Actions (both views)

- A `queued` item carries `[Dispatch]`, a `blocked` item `[Unblock]`, a `to review` item `[Review]`. Nothing else has an action. `backlog`, `working` and `done` items have none.
- In the real pane a press does not start anything by itself: it puts one line to the session (`dispatch MOD-902`) and the row then reads, dim, `asked · waiting for the session` until its state changes. In the mockup a click on `[Dispatch]` or `[Review]` swaps the button for that dim text.
- `[Unblock]` asks first, inline, in the item's own space (there are no modals): `Unblock MOD-903? MOD-901 still overlaps it. [Unblock] [Cancel]`. `[Cancel]` restores the row; `[Unblock]` shows the asked text.

### Sample data (use exactly this; the counts are already reconciled)

Put it in one `const DATA = …` literal at the top of the page's script, and render every screen on the page from it.

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
- Epic C `#60 Sign-in hardening` (everything done)
  - Feature `#61 Passkeys`
    - story `#62 Register a passkey`: done
    - story `#63 Sign in with a passkey`: done
- A card with no issue: MOD-906 `Bump the lint config`, queued
- An open issue outside the hierarchy: `#70 Typo on the pricing page`, backlog

Totals: 2 working, 1 to review, 3 queued (MOD-902, MOD-905, MOD-906), 1 blocked, 7 backlog (#15, #25, #34, #35, #42, #43, #70), 6 done.
Roll-ups: Saved carts 1/4 done · Address book 2/5 · Epic A 3/9 · Weekly digest 0/4 · CSV export 1/3 · Epic B 1/7 · Passkeys 2/2 · Epic C 2/2.

### The List view (this card)

Three sections, in this order, each headed by its name in bold capitals with its count (`NOW 3`).

1. `NOW`: the working cards, then the to-review cards. Two lines each:
   line 1 `<card id> <title…>`; line 2, dim, `<epic title> › <feature title> · <glyph> <model> · attempt 1/2 · 6 min · $0.31`. A to-review card has `to review` (amber) where the minutes are, and `[Review]` at the right end of line 1.
2. `QUEUED`: the queued cards, then the blocked card. Line 1 `<card id> <title…>` with `[Dispatch]` or `[Unblock]` right-aligned; line 2, dim, the breadcrumb, then ` · waiting for a slot` (amber) or ` · blocked by MOD-901` (red) where it applies. MOD-906 has the breadcrumb `no issue`.
3. `BACKLOG`: the outline, indented two cells per level.
   - An epic or feature row is a disclosure button: `▾ #11 Saved carts`, then on the same line right-aligned the bar and `1/4`; under it one dim line with the rest of the roll-up, only the non-zero parts, e.g. `1 working · 1 queued · 1 backlog`.
   - A leaf row is `#14 Expire saved carts after 30…` with its state right-aligned: `working MOD-900` (accent), `to review MOD-901` (amber), `queued MOD-902` (amber), `blocked MOD-903` (red), nothing for backlog. The type is shown only when it is not a story: `#15 bug · Saved cart loses the…`.
   - Done leaves are hidden. A parent with done children ends with a dim button row `+ 2 done` that reveals them (green, `✓ #21 Pick a saved address`) and then reads `− hide done`.
   - Open by default: every epic and feature with anything working, to review, queued or blocked under it (so Epic A with both its features, Epic B with Weekly digest). Closed by default: CSV export.
   - After the epics: a disclosure `▸ Unsorted 1` holding #70, then a last dim disclosure `▸ Done epics 1` holding Epic C.

## Done when

- docs/mockups/work-panel-list.html exists and is the only file changed: one self-contained HTML file (inline CSS and script, no network requests, no external fonts, scripts or images) that opens from disk in a browser and shows no console error.
- It has a one-line page heading `Work pane · List view (mockup)` and then four framed panels, each with a small label above it, in this order: (1) the List view at 44 cells wide; (2) the same at 80 cells wide (line 2 of Now and Queued rows may join line 1 only if every row still fits; otherwise identical); (3) the empty state at 44 cells: the header with all counts zero, then the one line `No work breakdown yet. /delegation tree import <file> files one, or /delegation land epic <title> starts one.`; (4) the 44-cell view with the Unblock question open on MOD-903.
- All four are rendered by the page's script from the one `const DATA` literal (the empty state from an empty copy), and the CSS colours are custom properties on `:root` named `--fg`, `--dim`, `--accent`, `--done`, `--wait`, `--blocked`, `--bg`, `--frame`, with a dark set under `prefers-color-scheme: dark`. MOD-333 copies both blocks, so keep them self-contained at the top of the style and script.
- Every rule in `Design` above is visible in panel 1: the header, the three sections with their counts, the row formats, the default open and closed rows, the done toggles, Unsorted and Done epics, and the three action buttons. Disclosures, done toggles and the actions work on click as described. The `[Board]` toggle does nothing but is drawn.
- Every number on the page agrees with `Totals` and `Roll-ups` above, and no title wraps at 44 cells.
- Nothing on the page breaks `What a pane can draw`.
- Below the panels, a `Notes` list of at most four lines says what the mockup cannot show of the real pane: scrolling inside the pane, rows redrawing as workers hand back, the keyboard (Tab walks the buttons; `l` and `b` switch views, `r` refreshes).
- Names are the invented ones above; no real product, customer, employer or machine names, and no home folder paths.
- The validate gate is green.
