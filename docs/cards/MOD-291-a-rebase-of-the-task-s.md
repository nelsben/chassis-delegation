---
id: MOD-291
title: A rebase of the task's branch by the brain never opens a work-present attempt: the verdict tool reports the last verdict at the new sha and says rebased
domain: mod
tier: standard
status: merged
issue: 390
scope: [hooks/register.ts, hooks/lib/attempts.ts, hooks/lib/rebase.ts, hooks/lib/verdicttool.ts, hooks/lib/verify.ts, hooks/lib/quiet.ts, tests/node/rebase.node.mjs, tests/rebase.test.ts, tests/harness.ts, CHANGELOG.md]
forbid: [hooks/lib/allow.ts, hooks/lib/ghguard.ts, hooks/lib/scheduler.ts, hooks/lib/configeff.ts, docs/cards/**]
red_test: node --test tests/node/rebase.node.mjs (fails now: the file does not exist; passes when the helper reports rebased for an identical tree and keeps the attempt count)
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

After a consistent verdict the brain rebases the task's branch onto main before merging (the merge tool does it too). The next verdict call reads the moved head as new work and reports "attempt N work-present", so a 3-attempt budget shows a phantom third attempt and the attempt count moves without a spawn (#390). A rebase is part of the merge pipeline, not an attempt.

## Done when

- When the task's branch head differs from the last judged attempt's sha and no spawn happened since, the mod compares the two trees (git diff-tree --quiet <last sha> <head>, or git rev-parse <sha>^{tree} on both); an identical tree is a rebase: the verdict tool (and the band row) report the last verdict with the new sha and the word `rebased` (e.g. `MOD-1 attempt 2/3 consistent · rebased to abc1234 · next=accept`), no work-present attempt is recorded and the attempt count does not move
- When the trees differ (real new commits), the verdict tool says `unverified work since <last sha>: <k> files (<first three paths>)` and names `dispatch verify=<head>`; no attempt is charged until a spawn or a verify runs
- The pure helper that decides rebased / new-work / unchanged from the two shas and the two tree ids lives in hooks/lib/attempts.ts (or a new hooks/lib/rebase.ts) and is tested in a new tests/node/rebase.node.mjs: same tree keeps the attempt count and yields the rebased line; a different tree yields the unverified-work line and no attempt; a head equal to the last sha is unchanged
- The existing work-present path (a respawn or auto-resume that finds finished work from a worker) is unchanged for a head whose tree differs
- An engine test in tests/ covers the wiring once: a consistent attempt, a rebased head, a verdict call that reports rebased and the same attempt count
- Every engine test imports test from tests/harness.ts; the CHANGELOG gains one line under Unreleased / Fixed; hooks/lib/allow.ts, hooks/lib/ghguard.ts and hooks/lib/scheduler.ts are untouched
- The validate, node and test gates are green

## Review

Brain review: pure headMove/rebasedText/unverifiedWorkLine in hooks/lib/rebase.ts; headMoveIn reads rev-parse of both trees and diff --name-only only when the trees differ; workInWorktree returns no work-present when the last consistent attempt's head moved onto the same tree; verdictNow appends `rebased to <sha7>` before next= or an unverified-work line with dispatch verify=. The band row is read from the ledger, which now gains no phantom attempt, so the band is right without touching band.tsx. CHANGELOG Unreleased/Fixed created. First attempt on the haiku explore, $0.14.
