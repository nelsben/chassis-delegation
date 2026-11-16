---
id: MOD-397
title: "Work pane: on remote surfaces each item type is drawn as a 14 px coloured Svg icon in the list row, the board card, the lane head and the detail; the terminal keeps its glyphs"
domain: mod
tier: standard
status: merged
issue: 554
spike: MOD-384
scope: [hooks/lib/workpane.tsx, hooks/lib/work.ts, CHANGELOG.md, tests/node/worktype.node.mjs, tests/workpane.test.ts, tests/*.test.ts, tests/node/*.node.mjs, tests/harness.ts]
forbid: [bin/**, docs/cards/**, docs/mockups/**, docs/spikes/**, hooks/register.ts, hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, docs/upgrading.md, docs/guide.md]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/worktype.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Issue #554. The type marks are text glyphs (◆ ▲ ■ ✓ ● ? ○), and the desktop's proportional font draws them at uneven sizes. Every remote surface draws `Svg`. The original design (docs/mockups/work-panel.html, `GLYPH` and `icon()`) drew each type as a rounded square in the type colour, with a white glyph. This is MOD-384's card C17. How the icon sits in a row is checked by eye on the desktop after release.

## Before you start

- `hooks/lib/work.ts`: `TYPE_MARK`, `markColor` and `WorkType`.
- `hooks/lib/workpane.tsx`: the four places that draw `<Text color={markColor(…)}>{mark.glyph} </Text>`: the list row, the board card, the lane head and the detail. Also the `remote` flag.
- `SvgProps` in the engine types. They are git-ignored, so read `.claude-plugin/types/claude-code/index.d.ts` in the main checkout (`git worktree list`, the first line) and search `export type SvgProps`. `source` and `alt` are required, and `width` and `height` are in CSS pixels.
- `tests/node/workboard.node.mjs`, for the node test shape.

## Design (decided by the brain; build it, do not redesign it)

- **In `work.ts`, marked `MOD-397 (#554)`:**
  - `export const TYPE_GLYPH_SVG: Record<WorkType, string>`. It holds these inner SVG fragments, where `G` is `fill="#ffffff"` and `S` is `fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"`:
    - epic: `<path G d="M9 2.5 4.5 9H8l-1 4.5L11.5 7H8z"/>`
    - feature: `<path S d="M5 3v10"/><path G d="M5.5 3.5h6l-1.6 2.2 1.6 2.2h-6z"/>`
    - story: `<path G d="M5 3h6v10l-3-2.4L5 13z"/>`
    - task: `<path S d="M4.5 8.5 7 11l4.5-5.5"/>`
    - bug: `<circle G cx="8" cy="8" r="3"/>`
    - spike: `<path S d="M6.2 6.4a1.9 1.9 0 1 1 2.8 1.7c-.7.4-1 .8-1 1.4"/><circle G cx="8" cy="11.7" r=".9"/>`
    - issue: `<circle S cx="8" cy="8" r="3"/>`
  - `export function typeIcon(type: WorkType, scheme: Scheme): string` returns `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><rect width="16" height="16" rx="3" fill="${markColor(type, scheme)}"/>${TYPE_GLYPH_SVG[type]}</svg>`.
- **In `workpane.tsx`, one helper in `workTree`:** `const markNode = (type: WorkType): RenderNode`.
  - On the terminal it returns today's `<Text color={markColor(type, v.scheme)}>{TYPE_MARK[type].glyph} </Text>`.
  - On a remote surface it returns `<Box flexDirection="row"><Svg source={typeIcon(type, v.scheme)} alt={type} width={14} height={14} /><Text> </Text></Box>`. `Svg` comes from `p.t` beside the other elements.
- Use `markNode` in all four places. Where a place draws `'  '` because there is no mark, it is unchanged.
- Mark the change `MOD-397 (#554)` once, in the file's top comment block.
- `CHANGELOG.md`, `## Unreleased` (create it above `## 0.9.65` when absent), `### Changed`: one bullet `(MOD-397, #554)`.

## Tests

- `tests/node/worktype.node.mjs` (the red test):
  - `typeIcon` for each of the seven types starts `<svg`, ends `</svg>` and holds `markColor(type, scheme)`.
  - Spike in dark holds `#8c9bab`.
  - Every `TYPE_GLYPH_SVG` value is non-empty and holds no `class=`.
- `tests/workpane.test.ts`:
  - On desktop, a list leaf's row holds an Svg whose `alt` is its type, at width 14, and no Text of its glyph.
  - On desktop, a board card's mark is an Svg.
  - On the terminal, the row still draws the glyph Text.
- Update any existing remote-surface test that reads a glyph Text.

## Left to you

- Fixtures, test names, and how the tests find the Svg.

## Done when

- On remote surfaces, the four places draw the Svg icon. The terminal is unchanged.
- Gate validate, node and test are green.

## Review

Brain review (Opus 5.5): Built as designed, on haiku as an explore pick. TYPE_GLYPH_SVG holds the seven fragments with the white fill and stroke written inline and no classes, and typeIcon wraps them in a 16-unit rounded square in markColor. One markNode helper draws the 14 px Svg with a trailing space on remote surfaces and today's glyph Text on the terminal, in all four places. The tests sensibly narrow the glyph check to the story colour, since the state chips draw their own ■. How the icon sits in a desktop row is unverified; Ben's look settles it.
