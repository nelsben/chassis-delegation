---
id: MOD-210
title: Land nudge stays quiet on turns that drive an existing card
domain: mod
tier: standard
status: merged
issue: 302
scope: [hooks/register.ts, tests/landnudge-band.test.ts, tests/landnudge.test.ts, CHANGELOG.md]
forbid: [hooks/lib/allow.ts, hooks/lib/version.ts, .claude-plugin/plugin.json, docs/cards/**]
red_test: claude plugin test . (tests/landnudge-band.test.ts dispatch/verdict/merge cases fail now)
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Issue #302: the land nudge fires when a prompt describes work and the turn calls no land, land_plan or card. In card-driven sessions nearly every prompt is work on an existing card, so the band line shows almost every turn and becomes noise. Today only land, land_plan and card clear the pending nudge (landSeen in hooks/register.ts).

## Done when

- A dispatch, verdict or merge tool call in the turn also clears the pending prompt nudge (landPending and landLine), the same as land, land_plan and card do; the parent line keeps today's rule (cleared by dispatch, set by merge finish).
- Tests: a describes-work prompt followed by a dispatch call (and separately a verdict call, and a merge call) ends the turn with no land band line; a describes-work prompt with no such call still shows it; the merge-finish parent line still shows.
- CHANGELOG.md gains a Fixed entry under the existing `## Unreleased` heading naming MOD-210 and #302. validate, the node tests and the engine suite pass.

## Review

Consistent on attempt 1 (sonnet, $0.23). landSeen now also takes verdict and merge; dispatch, verdict and merge clear the pending prompt nudge, while verdict and merge leave the parent line alone. Three red cases (dispatch, verdict, merge) now pass; no new test pins the parent line, but its clearing rule is unchanged.
