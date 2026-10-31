---
id: MOD-226
title: "Dogfood: a worker that stops while its own background job runs is a pause, not a charged attempt (#270)"
domain: mod
tier: standard
status: merged
issue: 270
scope: [hooks/register.ts, hooks/lib/verify.ts, hooks/lib/attempts.ts, hooks/lib/waitstate.ts, hooks/lib/brief.ts, hooks/templates/brief.md, tests/verify.test.ts, tests/waitstate.test.ts, tests/node/*.mjs, CHANGELOG.md, docs/guide.md]
forbid: [hooks/lib/allow.ts, hooks/lib/version.ts, .claude-plugin/plugin.json, docs/cards/**]
red_test: claude plugin test . (a new tests/verify.test.ts case fails now: a hand-back with no report line but a pause line counts as attempt 1, so the later real report is attempt 2)
gate: validate, node, test
budget: 2-attempts
spend: 8
---
## Dogfooding feedback (from a consumer repo)

Reported by a lead session in a repo that uses the mod day to day. Issue #270 has the full story; MOD-99 fixed the repeated wakes from a waiting worker but not the attempt count.

## Why

A worker started a long background job of its own, then stopped with a status message while it ran. The lead called `verdict` on that stop, it was counted as an attempt with no report, and on a 2-attempt budget the card later showed `owed: stop — budget exhausted` although the first real report was clean. Today's workaround (the lead skips `verdict` on such stops and later runs `accept --owed`) relies on the lead telling the two kinds of stop apart by reading prose.

## Done when

- A pause line `[[pause v=1 task=<id> reason=<one line>]]` is part of the report contract: parsed next to report and amend lines, and named in hooks/templates/brief.md where the brief tells the worker how to hand back ("if you must stop while your own background job runs, print a pause line, not a report").
- `verdict` on a hand-back that holds a pause line and no report line records a pause: no attempt opened or charged, next=resume with the reason, and the wait state from MOD-99 (waiting on its own background job) is used for the row.
- A hand-back with neither a report nor a pause line is treated as today (charged), so a silent stop is still visible.
- Pauses are capped: a third pause in one attempt is charged as an attempt, with a row saying why, so a worker cannot pause forever.
- tests cover: pause then report = attempt 1; no-line stop = charged as today; three pauses = charged.
- docs/guide.md says when a worker uses a pause line. CHANGELOG.md gains an entry under `## Unreleased` naming MOD-226 and #270. validate, the node tests and the engine suite pass.

## Review

The founder's choice: a worker stopping while its own background job runs prints [[pause v=1 task=<id> reason=…]] instead of a report. A pause leaves the attempt pending (no charge, no owed row) and writes a kind:pause ledger row with next=resume. At most 2 pauses per attempt; the third is charged with a cap line, and a resume resets the count. A stop with neither line is charged as before. The engine cases are in tests/waitstate.test.ts (the brief said verify.test.ts; the world harness is there). The red holds only the last 60 lines of the run.
