---
id: MOD-211
title: A malformed report line is matched to its task and named as malformed, not filed as an ad-hoc fabrication
domain: mod
tier: standard
status: merged
issue: 271
scope: [hooks/lib/brief.ts, hooks/lib/verify-native.ts, hooks/register.ts, tests/verifynative.test.ts, tests/verify.test.ts, tests/node/*.mjs, CHANGELOG.md]
forbid: [hooks/lib/allow.ts, hooks/lib/version.ts, .claude-plugin/plugin.json, docs/cards/**]
red_test: claude plugin test . (tests/verifynative.test.ts and tests/verify.test.ts malformed-report cases fail now)
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Issue #271: a worker ended with `[[report v=1 card=<ID> gate=pass … commits=…]]` (card= for task=, no sha, branch, files or red). verdict said no attempt was recorded, and the verifier made an adhoc-<hash> task refuted on sha '' as fabrication, which sat owed until cleared by hand. The work was correct; only the line was wrong.

## Done when

- parseReport (hooks/lib/brief.ts) reads the task from task=, else card=, else id=; when the report names no task but the hand-back's brief header (from the spawn prompt or the brief file) does, the attempt is recorded under that brief's task, not adhoc-<key>.
- A report with no sha= (or an empty one) is refuted as `malformed report: missing sha=…` naming every missing contract field (branch, sha, files, red, gate as applicable) and the exact report line shape to resend; the word fabrication is kept only for a sha that is present and does not exist (hooks/lib/verify-native.ts).
- That malformed refutation does not charge an attempt against the budget, so a resent well-formed report verifies on the same attempt; the verdict row's next= says to resend the report with the named fields.
- Tests: card= with a known brief id records under that task; no sha gives the malformed message naming the fields and no fabrication; a present but nonexistent sha still says fabrication; a resent good report after a malformed one is consistent on attempt 1.
- CHANGELOG.md gains a Fixed entry under the existing `## Unreleased` heading naming MOD-211 and #271. validate, the node tests and the engine suite pass.

## Review

Consistent on attempt 2 (sonnet, $0.48 + $0.69 for attempt 1, lost to a network drop before its report). parseReport reads task= else card= else id=; a report naming no task falls back to the spawn's brief; an empty sha= is refuted as `malformed report: missing …` with the exact line to resend and charges no attempt; fabrication only for a present sha that does not exist. Nit: the NO_BRIEF_REASON doc comment in verify-native.ts now sits above the new MALFORMED_REPORT block instead of its own const; no test for the brief-header fallback.
