---
id: MOD-53
title: The brain is told once a session, at a context the person can set, to start a fresh session at the next phase boundary
domain: mod
tier: standard
status: merged
scope: [hooks/lib/drive.ts, hooks/register.ts, .claude-plugin/plugin.json, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/types/**, .chassis-delegation.json, docs/**, hooks/templates/**, bin/**, hooks/lib/verify-native.ts, hooks/lib/allow.ts]
red_test: the new pure tests in tests/drive.test.ts fail on main because the function does not exist; red first
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Issue 108 finding 1: the first adopter's brain ran at a median 464K and a p90 859K tokens of context per turn, 1.88 billion cache-read tokens in all, while its workers spent $58. MOD-48 warns about polling loops above driveWarnTokens, but nothing tells the brain that the session itself has grown past the point where a fresh one, which reads the cards, ledger and lessons from disk, is cheaper.

## Done when

- a /config option freshSessionTokens (number, default 400000; 0 turns it off) is declared in .claude-plugin/plugin.json beside driveWarn and driveWarnTokens and read in hooks/register.ts as they are
- a pure function in hooks/lib/drive.ts decides and builds the row: at or above the threshold it returns `chassis-delegation: brain context 512K (freshSessionTokens 400K): start a fresh session at the next phase boundary; cards, the ledger and lessons carry over` with both figures rounded to K; below it, or with 0, nothing
- the check runs when the brain's own turn ends (turn.complete with no agentId), using brainContextTokens, and the row is appended at most once per session: a marker keyed by the session id in the store, so a hot reload does not repeat it
- README's Configuration section documents the option next to driveWarnTokens; a CHANGELOG entry under Unreleased
- tests: pure tests in tests/drive.test.ts (below, at, above, 0 is off); an engine test that two brain turns ending above the threshold append the row once; the three gates pass
