---
id: MOD-384
title: "Spike: a UX review of the Work pane against its mockup: the design decisions and whether they held, where the pane falls short of the mockup and why, and a ranked list of changes"
domain: mod
tier: frontier
tier_reason: Design judgment across the pane code, the mockup and five cards; its findings set the next build cards
status: merged
issue: 528
purpose: spike
findings: docs/spikes/MOD-384-findings.md
verdicts: [keep, revise, drop]
scope: [docs/spikes/MOD-384-findings.md]
forbid: [hooks/**, bin/**, tests/**, docs/cards/**, docs/mockups/**, .claude-plugin/**, README.md, CHANGELOG.md, docs/guide.md]
red_test: none
gate: findings
budget: 2-attempts
spend: 25
---
## Why

Issue #528. The Work pane shipped in 0.9.57 to 0.9.59: a list view, a board and a detail panel, opened by `/delegation work`. It was built from a mockup page, docs/mockups/work-panel.html (MOD-332, 333 and 347), through five build cards. The cards made many design decisions, some forced by what the engine's UI elements can draw. Ben wants the pane to look nicer, and wants the decisions looked at again before anyone changes code. This card is research only, so it does not compete with the cards in flight.

## Before you start

- The mockup: docs/mockups/work-panel.html. Read it whole. It is one HTML page with a tree table, a board and a drill-down detail panel.
- The pane as built: hooks/lib/workpane.tsx (the drawing) and hooks/lib/work.ts (rows, layout, colours, board columns, actions).
- The cards that built it, their Design sections and their `## Review` sections: docs/cards/MOD-353 (data), MOD-354 (list view), MOD-356 (detail and actions), MOD-357 (board), MOD-361 (statusMap and status words). Also the mockup cards MOD-332, MOD-333 and MOD-347.
- docs/guide.md, the `## Work` section: what a person is told the pane does.
- What the engine can draw: the element props in the engine's API types. They are git-ignored, so read `.claude-plugin/types/claude-code/index.d.ts` in the main checkout this worktree was cut from (`git worktree list`, the first line). Search `Box`, `Text`, `Button`, `Table`, `color`, `width`, `surface`. Cite it as `.claude-plugin/types/claude-code/index.d.ts:<line>`.
- You cannot see the pane drawn. Judge from the code, the layout helpers' column widths (72, 100, 116 and the others named in work.ts) and the mockup. Anything you say about how it looks on screen without a source line is `⚠ Unverified:`.

## Questions

1. List the design decisions the five build cards made for the pane: layout and widths, columns, states and their words and colours, the board's columns and lanes, folding done work, the detail panel, the actions, the toolbar and filters. For each, cite the card and the code line that carries it, and say whether it held up. (verdict)
2. Where does the pane as built differ from the mockup? For each difference, say whether the engine's UI elements forced it (cite the types line) or it was a choice we made (cite the card or code line).
3. Which parts look or read worst in the pane today: crowding, alignment, colour, hierarchy, empty states, long titles, narrow widths? Rank them by how much a person working in the pane would notice.
4. A ranked list of changes, each one line, with the files it would touch, whether the engine can draw it today, and a size (small, medium or large). Group them into build cards of a sensible size.
5. Should the mockup page be updated to match the pane as it can really be drawn before any build card, so later cards design against what is possible? (verdict)

The (verdict) words are keep, revise or drop. For Q1, give one per decision; for Q5, keep means leave the mockup as it is, and revise means update it first.

## Rules for this spike

- Read and cite only. Change no file except the findings file. Make no network call except web search and web fetch, and use those only for UI or design references, cited by URL.
- `## Decisions this implies` names each build card to cut, one line each, in the order to run them. It marks any decision that is Ben's to make (a look he may prefer, a trade-off) as `Ben:`, with your recommendation.

## Done when

- docs/spikes/MOD-384-findings.md answers the five questions as the findings gate checks them.
- No other file changes.

## Review

Brain review (Opus 5.5): A thorough review with 258 citations and honest flags, since nobody saw the drawn pane. The citations I checked hold: the board column width (work.ts), stack mode with the detail open, the desktop native-button note in the types, the List/Board primary-versus-plain swap, and Ben's rejection of the grid mockups (MOD-347:16). Q5 keep is right: the forced differences come down to five engine limits, and the build cards can cite Q2. The cards A to G are a sensible split and run serially, because all touch workpane.tsx. Attempt 1 was refuted only for a ⚠ mentioned in prose on line 3; the reviewer confirmed the fix touched that one line. Four calls are Ben's: where the notes go, the on/off look of the chips, an Action column at wide widths, and one look at the pane on desktop before card A.
