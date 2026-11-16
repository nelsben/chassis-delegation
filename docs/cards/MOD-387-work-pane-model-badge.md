---
id: MOD-387
title: the Work pane draws the model badge beside the worker in the list, the board card and the detail, in place of the plain tier dot, and the modelGlyphs row says where the badge shows
domain: mod
tier: standard
status: merged
issue: 537
spike: MOD-383
scope: [hooks/lib/workpane.tsx, hooks/register.ts, docs/configuration.md, CHANGELOG.md, tests/workpane.test.ts, tests/*.test.ts, tests/node/*.node.mjs, tests/harness.ts]
forbid: [bin/**, docs/cards/**, docs/mockups/**, docs/spikes/**, hooks/lib/glyph.ts, hooks/lib/work.ts, hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, docs/upgrading.md]
red_test: tests/workpane.test.ts
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Issue #537, from the MOD-383 spike (docs/spikes/MOD-383-findings.md). The mod writes the model badge (🟢 haiku, 🔵 sonnet, 🟣 opus) into the Agent description. The editor's running-agent row shows the agent's live activity instead, and no engine API changes that row. The Work pane draws on every surface and already has a Worker cell, but it shows a plain tier-coloured dot, not the badge. Putting the badge there gives every surface one place that shows which model runs each card. We are not bringing back the host status line, which MOD-128 retired.

## Before you start

- `hooks/lib/workpane.tsx`: `WorkView`, `workerCell`, the board `card` (the line that draws `TIER_COLOR[it.tier]` under the title), and the detail's `field('Worker', …)`.
- `hooks/lib/glyph.ts`: `modelGlyph(alias, map)` and `GlyphMap`. Read them only; do not change them.
- `hooks/register.ts`: `glyphOf` and `cfg.glyphs` (search `MOD-78: the glyph`), and the `ui.render` hook that calls `workTree(p, { model: d.model, …` (search `workTree(p,`).
- `tests/workpane.test.ts`: how the pane is mounted (`mountWork`) and how a working leaf is set up.
- `docs/configuration.md`, the `modelGlyphs` row.

## Design (decided by the brain; build it, do not redesign it)

- `WorkView` gains `glyphs?: GlyphMap | 'off'`. register.ts passes `glyphs: cfg.glyphs` in the `workTree` call. Nothing else in register.ts changes.
- In `workTree`, one helper: `const badge = (it: WorkItem): string => (it.model === undefined || it.model === '–' || v.glyphs === undefined || v.glyphs === 'off' ? '' : modelGlyph(it.model, v.glyphs))`. Mark it `MOD-387 (#537)`.
- In the three places that draw the dot before the model (the list's `workerCell`, the board card's worker line, the detail's Worker field): when `badge(it)` is not empty, draw `<Text>{badge(it)} </Text>` where the dot was. Otherwise draw today's dot, tier-coloured or dim, unchanged. The model text after it stays as it is.
- With `modelGlyphs` set to `off`, or with no `glyphs` in the view, the pane draws exactly what it draws today.
- `docs/configuration.md`, the `modelGlyphs` row: after `` `alias=glyph` pairs, or `off`. `` add: `The badge leads the Agent description (the task's label and its completion notice) and the Worker cell of the Work pane. An editor's running-agent row shows the agent's live activity, not its description, so the badge does not show there; open /delegation work to see it.`
- `CHANGELOG.md`, `## Unreleased` (make it above `## 0.9.63` when absent), `### Changed`: one bullet `(MOD-387, #537)`.

## Tests

- `tests/workpane.test.ts` (the red test), with a working leaf whose model is `sonnet`:
  - At 130 columns on the terminal, the list's Worker cell draws `🔵 ` before `sonnet`.
  - On the board at 130 columns, the card's worker line draws `🔵 `.
  - With the detail open, the Worker field draws `🔵 `.
  - With `modelGlyphs` `off`, the list draws `● ` as today.
  - Run the first case on `vscode` too.

## Left to you

- How the tests set `modelGlyphs` off (the repo or user config fixture the harness already uses), and test names.

## Done when

- A working or to-review leaf's worker shows its model badge in the list, on the board and in the detail, on every surface the pane draws on.
- `modelGlyphs off` restores the dot.
- The config row says where the badge shows and where it does not.
- Gate validate, node and test are green.

## Review

Brain review (Opus 5.5): Built as designed, on haiku as an explore pick. WorkView gains glyphs, register passes cfg.glyphs, and one badge helper serves the list cell, the board card and the detail field. With no map, with off, or with the on-disk dash model, each falls back to today's dot. The config row reads as given. The off test asserts that the badge is absent rather than the dot's colour, because the fixture's bug mark also draws a dot: a sound choice. Nit: the board and detail call badge(it) twice per draw; it is harmless.
