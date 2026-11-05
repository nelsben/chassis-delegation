---
id: MOD-301
title: A worker resumed after a by-hand verify is judged on its hand-back: the resume attempt is verified whichever spawn record the hand-back is matched by, and the verdict tool says `pending, no verifier running` instead of `still verifying` when nothing is verifying
domain: mod
tier: standard
tier_reason: A record-matching defect across handbackSpawn, resumedIfNew and the verdict wait; the sequence is known, the fix sits in
effort: high
effort_reason: Two spawn records for one agent and three lookup paths interact; the engine replay must drive the exact sequence
status: merged
scope: [hooks/register.ts, hooks/lib/verdicttool.ts, hooks/lib/attempts.ts, tests/resumeverify.test.ts, tests/node/verdictwait.node.mjs, tests/resume.test.ts, tests/verdicttool.test.ts, tests/harness.ts, CHANGELOG.md]
forbid: [hooks/lib/allow.ts, hooks/lib/ghguard.ts, hooks/lib/scheduler.ts, hooks/lib/configeff.ts, docs/cards/**]
red_test: node --test tests/node/verdictwait.node.mjs (fails now: the file does not exist; passes when newerSpawn picks the higher attempt and the no-verifier line and the waited-seconds line read as specified)
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

On MOD-299: spawn attempt 1 refuted, `dispatch verify=<sha>` attempt 2 refuted (it wrote a synthetic spawn record `verify-MOD-299-main-2` and pointed the agent at it), then a SendMessage resume recorded attempt 3 (kind resume, pending) on that synthetic record. The worker handed back with a new sha and nothing was verified: the hand-back is matched first by its tool_use_id to the original spawn record (attempt 1, judged), resumedIfNew saw the ladder's last record pending and returned the judged record, so attempt 3 stayed pending forever. The verdict tool then answered `still verifying after 600s; call verdict again` at once, three times, though no verifier was running; `dispatch verify=<sha>` by hand (attempt 4) was the way out.

## Done when

- After a resume, every lookup of the worker's spawn record returns the resumed one: handbackSpawn prefers, between the record the tool_use_id names and the record the agent pointer names, the one with the higher attempt (a pure helper `newerSpawn(a, b)` in hooks/lib/attempts.ts or hooks/lib/verdicttool.ts decides it), and recordResume writes the resume onto the record it was given AND keeps the agent pointer on that record; a hand-back then reaches finalizeOnce for the resume attempt and its verifier runs
- resumedIfNew never leaves a pending resume record unjudged: when the ladder's last record is a pending resume for this agent, the hand-back is judged as that attempt (no new record), whatever record the hand-back was matched by
- The verdict tool, for an attempt that is pending with no verifier running (no verify lock held for the label, no gate progress, and the agent not running per $.agent.list), answers `<label>: attempt <n> pending, no verifier running; dispatch verify=<sha>` (sha = the worktree head, or `none` with no worktree) instead of waiting or saying still verifying; a pure helper in hooks/lib/verdicttool.ts composes the line
- The still-verifying line names the seconds actually waited, not the requested wait: `<label>: still verifying after <waited>s; call verdict again`, and when the sleep process could not run it ends `(wait unavailable: sleep did not run)`; stillVerifying in hooks/lib/verdicttool.ts takes the waited seconds and an optional reason
- tests/resumeverify.test.ts (engine, importing test from tests/harness.ts) replays the exact sequence: spawn, hand-back refuted, `/dispatch <id> --verify <sha>` refuted, SendMessage resume, hand-back at a new sha with a report: the ledger gains a verdict row for the resume attempt and the verdict tool returns it; a second case: a pending resume attempt with no verifier running gets the `no verifier running` line; tests/node/verdictwait.node.mjs covers the two pure helpers; existing cases in tests/resume.test.ts and tests/verdicttool.test.ts keep passing (extend them only if a pinned string changed by this card)
- CHANGELOG.md gains one line under Unreleased / Fixed; hooks/lib/allow.ts, hooks/lib/ghguard.ts, hooks/lib/scheduler.ts and hooks/lib/configeff.ts are untouched; the validate, node and test gates are green

## Review

Diff read at 488755c. attempts.ts newerSpawn picks the higher attempt of two spawn records; handbackSpawn reads the agent-pointer record beside a briefed tool_use_id record and keeps the newer; recordResume moves the agent pointer onto the record the resume landed on; pendingResumeOf (called first in resumedIfNew) judges a hand-back as the ladder's pending resume attempt whichever record matched it, dropping the earlier verdict fields. The verdict tool checks pendingWithoutVerifier (no in-process verify lock, no gate progress, agent not running) twice a second apart before answering "attempt n pending, no verifier running; dispatch verify=<sha>"; the still-verifying line now names the seconds actually waited and marks a sleep that could not run. New node tests and a five-case engine replay of spawn, refute, by-hand verify refute, SendMessage resume, hand-back; three verdicttool cases pass listAgents true so their never-returning workers read as running. First attempt, $1.48. Note: pendingWithoutVerifier runs git rev-parse and agent.list on each idle poll; cheap, but worth watching if verdict polls grow.
