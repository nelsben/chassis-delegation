---
id: MOD-295
title: A brief whose header names a report format other than chassis.report.v1 is not flagged malformed: the verdict row says the format was not checked instead of refuted on sha
domain: mod
tier: economy
tier_reason: One guard on an existing field check plus a pure test; the issue names the exact condition and the line
status: merged
issue: 397
scope: [hooks/register.ts, hooks/lib/verify-native.ts, hooks/lib/verify.ts, hooks/lib/brief.ts, tests/node/reportformat.node.mjs, tests/reportformat.test.ts, tests/harness.ts, CHANGELOG.md]
forbid: [hooks/lib/allow.ts, hooks/lib/ghguard.ts, hooks/lib/scheduler.ts, hooks/lib/configeff.ts, docs/cards/**]
red_test: node --test tests/node/reportformat.node.mjs (fails now: the file does not exist; passes when a foreign report= skips the malformed check)
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

A repo whose briefs declare their own report format (report=<repo>.report.v1, carrying task=, attempt=, gate=, files= and evidence= but no sha=, branch= or red=) had every hand-back flagged "malformed report (missing sha=, branch=, red=)" and the row read "refuted on sha", nine of nine, all later accepted (#397). The mod's field check only applies to its own format.

## Done when

- When the brief header's report= value is not chassis.report.v1, the native verify skips malformedReportDetail and the sha/branch/red field check; the verdict lines gain `report format <value>: fields not checked by the mod` and the row is not labelled refuted or malformed for that reason; the other claims (scope, files when files= is present, gate) run as today
- When report= is chassis.report.v1 or absent, nothing changes
- A pure helper in hooks/lib/verify-native.ts or hooks/lib/brief.ts decides it from the header and is tested in a new tests/node/reportformat.node.mjs: a foreign format yields the not-checked line and no malformed detail; the mod's format yields the malformed detail when sha= is missing
- An engine test in tests/ covers the wiring once; every engine test imports test from tests/harness.ts; the CHANGELOG gains one line under Unreleased / Fixed
- hooks/lib/allow.ts, hooks/lib/ghguard.ts and hooks/lib/scheduler.ts are untouched; the validate, node and test gates are green

## Review

Brain review: foreignReportFormat reads the header's report= and returns it only when it is set and not chassis.report.v1; verifyNative pushes one "report format <value>: fields not checked by the mod" line, marks a missing sha= and a missing red= as unchecked under that format instead of the malformed refute, and leaves scope, files and gate claims as before; a foreign-format report that does carry sha= is still verified on it. Mod-format and absent report= are byte-for-byte the old path. Nit, not blocking: the CHANGELOG line names branch= as unchecked but the code has no separate branch= claim to relax; the sha path is the one that covered it. First attempt, $0.03.
