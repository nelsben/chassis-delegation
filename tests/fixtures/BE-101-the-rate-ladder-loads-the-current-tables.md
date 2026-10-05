---
id: BE-101
title: The rate ladder loads the current tables — `RateCatalog` maps the standard tier to `table-2026-b` and the premium tier to `table-2026-c` (basic stays `table-2025-a`), and `RateProviderHttp` sends each one the request shape it accepts; an id swap alone is NOT safe, because the provider sends nothing for an id it does not know, both 2026 tables round by default, and rounding digits spend `max_digits` (the BE-77c truncation comes back)
domain: backend
tier: frontier
status: queued
owner: backend
priority: P3
blocked_by: []
gate: G2, G8p
red_test: "RateProviderHttpTest: `roundingParam('table-2026-b', off)` returns `{mode: banker}` with no other key; the request body for `table-2026-c` under `off` carries NO `rounding` key and carries `output.precision = low`; no body for either 2026 id ever carries `mode: disabled` or `scale_digits`; RateCatalogTest: the standard and premium `legacy__` names resolve to the 2026 ids → all fail on main"
scope: app/billing/RateCatalog.ts, RateProviderHttp.ts, RateProviderOptions.ts, their tests plus RateServiceTransportTest and RateProviderRetryTest where they pin a table id, docs/architecture/rate-provider-ladder.md, CONTRIBUTING.md's two rounding lines, one decision record
forbid: app/ui/**; any copy text (the copy-change gate must stay quiet); .github/**; vendor/**; agents/tasks/**; the decisions index; any `legacy.` reference
budget: frontier-60m
destination: both — the summary a manager reads and the invoice the app drafts come from the current table at the measured price
---

## Why

A sample card, written to exercise the parser: a long title with backticks and a dash, a quoted red test, a prose scope, a forbid list split on semicolons, two gate ids and a budget in the older `<tier>-<minutes>m` form. The story it tells is invented. The 2026 rate tables are out, the catalog still pins the 2025 ones, and the premium table is cheaper per lookup than the one it replaces.

## What changes on the wire

- `table-2026-b`: `rounding: {mode: "disabled"}` is rejected. The off posture sends `rounding: {mode: "banker"}` with NO other field.
- `table-2026-c`: rounding cannot be turned off and `scale_digits` is rejected. The off posture OMITS `rounding` and sends `output: {precision: "low"}`.
- Both: the unknown-id rule (send nothing) stays, and the old ids stay recognised by the provider.

## Done

Red first. ONE full G2 run. A short proof table in the decision record: per call the input size, the wall time against the budget, and whether the response parsed whole. No table becomes a default on a truncated or slower-than-budget result. Docs updated in the same commit. G8p green; push HELD.
