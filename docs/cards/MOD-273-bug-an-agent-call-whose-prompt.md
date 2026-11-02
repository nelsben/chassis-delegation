---
id: MOD-273
title: Bug: an Agent call whose prompt merely mentions a card's brief path is no longer claimed as that card's worker attempt; only a prompt that hands the brief is
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/brief.ts, hooks/lib/dispatch.ts, tests/**, CHANGELOG.md]
forbid: []
red_test: a new engine test: an Agent call whose prompt cites a dispatched card's brief path in parentheses leaves that card's attempts at 0; fails today because the spawn is recorded as attempt 1
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

planSpawn (hooks/register.ts) runs findBriefPath over the whole prompt, so a reviewer prompt that cites '.delegation/briefs/MOD-270.brief.md' to read it was recorded as MOD-270 attempt 1/2: its model was replaced by the card's tier (asked fable, ran sonnet), its effort set to the card's, an attempt was spent, and the verdict came back no-report with next=resume. Any brain that asks a helper to look at a brief can burn a card's attempt this way.

## Done when

- A spawn is claimed as a card's worker only when its prompt hands the brief: the spawnPrompt form ('Your brief is the file <path>.', the path bare or in backticks, as MOD-268 left it) or an inline [[brief ...]] header. A prompt that only mentions a brief path anywhere else runs ad hoc, with its own model and effort, and spends no attempt.
- Such an ad hoc spawn's started row says once: '<ID>'s brief is named but not handed; this agent runs ad hoc'.
- The fallback spawn, resume and replay paths that build their prompt with spawnPrompt are unchanged; MOD-268's brief path with a space still claims.
- Tests: a prompt 'Review the card (its brief: /x/.delegation/briefs/T-1.brief.md)' with model fable records an adhoc spawn on the requested model and leaves T-1's attempts at 0; the spawnPrompt form still records attempt 1; the inline header still records.
- CHANGELOG.md Unreleased has one entry.
