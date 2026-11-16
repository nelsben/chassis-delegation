---
id: MOD-390
title: "Work pane list: Progress and Card become one Card column so Worker shows from 96 columns, the header is capitals over a rule, only epics are bold, the dark grey mark is lighter, and below 28 columns Status is a dot"
domain: mod
tier: standard
status: merged
issue: 540
spike: MOD-384
scope: [hooks/lib/work.ts, hooks/lib/workpane.tsx, docs/guide.md, CHANGELOG.md, tests/node/worklayout.node.mjs, tests/workpane.test.ts, tests/*.test.ts, tests/node/*.node.mjs, tests/harness.ts]
forbid: [bin/**, docs/cards/**, docs/mockups/**, docs/spikes/**, hooks/register.ts, hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, docs/upgrading.md]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/worklayout.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Issue #540, card C of the MOD-384 Work pane review (docs/spikes/MOD-384-findings.md, Q3 items 6, 7, 10 and 11, Q4 changes C4, C7, C8, C14 and C15).
- A leaf leaves the 16-cell Progress cell blank, and a parent leaves the Card cell blank.
- Worker, the column a person watches, shows only from 116 columns and goes when the detail opens.
- The header is dim text with no rule.
- Epic and feature rows are equally bold.
- The spike and issue mark grey is faint on the dark background.
- Below 28 columns the Status cell is clipped.

## Before you start

- `hooks/lib/work.ts`: `WorkLayout`, `workLayout`, `TYPE_MARK` and `LOZENGE`.
- `hooks/lib/workpane.tsx`: `header`, `itemRow`, and every use of `mark.color` and `L.progress`. The board and the detail use `TYPE_MARK` too.
- `tests/node/worklayout.node.mjs`, which pins `workLayout`.
- `docs/guide.md`, `## Work`, the paragraph that starts `The pane has a toolbar`.

## Design (decided by the brain; build it, do not redesign it)

### C4, one Card column

- `WorkLayout` drops `progress`. `workLayout(columns)` returns:
  - **wide**, 116 and up: `work: columns - 58, status: 12, card: 16, worker: 22, cost: 8`.
  - **medium**, 72 to 115: `status: 12, card: 16, worker: columns >= 96 ? 22 : 0, cost: 0`, and `work: columns - 28 - worker`.
  - **narrow**, below 72: `status: columns < 28 ? 2 : 12, card: 0, worker: 0, cost: 0`, and `work: Math.max(16, columns - status)`.
- The Card cell (16 wide) holds, on a parent, the progress bar and `done/leaves` as the Progress cell does today, and on a leaf the card id. The header word is `Card`.
- With the detail beside the table, the layout is still `workLayout(v.columns - 42)`, so Worker shows from 138 columns.

### C7, the header

- The header labels are capitals (`WORK`, `STATUS`, `CARD`, `WORKER`, `COST`) and stay dim.
- Under the header row, one dim `Text` of `─` repeated to the row's full width (the sum of the layout's cells), key `work-header-rule`.

### C8, hierarchy

- A parent's title is bold only when it is an epic or the `No epic` group (`it.type === 'epic' || it.group`). A feature or story parent is not bold.

### C14, the dark grey

- New `export function markColor(type: WorkType, scheme: Scheme): string` in `work.ts`. It returns `#8c9bab` for `spike` and `issue` in `dark`, and `TYPE_MARK[type].color` otherwise.
- Every place in `workpane.tsx` that draws a type mark uses `markColor(type, v.scheme)` in place of `mark.color`: the list, the board card, the lane head and the detail.
- `TYPE_MARK` itself does not change.

### C15, very narrow

- With `status` 2, a leaf's Status cell draws `<Text color={LOZENGE[it.state][v.scheme].fg}>● </Text>` in place of the lozenge, and a parent's draws nothing.

### Docs and marks

- `docs/guide.md`, that paragraph: replace the sentence `The columns follow the width: Work and Status always, Progress and Card from 72 columns, Worker and Cost from 116.` with `The columns follow the width: Work and Status always; Card from 72 columns, a parent's progress bar or a leaf's card; Worker from 96; Cost from 116. Below 28 columns the status is a coloured dot.`
- Mark the changes `MOD-390 (#540)`.
- `CHANGELOG.md`, `## Unreleased` (make it above `## 0.9.63` when absent), `### Changed`: one bullet `(MOD-390, #540)`.

## Tests

- `tests/node/worklayout.node.mjs` (the red test):
  - `workLayout` at 20, 27, 28, 71, 72, 95, 96, 115, 116 and 130 gives the cells above, and no result has `progress`.
  - `markColor` for spike in dark and light, and for bug in dark.
- `tests/workpane.test.ts`:
  - At 100 columns a working leaf draws its Worker cell.
  - A parent's Card cell draws the bar and a leaf's draws its card id.
  - The header rule is drawn.
  - An epic title is bold and a feature title is not.
  - At 24 columns a leaf draws `●` in Status.
- Update the existing tests that read the old columns.

## Left to you

- Fixture data and test names.

## Done when

- The list draws the new columns, header, hierarchy, colour and narrow floor as designed. The board and the detail change only in their mark colour.
- The guide sentence reads as given.
- Gate validate, node and test are green.

## Review

Brain review (Opus 5.5): Built as designed, on haiku as an explore pick. WorkLayout drops progress and gives the wide, medium and narrow cells from the card, so Worker shows from 96 columns. The one Card column holds a parent's bar and count or a leaf's card id. The header is capitals over a dim full-width rule, only an epic or the No epic group is bold, markColor lightens the spike and issue grey in dark everywhere a mark is drawn, and at a two-cell status a leaf draws a coloured dot and a parent nothing. The guide sentence reads as given. The worker's choices are sound: the STATUS label is left blank at two cells rather than cut, and the board's lane titles keep their bold since the card names only the list rows.
