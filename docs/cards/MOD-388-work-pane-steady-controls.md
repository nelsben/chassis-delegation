---
id: MOD-388
title: "Work pane: the chips and the List/Board switch keep one width when pressed, the detail status row has gaps and wraps, the loading line shows once, the footer reads Close, and a selected leaf has a marker"
domain: mod
tier: standard
status: merged
issue: 538
spike: MOD-384
scope: [hooks/lib/workpane.tsx, CHANGELOG.md, tests/workpane.test.ts, tests/*.test.ts, tests/harness.ts]
forbid: [bin/**, docs/cards/**, docs/mockups/**, docs/spikes/**, hooks/register.ts, hooks/lib/work.ts, hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, docs/upgrading.md, docs/guide.md]
red_test: tests/workpane.test.ts
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Issue #538, card A of the MOD-384 Work pane review (docs/spikes/MOD-384-findings.md, Q3 items 3, 4 and 9, Q4 changes C2, C3, C9, C12 and C13).
- A chip or the List/Board switch swaps a bare label for `[ label ]` when pressed, so the control moves under the pointer.
- The detail's status row has its lozenge, button and text touching, and the trail can run past the side box.
- `Reading the issues…` shows twice.
- `No work matches.` sits far from `Clear filters`.
- The footer's `close` is lower case where the detail's is `Close`.
- A selected row has only a background to mark it.

## Before you start

- `hooks/lib/workpane.tsx`, the whole file: `toolbar`, `summary`, `itemRow`, `empty`, `detailNode` and `footer`.
- The Button props in the engine types: `variant` (`'primary' | 'secondary'`) and `plain`. They are git-ignored, so read `.claude-plugin/types/claude-code/index.d.ts` in the main checkout (`git worktree list`, the first line); search `export type ButtonProps`.
- `tests/workpane.test.ts`: the tests that press `work-chip-*`, `work-view-*` and `work-close`, and the empty-state tests.

## Design (decided by the brain; build it, do not redesign it)

- **C2, steady controls.** The List and Board buttons and every state chip are never `plain`. On is `variant: 'primary'` and off is `variant: 'secondary'`. On the terminal both draw `[ label ]`, so the width does not change. Nothing else about them changes: keys, labels and handlers stay. `Show done`, `Clear filters`, the toggles and the leaf titles stay plain.
- **C3, the detail status row.** The `work-detail-status` Box gains `columnGap={1}` and `flexWrap="wrap"`. The trail is cut to `Math.max(4, width - 10)`, where `width` is the detail's own width (40 beside the table, `v.columns` in its place), in place of `v.columns - 20`.
- **C12, loading and empty.**
  - The toolbar shows `Reading the issues…` only when `v.model.total > 0`. With nothing loaded, the empty state alone says it.
  - When the empty state reads `No work matches.`, it draws `<Button key="work-clear-empty" plain label="Clear filters" onPress={hd.clear} />` after it in the same row, with `columnGap={2}`. The chip row's `Clear filters` stays.
- **C13.** The footer button's label is `Close`. The key `work-close` and `role="dismiss"` stay.
- **C9, the selected-row marker.** A selected leaf (the `selected` test in `itemRow`) draws `<Text color="#1d7afc">▌ </Text>` in place of the two spaces a leaf has where a parent has its toggle. The width is unchanged, and the background stays as it is.
- Mark each change `MOD-388 (#538)` once, at the top of the file's comment block.
- `CHANGELOG.md`, `## Unreleased` (make it above `## 0.9.63` when absent), `### Changed`: one bullet `(MOD-388, #538)`.

## Tests

- `tests/workpane.test.ts` (the red test), on the terminal at 130 columns unless said:
  - A chip off and on, and List and Board in both states, are drawn non-plain: secondary when off and primary when on.
  - With the detail open, the status row Box has `columnGap` 1 and wraps.
  - With `reading` true and nothing loaded, `Reading the issues…` is drawn once.
  - A filter that matches nothing draws `work-clear-empty`, and pressing it clears the filters.
  - The footer reads `Close`.
  - The selected leaf's row has `▌` and an unselected one does not.
- Update the existing tests that read the old plain chips or `close`.

## Left to you

- How each test reads the props, and test names.

## Done when

- The five changes are drawn as designed on every surface the existing tests mount.
- No other drawing changes.
- Gate validate, node and test are green.

## Review

Brain review (Opus 5.5): Built as designed, on haiku. The switch and the chips are secondary when off and primary when on, and never plain. The detail status row has a gap and wraps, and the trail is cut to the detail's own width. The loading line is gated on a loaded model. The empty filter result offers work-clear-empty, the footer reads Close, and a selected leaf draws the ▌ marker in the toggle slot, so the width is unchanged. The fall-through to the updated stamp while reading with nothing loaded is the reading the card gives.
