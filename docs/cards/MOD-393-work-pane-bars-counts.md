---
id: MOD-393
title: "Work pane: progress bars are two coloured boxes, a stacked board heading counts its folded cards, and a zero-count chip that is off is dim"
domain: mod
tier: standard
status: merged
issue: 548
spike: MOD-384
scope: [hooks/lib/workpane.tsx, hooks/lib/work.ts, CHANGELOG.md, tests/node/workboard.node.mjs, tests/workpane.test.ts, tests/*.test.ts, tests/node/*.node.mjs, tests/harness.ts]
forbid: [bin/**, docs/cards/**, docs/mockups/**, docs/spikes/**, hooks/register.ts, hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, docs/upgrading.md, docs/guide.md]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/workboard.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Issue #548. On the desktop, a progress bar built from `█` and `░` characters shows gaps between them and looks like a barcode. A stacked board column heading counts only the cards on screen, so it reads `DONE · 0` above `462 done · show`. A chip with a count of 0 is drawn at full strength.

## Before you start

- `hooks/lib/work.ts`: `boardCounts`, `BoardLane`, `progressCells` and `LOZENGE`.
- `hooks/lib/workpane.tsx`: the two places that draw `'█'.repeat(progressCells(…))` (a list parent's Card cell, and a board lane's head), the stacked heading `` `${BOARD_LABEL[c].toUpperCase()} · ${l.cols[c].length}` ``, and the chips in `summary`.
- `tests/node/workboard.node.mjs` and `tests/workpane.test.ts`.

## Design (decided by the brain; build it, do not redesign it)

- **Pure helpers in `work.ts`, marked `MOD-393 (#548)`:**
  - `export function laneCount(l: BoardLane, c: BoardCol): number` returns `l.cols[c].length + l.more[c] + (c === 'done' ? l.doneHidden : 0)`.
  - `boardCounts` sums `laneCount` over the lanes. Its results do not change.
  - `export const TRACK_BG: Record<Scheme, string> = { light: '#dcdfe4', dark: '#38414a' }`.
- **The stacked heading** reads `` `${BOARD_LABEL[c].toUpperCase()} · ${laneCount(l, c)}` ``.
- **One `bar(done, leaves)` helper in `workTree`, used in both bar places.** With `n = progressCells(done, leaves)`, it returns a row Box holding:
  - when `n > 0`: `<Box width={n} backgroundColor={doneFg(v.scheme)}><Text>{' '.repeat(n)}</Text></Box>`;
  - when `8 - n > 0`: the same shape with width `8 - n` and `TRACK_BG[v.scheme]`;
  - then today's `` <Text>{` ${done}/${leaves}`}</Text> ``.
  - No `█` or `░` is drawn anywhere. The width stays 8 cells plus the count.
- **A chip that is off and whose count is 0** gets `dimColor`. Everything else about the chips stays.
- Mark the change `MOD-393 (#548)` once, in the file's top comment block.
- `CHANGELOG.md`, `## Unreleased` (create it above `## 0.9.64` when absent), `### Changed`: one bullet `(MOD-393, #548)`.

## Tests

- `tests/node/workboard.node.mjs` (the red test):
  - `laneCount` for done with `doneHidden` and `more`, and for queued.
  - `boardCounts` still equals the sum of `laneCount`.
  - `TRACK_BG` holds both schemes.
- `tests/workpane.test.ts`:
  - A list parent's bar draws no `█` or `░`, and has a Box with `doneFg`'s background.
  - A stacked board with hidden done cards reads `DONE · <hidden>`.
  - A zero-count chip that is off is dim, and once pressed it is not.
- Update the existing tests that read `█` or `░`.

## Left to you

- Fixtures and test names.

## Done when

- The bars, the stacked headings and the chips are drawn as designed on every surface.
- Gate validate, node and test are green.

## Review

Brain review (Opus 5.5): Built as designed. laneCount is pure and boardCounts sums it, so the stacked heading counts the folded cards. One bar helper draws the two coloured fixed-width Boxes in both bar places, with no block characters, and TRACK_BG holds both schemes. A chip that is off with a count of 0 is dim. Nit: the bar Boxes carry the fixed keys work-bar-done and work-bar-track on every row so the tests can find them; the gates accept the repeats, but per-item keys would be cleaner, and a keyed Box is also a hover scope.
