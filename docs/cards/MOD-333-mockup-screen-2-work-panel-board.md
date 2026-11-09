---
id: MOD-333
title: Mockup screen 2: docs/mockups/work-panel-board.html draws the Work pane's Board view (kanban columns Backlog, Queued, Working, To review, Done, with epic swimlanes and a narrow fallback) from the same sample data
domain: mod
tier: standard
status: merged
scope: [docs/mockups/work-panel-board.html]
forbid: [docs/mockups/work-panel-list.html, hooks/**, tests/**, docs/cards/**, .claude-plugin/**, CHANGELOG.md, README.md]
red_test: none
gate: validate
budget: 2-attempts
spend: 4
---
## Why

The founder wants the work panel to function like a work tracker with a kanban view, as teams know from Jira. This is the second of two mockup screens; MOD-332 drew the List view. A pane has no drag and drop and is often narrow, so the board has to be judged as it would really be drawn: text columns, buttons, and a fallback when the pane is narrow.

## Before you start

docs/mockups/work-panel-list.html must exist in your worktree (MOD-332 merged it). If it is missing, stop and hand back saying so. Read it whole. Copy its `:root` colour custom properties (both schemes) and its `const DATA` literal into your page verbatim, and match its frame, label and header styling so the two pages read as one design. Do not edit that file.

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

### The Board view (this card)

- Five columns, left to right: `BACKLOG 7`, `QUEUED 4`, `WORKING 2`, `TO REVIEW 1`, `DONE 6`. Each is a box of equal width with its name and count as a bold heading and a line of `─` under it. The blocked card is in `QUEUED` (so its count is 3 queued + 1 blocked = 4), after the queued ones.
- An item in a column is a small box of three lines, with one blank line between items:
  line 1: the card id and tier glyph when it has a card (`MOD-900 🔵`), else the issue number and type (`#15 bug`, `#34 story`);
  line 2: the title, truncated to the column;
  line 3, dim: by state. backlog: the feature title. queued: `[Dispatch]`, or `slot… [Dispatch]` in amber for waiting for a slot. blocked: `by MOD-901 [Unblock]` with `by MOD-901` red. working: `1/2 · 6 min · $0.31`. to review: `$0.52 [Review]`. done: `✓` green and the feature title.
  The Unblock question replaces the item's three lines in place.
- `DONE` shows its 3 highest issue numbers, then a dim button row `+ 3 more`.
- Items do not move by dragging; say so nowhere in the panel. They change column when their state changes.
- A second header line, under the counts, holds the grouping toggle: `Group: [None] [Epic]` (current one bold).
  - `None`: one board as above.
  - `Epic`: one swimlane per epic. A swimlane is a disclosure row across the full width (`▾ #10 Checkout rework  ▰▰▰▱▱▱▱▱ 3/9`) with that epic's items in the five columns under it; the column headings are drawn once, at the top, with the overall counts. After the epics, a lane `▾ No epic` holds MOD-906 and #70. Epic C's lane is closed by default (`▸ #60 Sign-in hardening  ▰▰▰▰▰▰▰▰ 2/2`).
- Width rules (the pane reports its width in cells):
  - 100 cells or more: five columns.
  - 60 to 99: three columns, `QUEUED 4`, `WORKING 2`, `TO REVIEW 1`, and under the board one dim line `7 backlog · 6 done are in the List view`.
  - Under 60: the Board toggle shows the List view with one dim line under the header, `Board needs 60 cells; showing List`. For this case draw only the header, that line and a dim placeholder `(List view as in work-panel-list.html)`.

## Done when

- docs/mockups/work-panel-board.html exists and is the only file changed: one self-contained HTML file (inline CSS and script, no network requests, no external fonts, scripts or images) that opens from disk in a browser and shows no console error.
- It has a one-line page heading `Work pane · Board view (mockup)` and then five framed panels, each with a small label above it, in this order: (1) Board, group None, 110 cells; (2) Board, group Epic, 110 cells; (3) Board at 72 cells (three columns); (4) Board at 44 cells (the fallback line); (5) the empty state at 110 cells: header with zero counts, five empty columns with `0`, and under them the line `No work breakdown yet. /delegation tree import <file> files one, or /delegation land epic <title> starts one.` The page may scroll sideways on a small screen; the panels keep their cell widths.
- All panels are rendered by the page's script from the copied `const DATA` literal, with the colour custom properties copied from the List page.
- Every rule in `The Board view` and in `Design` is visible: column order and counts, the three-line items per state, the blocked card's place, `+ 3 more`, the grouping toggle, the swimlanes with their bars and default open and closed state, and the width rules. In panel 1 the `Group` toggle switches between None and Epic, `+ 3 more` reveals the rest, and the three actions behave as `Actions` says. The `[List]` toggle does nothing but is drawn.
- Every count agrees with `Totals` and `Roll-ups`, each item appears in exactly one column, and no title wraps.
- Nothing on the page breaks `What a pane can draw`.
- Below the panels, a `Notes` list of at most four lines says what the mockup cannot show of the real pane: no drag and drop (a card moves when its state changes), scrolling inside the pane, live redraw, the keyboard (Tab walks the buttons; `l` and `b` switch views, `g` switches grouping).
- Names are the invented ones; no real product, customer, employer or machine names, and no home folder paths.
- The validate gate is green.
