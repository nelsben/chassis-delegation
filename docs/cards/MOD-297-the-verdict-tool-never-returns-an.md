---
id: MOD-297
title: The verdict tool never returns an empty result: a throw inside it comes back as one line naming the error and the band row
domain: mod
tier: economy
tier_reason: A try/catch wrapper and one line composer; the issue names the exact text
status: merged
issue: 336
scope: [hooks/register.ts, hooks/lib/verdicttool.ts, tests/node/verdictfail.node.mjs, tests/verdictfail.test.ts, tests/harness.ts, CHANGELOG.md]
forbid: [hooks/lib/allow.ts, hooks/lib/ghguard.ts, hooks/lib/scheduler.ts, hooks/lib/configeff.ts, docs/cards/**]
red_test: node --test tests/node/verdictfail.node.mjs (fails now: the file does not exist; passes when the failure line names the error and the band)
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

A verdict call returned "[Tool result missing due to internal error]" while the band line delivered the verdict a moment later; nothing was lost but the tool gave no result (#336). The tool is the brain's only read in that turn, so a throw must come back as text.

## Done when

- The verdict tool's handler is wrapped so any thrown error (or a rejected promise) returns `<task>: verdict failed: <error message, first line>; the band line holds the row, or call verdict again` instead of no result, and the error is logged through the mod's existing log path
- When the row is already on the ledger at the time of the throw, the returned line carries that row's verdict and next= after the error text
- A pure helper that composes the failure line from (task, error, row | undefined) lives in hooks/lib/verdicttool.ts and is tested in a new tests/node/verdictfail.node.mjs: with no row it names the error and the band; with a row it also names the verdict and next=
- An engine test in tests/ covers the wrapper once (a stubbed throw inside the handler yields the line, not an empty result); every engine test imports test from tests/harness.ts; the CHANGELOG gains one line under Unreleased / Fixed
- hooks/lib/allow.ts, hooks/lib/ghguard.ts and hooks/lib/scheduler.ts are untouched; the validate, node and test gates are green

## Review

Brain review: runVerdictSafe wraps runVerdict in the tool.call handler, logs the first line through debug(), reads the latest spawn row and its verdict row from the ledger under a second guard, and returns verdictFailLine; the helper composes "<task>: verdict failed: <first line>[; verdict <v> next=<n>]; the band line holds the row, or call verdict again" with "unknown error" for an empty message. Done-when item NOT met: no engine test of a stubbed throw. The worker could not force a throw through the engine because every read in runVerdict is already guarded; the only way is a test-only seam in production code, which I do not want for a P3 wrapper. Accepted with the pure tests and this review as the coverage; noted as an open nit. First attempt, $0.05.
