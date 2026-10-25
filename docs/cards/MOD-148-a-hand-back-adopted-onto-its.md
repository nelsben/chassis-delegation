---
id: MOD-148
title: A hand-back adopted onto its task's brief (no brief at spawn, a report naming task=) records its pending attempt before the verifier runs, so the verdict tool called in the hand-back turn waits for the row instead of answering `no attempt recorded`
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/verdicttool.ts, tests/**, CHANGELOG.md]
forbid: [docs/cards/**, bin/**, hooks/templates/**, .chassis-delegation.json, .claude-plugin/**, README.md, docs/upgrading.md, hooks/lib/verify-native.ts, hooks/lib/allow.ts]
red_test: engine test: a briefless spawn hands back with a report naming task=T-9 (brief at <root>/.delegation/briefs/T-9.brief.md) while its gate is held by the test; the verdict tool called at once waits and returns the T-9 attempt 1 row once the gate is released; at base it answers `T-9: no attempt recorded for this task in this session's records; check the task id`. Red first
gate: validate, node, test
budget: 2-attempts
spend: 6
---
## Why

Follow-up on #222: on the manual route (a brief written outside dispatch, one Agent spawn per task), the verdict tool called in the hand-back turn answered `no attempt recorded for this task`, and the refuted row arrived minutes later on its own. finalizeOnce adopts such a spawn onto `<root>/.delegation/briefs/<task>.brief.md` (MOD-135) but writes its attempt record only after the verify, which runs the whole gate; until then the store, the process memory and the ledger hold nothing for the task. The lead took the answer as final, went on to merge, and ran its own gate beside the verifier's.

## Done when

- hooks/register.ts finalizeOnce: when briefForReport adopts a spawn, the adopted attempt is written to the task's attempt records with verdict pending (and the process memory the verdict tool reads, `remember`) before closedReason and the verify run; the record is patched with the verdict afterwards as today, so the ladder holds one record for that attempt, not two.
- The verdict tool (verdictNow / runVerdict) called while that verify runs answers by waiting, then returns the verdict row once it lands, within waitSeconds; it never answers `no attempt recorded` for a task whose hand-back is being verified in this process (a verify in flight in the `finalizing` map whose spawn names the task counts as an attempt).
- A task with no record anywhere and no verify in flight still answers `no attempt recorded` at once (the existing test stays green); a dispatched spawn's path is unchanged.
- Tests in tests/: (1) a spawn with no brief whose report names task=T-9, a brief at <root>/.delegation/briefs/T-9.brief.md, and a gate that takes a while (a test-controlled pause): the verdict tool called right after the hand-back waits and returns the T-9 attempt 1 row, not `no attempt recorded`; (2) after the verdict, the T-9 ladder holds exactly one attempt-1 record; (3) an unknown id still answers `no attempt recorded` at once. CHANGELOG.md Unreleased gets one Fixed entry. Wording generic: no product, repo, person, path or session names.

## Review

Consistent on attempt 1. finalizeOnce writes the adopted attempt as pending, switches the in-flight verifying entry to the adopted spawn and calls remember before closedReason and the verify; the verify patches that record, so the ladder keeps one attempt-1 record. verdictNow with no stored record waits when a verify in flight names the task, else falls to the ledger as before. Dispatched spawns are untouched. The worker did not capture the literal `no attempt recorded` text at base; the red file shows the tool answering at once instead of waiting, which is the same defect.
