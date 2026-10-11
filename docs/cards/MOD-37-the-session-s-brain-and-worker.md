---
id: MOD-37
title: The session's brain and worker figures count only this session's own attempts, ad-hoc Agent spawns get their own row, and an unattributed remainder closes the sum to the session total
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/live.ts, hooks/lib/brain.ts, hooks/lib/attempts.ts, hooks/lib/dashboard.ts, hooks/lib/pane.tsx, hooks/types/**, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/templates/**, hooks/lib/allow.ts, hooks/lib/verify-native.ts, hooks/lib/gitguard.ts, hooks/lib/version.ts, hooks/lib/legacy.ts, hooks/lib/redact.ts, hooks/lib/cleanstop.ts, hooks/lib/debriefcheck.ts, bin/**]
red_test: pure tests in tests/live.test.ts: sessionRecords over records from sessions s1 and s2 keeps only s1's for session s1; a legacy record (no sessionId) under another root is dropped and one under this root after the start is kept; the brain line for brain $2, workers $3, ad hoc $1 and a session total of $8 reads unattributed $2.00 and brain share 25%; engine test in tests/hooks.test.ts: with one attempt from another session and one ad hoc spawn with a cost record in this one, /delegation shows 0 attempts for workers and the ad hoc figure; red first
gate: validate, node, test
budget: 2-attempts
spend: 8
---
## Why

Public issue #91: in a session that briefed nothing, /delegation printed `workers $150.89 (87 attempts) · brain share 49%`; every one of those attempts came from three other repos running concurrent sessions, because sessionRecords in hooks/lib/live.ts keeps every attempt record with at >= since across every repo and session that shares the store (attempt records carry no session id; GH-112 noted the same gap). The session's own 15 ad-hoc Agent spawns ($111, already in delegation.cost.<agentId>) appeared nowhere, and about half the session's spend fell in neither column, hidden inside the share. On any day with more than one session the money figures are wrong, and the founder reads them to decide whether the brain is doing worker work.

## Done when

- every attempt record written from now on carries sessionId, the id of the session whose brain made the spawn (the agent.spawn hook knows it); the live view, the dashboard, the brain line and the worker counts keep a record only when its sessionId equals this session's; a record without sessionId (written before this card) is kept only when its root equals this session's root and its at is at or after the session's start, so an old store does not leak other repos' attempts
- an Agent spawn this session's brain makes with no brief header (ad hoc) is counted from its delegation.cost.<agentId> record in a separate figure: the brain line reads `brain: <family> $x over n turns · workers $y (n attempts) · ad hoc $z (n agents) · unattributed $u · brain share p%`, where unattributed is the session total from $.session.usage() minus brain, workers and ad hoc (never negative; omitted when under one cent), and the share is brain over the session total
- the dashboard's spend-by-model and worktree tables apply the same session filter; the text fallback matches
- pure tests for the filter (own session kept, other session dropped, legacy record kept only by root and time) and for the line arithmetic; an engine test with records from two sessions and two roots shows only this session's attempt on /delegation and an ad hoc spawn counted as ad hoc; README (the brain's spend) and CHANGELOG
