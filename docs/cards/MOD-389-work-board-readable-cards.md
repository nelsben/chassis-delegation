---
id: MOD-389
title: "Work pane board: a card title takes two lines, the card id sits at the right of its row, the column headers carry counts, and the list's Cost is right-aligned"
domain: mod
tier: standard
status: merged
issue: 539
spike: MOD-384
scope: [hooks/lib/workpane.tsx, hooks/lib/work.ts, CHANGELOG.md, tests/node/workboard.node.mjs, tests/workpane.test.ts, tests/*.test.ts, tests/node/*.node.mjs, tests/harness.ts]
forbid: [bin/**, docs/cards/**, docs/mockups/**, docs/spikes/**, hooks/register.ts, hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, docs/upgrading.md, docs/guide.md]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/workboard.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Issue #539, card B of the MOD-384 Work pane review (docs/spikes/MOD-384-findings.md, Q3 items 1 and 12, Q4 changes C1, C10 and C11). The worst spot in the pane is the board: a card's title, its main content, is cut to one line of 16 to 22 cells, and most titles are longer. The card id sits right after the issue number, the column headers give no counts, and the list's Cost column is left-aligned.

## Before you start

- `hooks/lib/workpane.tsx`: the board's `card`, the `work-board-header`, the stacked column heading (`BOARD_LABEL[c].toUpperCase()} · ${l.cols[c].length}`), and the list's Cost cell and header.
- `hooks/lib/work.ts`: `boardLayout`, `BoardLane` (`cols`, `more`, `doneHidden`) and `BOARD_COLS`.
- `tests/node/workboard.node.mjs` for the pure board tests and `tests/workpane.test.ts` for the drawn ones.

## Design (decided by the brain; build it, do not redesign it)

- **C1, two-line titles.**
  - New pure `export function twoLines(title: string, w: number): [string, string]` in `work.ts`, counting code points.
    - A title of at most `w` is `[title, '']`.
    - Otherwise line 1 ends at the last space at or before position `w`, and the space is dropped. With no such space after position 0, it is the first `w` code points.
    - Line 2 is the rest, with leading spaces trimmed, cut to `w` with a trailing `…` when longer.
  - The board card draws line 1 as today's title Button (same key, plain, dim when done) and line 2, when not empty, as `<Text dimColor={it.state === 'done'}>` under it. `w` is `Math.max(4, B.col - 2)`, as today.
- **C10, the card id at the right.** The board card's second row becomes `justifyContent="space-between"`: a Box holding the type mark and the issue number on the left, and the card id `Text`, still dim, on the right.
- **C10, Cost right-aligned.** The list's Cost header and each Cost cell pad their text on the left to `L.cost` cells, so `$0.61` and `Cost` end at the column's right edge.
- **C11, header counts.**
  - New pure `export function boardCounts(lanes: readonly BoardLane[]): Record<BoardCol, number>` in `work.ts`. Each column's count is the sum over all lanes of `cols[c].length + more[c]`, plus `doneHidden` for `done`. It counts every card in that column, folded or not.
  - The side-by-side header reads `QUEUED 4`: the label in capitals, a space, the count, all fitted to `B.col` as today.
  - The stacked heading keeps its per-lane count.
- Mark them `MOD-389 (#539)`.
- `CHANGELOG.md`, `## Unreleased` (make it above `## 0.9.63` when absent), `### Changed`: one bullet `(MOD-389, #539)`.

## Tests

- `tests/node/workboard.node.mjs` (the red test):
  - `twoLines`: a short title; a split at a space; no space, which hard-splits at `w`; a long rest cut with `…`; and `w` of 4.
  - `boardCounts`: two lanes with cards, `more` and `doneHidden`, giving the summed counts.
- `tests/workpane.test.ts`:
  - On the board at 130 columns, a card with a 40-character title draws two title lines.
  - The header reads `QUEUED <n>`.
  - In the list at 130 columns, a Cost cell ends at the column's right edge.

## Left to you

- Fixture titles and test names.

## Done when

- Board titles take two lines, the card id is at the right, and the header counts and right-aligned Cost are drawn as designed.
- No other drawing changes.
- Gate validate, node and test are green.

## Review

Brain review (Opus 5.5): Built as designed, on sonnet. twoLines breaks at the last space at or before w, or hard-breaks with none, left-trims the rest and cuts it to w with the ellipsis inside the w cells. boardCounts sums shown, more and the hidden done over every lane, and the side-by-side header reads QUEUED n while the stacked heading keeps its per-lane count. The card's second row puts the mark and issue left and the dim card id right, and the list's Cost header and cells are padded left to L.cost. The worker's choices (a title of exactly w is one line; the separating space dropped under space-between) are sound. Nit: the edit left `const leavesOf =(it` without its space; harmless.
