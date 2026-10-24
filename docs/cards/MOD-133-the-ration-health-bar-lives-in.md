---
id: MOD-133
title: The ration health bar lives in the band above the prompt: the band draws the coloured seven-cell bar and its one line of text whenever the ration window has a reading, with no worker figures, and the footer label goes
domain: mod
tier: standard
status: merged
scope: [hooks/lib/band.tsx, hooks/lib/pane.tsx, hooks/register.ts, tests/**, docs/spend.md, docs/guide.md, CHANGELOG.md]
forbid: [bin/**, docs/cards/**, hooks/lib/verify-native.ts, hooks/lib/verify.ts, hooks/lib/dispatch.ts, hooks/lib/scheduler.ts, hooks/lib/ration.ts, hooks/templates/**, .claude-plugin/**, .chassis-delegation.json, README.md, docs/upgrading.md]
red_test: engine test in tests/ration.test.ts: on default options, after a session.measure with rateLimits [{kind: seven_day, percentUsed: 41, resetsAt}] and no worker live, a ui.render of AbovePrompt (hasSurvey false) returns a tree whose text holds `% left` and `today` and seven ration cells, and no `ctx`; at base it passes next(e) (the band is off by default and draws only while a worker is active). Red first
gate: validate, node, test
budget: 2-attempts
spend: 6
---
## Why

MOD-128 put the meter in the prompt footer's mode labels, but the person's client does not draw that footer row, so the meter never shows. The band above the prompt (the boxed strip marked "From the chassis-delegation plugin") does draw there, and that is where the person wants the health bar, alone: the live/queued/dollars/ctx line and the sparkline were found confusing and stay off. The pane already has the coloured bar (rationBar in hooks/lib/pane.tsx); the band reuses it.

## Done when

- The AbovePrompt handler in hooks/register.ts draws the band when `ration` is not off and the chosen window has a reading (rationModel), whether or not any worker is live, and yields to a survey as today (hasSurvey passes next(e)). With no reading and dashboardBand off it passes next(e) as today.
- The band's ration content is a tree in hooks/lib/band.tsx: one row holding the coloured seven cells drawn by the same rationBar the pane uses (exported from hooks/lib/pane.tsx, or moved to a small shared module both import, not copied), followed on the same row by `59% left · resets 2d 4h · today 6.2/8.4 · on pace` (the pane's text plus the today and pace clauses of rationText; `hour` windows draw the text bar from bar() in place of the cells, as the pane does). Then the existing `[ details ]` button that opens the dashboard pane. Nothing else: no `delegation · N live · … · $ · ctx` line and no sparkline.
- With `dashboardBand: true` the band draws the existing live line, sparkline and details exactly as today while a worker is active, with the ration row added above them when a reading exists; dashboardBand stays default false. With `ration: off` and dashboardBand false the band is never drawn.
- The footer label is removed: the ui.render handler on SessionMode goes, so the meter has one home. rationLabel stays for `/delegation`'s `ration:` line and `/delegation ration`.
- The band redraws when a measure changes the reading: the session.measure handler already calls redraw($); a test pins that a second measure the same day changes the band's text.
- Tests in tests/ration.test.ts (and tests/dashboard.test.ts where the band is read): on defaults with a seven_day 41% reading and no workers, an AbovePrompt render returns a tree holding seven cells with the expected colours, the text `…% left · resets … · today …/… · …`, a `details` button, and no `live` or `ctx` text; with no reading it passes next(e); with `ration: off` it passes next(e); with hasSurvey it passes next(e); with dashboardBand true and a live worker it holds both the ration row and the live line; a SessionMode render passes its modes unchanged. The MOD-128 footer tests are replaced by these. The tree renders on the terminal, desktop and vscode tables (the harness renders each surface the test names).
- docs/spend.md's `## Rationing the week` says the bar is drawn in the band above the prompt (not the footer) and that `/delegation config ration off` hides it; docs/guide.md's what-the-mod-draws rows say the same and that dashboardBand adds the worker line to the band; CHANGELOG Unreleased gets one entry. Wording generic: no product, repo, person, path or session names.

## Review

Attempt 1 (sonnet) accepted. The AbovePrompt handler now draws the band from rationPane whenever a reading exists (survey yields, no reading or ration off passes next), with bandTree only when dashboardBand is on and a worker is live, the ration row above its live line. rationBar is exported from pane.tsx and reused, not copied. The SessionMode footer label is gone. [ details ] sits on the bar's row. Gates at the worker: validate, node 1059/0, engine 1566/0; the band is tested on terminal, desktop and vscode tables.
