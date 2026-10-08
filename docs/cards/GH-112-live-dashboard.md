---
id: GH-112
title: A live delegation dashboard inside Claude Code: a band above the prompt that reveals a card on hover, and a pane with spend over time, the worktrees with their models, and spend by model
domain: mod
tier: standard
status: merged
scope: [hooks/lib/dashboard.ts, hooks/lib/metrics.ts, hooks/lib/pane.tsx, hooks/lib/band.tsx, hooks/lib/live.ts, hooks/lib/repoconfig.ts, hooks/register.ts, hooks/types/**, .claude-plugin/plugin.json, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/types/**, .chassis-delegation.json, docs/**, hooks/lib/allow.ts, hooks/lib/verify-native.ts, hooks/lib/gitguard.ts, hooks/lib/card.ts, hooks/lib/setup.ts]
red_test: pure tests in a new tests/live.test.ts for the live model (spendSeries sampling and its 240-point cap, worktreeRows joining `git worktree list --porcelain` output with attempt records into task · model · state · tokens · cost rows, spendByModel folding anything not haiku/sonnet/opus into "other") and engine tests in tests/dashboard.test.ts that a ui.render of AbovePrompt draws the band only while a worker is live or queued, and that /delegation dashboard opens the pane and its tree holds the worktree table and the spend chart (red: no live model, no dashboard command)
gate: validate,node,test
budget: 2-attempts
spend: 15
---
## Why

Ben, 2026-10-08: "could I see how well the mod is performing with some type of hover over dashboard? like, a
real time graph of work trees mixed in with models and token use". The mod already has a band, a pane and
six cross-session metrics built as libraries in 0.1 (`hooks/lib/band.tsx`, `pane.tsx`, `dashboard.ts`,
`metrics.ts`), never wired; `/delegation` prints text.

## What the engine allows (read before building)

Read these first: the plugin-authoring reference and examples at
`/private/tmp/claude-501/bundled-skills/2.1.293/2f5ac1734f75ac876a83d9ea56bdfe02/plugin-authoring/`
(`reference.md`, `examples/band.tsx`, `examples/pane.tsx`, `examples/*-state.d.ts`), and the API in
`.claude-plugin/types/claude-code/index.d.ts` (grep `Pane: {`, `AbovePrompt`, `BoxHoverProps`, `Svg`, `Raster`,
`ui.open`, `atom`). Facts that shape the design:
- A band is a `ui.render` hook on `{ component: 'AbovePrompt' }`; a pane is `$.ui.open({ id, title })` drawn by a
  `ui.render` hook on `{ component: 'Pane', requestId: id }`. A pane opened by something the person did seats at
  any width; never open it unasked.
- `Box` has `hover` props with a `scope`: every element drawn with the same scope lights while any is hovered,
  and a Box drawn `display: "none"` with that scope is revealed (`display: "flex"`), positioned absolutely. That
  is the hover-over: hovering the band reveals the card.
- Charts: `Svg` on desktop, vscode and mobile; `Raster` on the terminal, which has no Svg (pane.tsx already
  does this split for sparklines).
- Live data a mod can read: `$.session.usage().cost.usd` (every priced response this session, workers
  included, so sampling it gives a live spend line); `$.agent.list()` (who is running); the store's attempt
  records (task, tier, alias, resolved model, verdict, and since GH-106 each worker's own `spend` with tokens);
  the queue in `$.state`; `git -C <root> worktree list --porcelain` (allowlisted).
- What it cannot read: a dispatched worker's per-step tokens (public issue #22: a worker the mod spawns itself
  skips the mod's own `turn.step`/`tool.call` hooks). Per-worker tokens and cost therefore update when the
  worker's run ends. Say so in the UI ("updates when a run ends") and in the README; do not fake liveness.

## What to build

**Live model (pure, new `hooks/lib/live.ts`):**
- `spendSeries`: samples of `{ t, usd }`, appended by register.ts every 15 s while a worker is live or queued,
  every 60 s otherwise, capped at the last 240 points; kept in `$.state` (declare it in `hooks/types/index.d.ts`)
  so a reload keeps it.
- `events`: spawn and verdict times this session from the attempt records, each with task, model family and
  verdict.
- `worktreeRows`: one row per task this session plus each worktree on disk that `worktree list` names under the
  mod's naming (`<root>-<ID>` or `worktreeRoot`): task · model family and resolved id · state (`live 04:12` /
  `queued #2` / the verdict) · worktree folder and branch · tokens in/out · cost · attempt n/b.
- `spendByModel`: dollars and tokens per model family this session (haiku, sonnet, opus; anything else folds
  into "other"), from the records' `spend`, plus the count of cards each verified.

**The band** (`band.tsx`, `AbovePrompt`): drawn only while a worker is live, queued or a verdict is owed; nothing
otherwise. One row: `delegation · 2 live · 1 queued · $4.12 · <sparkline of the last 30 min of spend>` and a
`[ details ]` button that opens the pane. The whole band is a hover scope (`chassis-delegation-dash`) that reveals
the card below.

**The card and the pane** draw the same blocks (the card the first three, compact; the pane all four):
1. **KPI row** of stat tiles: live workers, queued, spend this session (the hero), verified on first attempt
   this session (n of m).
2. **Spend over time**: one series, cumulative session dollars, as a line with a light area under it, drawn in
   text-primary ink (not a model color: it is the total). Event ticks on the time axis for spawns and verdicts;
   on Svg surfaces a crosshair tooltip at the pointer (time, $ so far, the nearest event). No second y-axis.
3. **Worktrees** as a table (the form for mixed per-entity facts): the `worktreeRows` columns. The model cell
   is a small chip in the model's color plus the model's name in text ink.
4. **Spend by model**: up to three horizontal bars plus "other", each direct-labeled `sonnet · $3.10 ·
   412k tok · 4 verified`.
Below them in the pane only, keep the existing six cross-session blocks from `dashboard.ts`/`metrics.ts`
(14-session sparklines) under a heading "Across sessions".

**Colors** (validated with the dataviz skill's validator, all-pairs, both modes; use exactly these):
- Model identity, fixed order, never by rank: haiku `#2a78d6` / dark `#3987e5`; sonnet `#eb6834` / dark `#d95926`;
  opus `#1baf7a` / dark `#199e70`; other: text-secondary gray. Light opus is below 3:1 on the light surface,
  so the model name is always printed beside its chip.
- Verdict status, never as a series color, always with an icon and a word: verified `#0ca30c` ✓, unverified and
  over-spend `#fab219` !, refuted and no-report `#d03b3b` ✗.
- Surfaces light `#fcfcfb`, dark `#1a1a19`; text ink from the surface's own text colors. Pick light or dark from
  what the render input reports for the surface (grep the types for theme or color scheme); dark when unknown.
- Thin marks: 2 px lines, tick marks 1 px, bars with 2 px gaps.

**Opening it:** `/delegation dashboard` opens the pane; the band's `[ details ]` opens it; nothing opens it
unasked. A `/config` boolean `dashboardBand` (default true; declare it in `.claude-plugin/plugin.json`) turns the
band off.

**Docs:** README: a "Dashboard" section (what each block shows, what is live and what updates at run end, how to
open it, the config key) and the commands table. CHANGELOG (GH-112).

Save red output to `.delegation/GH-112/red-1.txt`, name it `red=`. The gate map runs the three gates.
