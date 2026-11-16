---
id: MOD-396
title: "Work pane: in stack mode a Column select picks the one board column each lane shows; mobile keeps stacking"
domain: mod
tier: standard
status: merged
issue: 553
spike: MOD-384
scope: [hooks/lib/workpane.tsx, hooks/register.ts, CHANGELOG.md, docs/guide.md, tests/workpane.test.ts, tests/*.test.ts, tests/harness.ts]
forbid: [bin/**, docs/cards/**, docs/mockups/**, docs/spikes/**, hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, docs/upgrading.md]
red_test: none
gate: validate, test
budget: 2-attempts
spend: 10
---
## Why

Issue #553. Below 100 columns, `boardLayout` returns `mode: 'stack'`, and every lane stacks all five columns, so one epic can run a screen long. This is MOD-384's card C16, and the original design had a column picker. Every surface draws `Select` except mobile, so mobile keeps stacking.

## Before you start

- `hooks/lib/workpane.tsx`: `board()`, which holds `stack`, `counts`, `lane`, `body(c)` and the stacked branch, plus `WorkView` and `WorkHandlers`, and the epic `Select` in `toolbar` for the Select's shape.
- `hooks/lib/work.ts`: `BoardCol`, `BOARD_COLS`, `BOARD_LABEL` and `boardCounts`. Do not change `work.ts`.
- `hooks/register.ts`: the Work pane module variables near `let workView`, `workHandlers`, and the `workTree(p, { … })` call.
- `tests/workpane.test.ts`: the stacked board tests (MOD-393's `DONE · <hidden>`).

## Design (decided by the brain; build it, do not redesign it)

- **State:** `WorkView` gains `stackCol?: BoardCol`, and `WorkHandlers` gains `col: (c: BoardCol) => void`. In `register.ts`, a module variable `let workStackCol: BoardCol = 'working'` sits beside `workView`, `col` sets it and redraws, and the `workTree` call passes `stackCol: workStackCol`. In `board()`, the column is `const pick = v.stackCol ?? 'working'`.
- **`const picking = stack && p.surface !== 'mobile'`.**
- **When `picking`:**
  - Where the side-by-side header would go (it is null in stack mode), draw the `Select`, keyed `work-board-col` with the label `Column`. Its options are `BOARD_COLS.map(c => ({ value: c, label: \`${BOARD_LABEL[c]} · ${counts[c]}\` }))`, its value is `pick`, and `onSelect` calls `hd.col(value as BoardCol)`. Draw it only when `lanes.length > 0`.
  - An open lane draws only `pick`'s column: `<Box key={\`work-col-${k}-${pick}\`} flexDirection="column" gap={1} width={B.col}>`, holding `body(pick)`, or one dim `—` when that is empty. It has no per-column heading.
- **When `stack` and not `picking` (mobile):** today's stacked branch, unchanged.
- The side-by-side board (`mode: 'columns'`) is unchanged.
- Mark the change `MOD-396 (#553)` once, in the file's top comment block.
- `CHANGELOG.md`, `## Unreleased` (create it above `## 0.9.65` when absent), `### Changed`: one bullet `(MOD-396, #553)`.
- `docs/guide.md`: where the guide describes the board, add one sentence: below 100 columns a Column select picks the column each lane shows (Working at first), and mobile stacks every column.

## Tests

In `tests/workpane.test.ts`:
- On desktop at 80 columns, the board draws `work-board-col`, with Working selected and five options carrying counts. An open lane draws `work-col-<k>-working` and no other `work-col-<k>-*`.
- Selecting `done` through the Select's `onSelect` draws `work-col-<k>-done`, including the `N done · show` line where cards are hidden.
- A lane with no card in the picked column draws `—`.
- On mobile at 40 columns, there is no `work-board-col`, and the stacked headings are drawn as today.
- At 130 columns there is no `work-board-col`.
- Update the existing stacked-board tests so they run on mobile, or select the column they read.

## Left to you

- Fixtures, test names, and how the tests drive `stackCol`.

## Done when

- The stack-mode board draws as designed on every surface.
- Gate validate and test are green.

## Review

Brain review (Opus 5.5): Built as designed. Below 100 columns, off mobile, a Column Select with five count-labelled options sits first in the board, and an open lane draws only the picked column, or a dim dash when it is empty. Mobile keeps the stacked branch, and the side-by-side board is unchanged. workStackCol defaults to working, is reset at session start, and is passed to workTree. The tests drive the real Select. Nit: body(pick) is called twice per lane, once to test and once to draw.
