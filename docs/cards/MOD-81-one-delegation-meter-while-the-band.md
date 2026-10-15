---
id: MOD-81
title: One delegation meter: while the band is drawn, the host status line is cleared and the band carries the live labels and the context percent, with the same dollars
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/live.ts, hooks/lib/band.tsx, hooks/lib/watch.ts, hooks/lib/dashboard.ts, hooks/lib/cost.ts, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/templates/**, bin/**, hooks/lib/allow.ts, hooks/lib/gitguard.ts, hooks/lib/verify.ts, hooks/lib/verify-native.ts, hooks/lib/verdicttool.ts, hooks/lib/mergecmd.ts, hooks/lib/cleanstop.ts, hooks/lib/findings.ts, hooks/lib/debriefdir.ts]
red_test: a new engine test: with a briefed worker running and the band drawn once by the ui.render handler, the next refreshStatus must leave the host status line cleared (the last $.ui.status call is undefined); on main it sets `1 worker · $… · ctx …`; red first
gate: validate, node, test
budget: 2-attempts
spend: 8
---
## Why

Two meters show at once above the prompt: the band (`delegation · 2 live · 0 queued · $109.88 · <sparkline> [details]`, hooks/lib/band.tsx from bandSummary in hooks/lib/live.ts) and, under it, the host status line the mod sets in refreshStatus (`2 workers · $109.92 · ctx 11% · (2 live: OPS-165, OPS-160)`, statusText in hooks/lib/watch.ts). They repeat the worker count and the dollars, and the dollars disagree: the status line reads $.session.usage() on each refresh while the band reads the sampled spend series, which lags by up to a minute. The status line is the older display; the band came with the dashboard and never retired it.

## Done when

- ONE METER. While the band is drawn (dashboardBand on, the band has something to show, and the screen rendered it: the ui.render handler records when it last drew the band), refreshStatus clears the host status line ($.ui.status(undefined) and the STATUS state key set to '') instead of setting it. When the band is off, has nothing to show, or has not been drawn for longer than one status refresh interval (the screen cannot place it, or a survey hides it), the status line shows as it does today. A test pins each of the three cases.
- BAND CARRIES WHAT ONLY THE STATUS LINE HAD. The band's summary row names the live workers and the context percent: `delegation · 2 live: OPS-165, OPS-160 · 0 queued · $109.92 · ctx 11%` (labels as liveLabels gives them today, with their running cost when measured; `ctx –` while unknown), then the sparkline and [details] as now. A long label list is cut to fit the band's columns with `…` before the dollars are cut. The pane's header line (bandSummary's sibling in live.ts) gains the same ctx part.
- SAME DOLLARS. The band and the status line show the same session dollars: both read the newest $.session.usage() cost the mod has seen (refreshStatus and sampleSpend each record what they read into one shared latest value, with its time), not the older sample. The sparkline still draws from the sampled series. A test: after a usage read moves the cost from $1.00 to $1.40 without a new sample, the band's summary says $1.40.
- TESTS AND DOCS. Engine cases for the three status-line cases, the band summary text (live labels, ctx, cut to columns) and the shared dollars; existing tests that pin the old band summary or status line are updated to the new shape, none deleted. README's Dashboard section says the band replaces the status line while it is drawn. CHANGELOG.md has an entry under `## Unreleased` above the latest version heading (create the heading if there is none). The three gates pass.

## Review

Attempt 1 (sonnet, $0.60) accepted as handed back. Checked that the band stays fresh enough for the 60 s rule: sampleSpend redraws every 15 s while anything is live, queued or owed, so bandDrawnAt is renewed well inside one status refresh. If the host stops rendering the band (window hidden, survey), the status line comes back within a minute, which is the intended fallback. Noted cost: each band redraw now also looks up every live worker's running cost for the labels.
