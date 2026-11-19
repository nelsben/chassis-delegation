---
id: MOD-404
title: "Work pane on remote surfaces: status lozenges are SVG pills, progress bars are thin SVG bars, board cards have a rounded border, and a picture budget falls back to the Text forms"
domain: mod
tier: standard
status: merged
issue: 567
scope: [hooks/lib/workpane.tsx, hooks/lib/work.ts, CHANGELOG.md, docs/guide.md, tests/workpane.test.ts, tests/*.test.ts, tests/node/*.node.mjs, tests/harness.ts]
forbid: [bin/**, hooks/register.ts, docs/cards/**, docs/mockups/**, docs/spikes/**, hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, docs/upgrading.md, docs/internals.md]
red_test: none
gate: validate, node, test
budget: 2-attempts
spend: 12
---
## Why

Issue #567. This card builds on MOD-403 (merged). Read the `## Drawing on the editor and the desktop` section of docs/internals.md first.

On a remote surface, three things look crude today:
- **The lozenge** is a bold Text with a background, square-cornered and a full line tall.
- **The progress bar** is two boxes of spaces, a thick block a line tall.
- **A board card** is a flat fill.

The editor draws `Svg` as an image and gives a `borderStyle="round"` Box a 1px border with rounded corners. One drawing holds at most 250 pictures; past that, an Svg draws as its `alt` text.

The terminal draws exactly as today.

## Before you start

- `hooks/lib/work.ts`: `LOZENGE`, `STATE_LABEL`, `TRACK_BG`, `typeIcon` (the SVG string style to follow), and `progressCells`.
- `hooks/lib/workpane.tsx`:
  - `Svg` and `markNode`;
  - `bar`;
  - the list status cell in `itemRow` (the non-dot lozenge);
  - in `board()`: `card()` and its BLOCKED lozenge;
  - `lozengeOf` (the detail).

## Design (decided by the brain; build it, do not redesign it)

### In `work.ts` (pure, exported)

- **`pillSvg(state: WorkState, scheme: Scheme): { source: string; width: number }`:**
  - The label is `STATE_LABEL[state].toUpperCase()`. The width is `Math.round(12 + 6.6 * [...label].length)`, and the height is 18.
  - The markup is one `<svg xmlns="http://www.w3.org/2000/svg" width="W" height="18" viewBox="0 0 W 18">` holding a background and a label.
  - **The background:**
    - When `LOZENGE[state][scheme].bg` is set: `<rect width="W" height="18" rx="4" fill="BG"/>`.
    - When it is not (backlog): `<rect x="0.5" y="0.5" width="W-1" height="17" rx="4" fill="none" stroke="FG"/>`.
  - **The label:** `<text x="W/2" y="12.5" text-anchor="middle" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="10" font-weight="600" letter-spacing="0.3" fill="FG">LABEL</text>`.
- **`barSvg(done: number, leaves: number, scheme: Scheme): string`:**
  - The size is 64 × 6. A track `<rect width="64" height="6" rx="3" fill="TRACK_BG[scheme]"/>` comes first.
  - Then a done `<rect width="D" height="6" rx="3" fill="LOZENGE.done[scheme].fg"/>`, where `D = Math.round(64 * done / leaves)` clamped to 0..64. It is left out when `D` is 0, or when `leaves <= 0`.

### In `workTree` (remote only)

- **The picture budget:**
  - `let pictures = 0` sits at the top of `workTree`, beside `const picture = (): boolean => Svg !== undefined && pictures++ < 240`.
  - Every Svg the tree draws first asks `picture()`; this card's Svgs and `markNode`'s icon all do. When it says false, that element draws its terminal form (the glyph, the lozenge Text, or the cell bar).
- **Lozenges:**
  - The list status cell (when not `dot`), the board card's BLOCKED lozenge and `lozengeOf` each draw `<Svg source={pill.source} alt={STATE_LABEL[state]} width={pill.width} height={18} />`, where `pill = pillSvg(state, v.scheme)`.
  - The `dot` form and the terminal are unchanged.
- **The bar:** `bar(done, leaves)` draws `<Box flexDirection="row" flexWrap="nowrap" alignItems="center">`, holding:
  - `<Svg source={barSvg(done, leaves, v.scheme)} alt={\`${done} of ${leaves} done\`} width={64} height={6} />`;
  - then today's `<Text>{\` ${done}/${leaves}\`}</Text>`.
- **Board cards:**
  - The card Box gains `borderStyle="round"` and `borderColor={selected ? '#1d7afc' : TRACK_BG[v.scheme]}`.
  - Its `backgroundColor` and `paddingLeft` and `paddingRight` stay as they are.

### Docs and marks

- Mark the change `MOD-404 (#567)` once, in the top comment block of `workpane.tsx`.
- `CHANGELOG.md`, under `## Unreleased`, `### Changed`: one bullet `(MOD-404, #567)`.
- `docs/guide.md`, in the Work pane paragraphs: one sentence saying that on the desktop, the editor and the phone, statuses are drawn as pills, progress as a thin bar, and board cards with a rounded border.

## Tests

- **Node (`tests/node/`):**
  - `pillSvg('review', 'light')` has width `Math.round(12 + 6.6 * 9)` and holds `TO REVIEW`. Backlog's has a `stroke` and `fill="none"`.
  - `barSvg(0, 4, 'dark')` has one rect; `barSvg(2, 4, 'dark')` has a done rect of width 32; `barSvg(5, 4, 'light')` has a done rect of width 64.
- **Engine, on `vscode`:**
  - A list leaf's status is an Svg whose `alt` is its state label, and no Text in that row has a `backgroundColor`.
  - A parent's bar is an Svg at 64 × 6.
  - A board card has `borderStyle` `round`, and the selected one has `borderColor` `#1d7afc`.
- **Budget, on `vscode`:** with 260 leaves listed (each has a type mark and a pill), at most 240 Svgs are drawn, and the rows after the budget draw the Text lozenge.
- **Terminal:** no Svg, and the lozenge, bar and card draw as before. Every terminal test passes unchanged.

## Left to you

- Fixtures, test names, and where the helpers sit in `work.ts`.

## Done when

- On remote surfaces, the pane draws as designed, and the terminal is unchanged.
- Gate validate, node and test are green.

## Review

Brain review (Opus 5.5): As designed. work.ts gains pillSvg (width 12 + 6.6 per character, height 18, rx 4, backlog an outline) and barSvg (64 by 6, a track then the done part, clamped, none at 0 or no leaves). On remote surfaces the list status cell, the board BLOCKED lozenge and the detail lozenge draw the pill, the bar is the Svg plus its count, and a board card has a round border, blue when selected. A per-drawing budget of 240 pictures (type marks included) falls back to the text forms; the 260-leaf test shows the last row drawing its text lozenge. The terminal is unchanged. Worker choices, all accepted: a pillNode helper with callers asking picture() first; the border props spread only on remote; the helpers placed beside typeIcon and TRACK_BG. Note for later: the list draws at most 200 rows, so the budget runs out near row 120 of a long list, where the rest fall back as designed.
