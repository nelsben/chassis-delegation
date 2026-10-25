---
id: MOD-136
title: A task already merged is closed: a late hand-back for a retired task (or one whose branch and worktree are gone) is recorded as closed with no verify and no owed row, and /delegation status and the band drop owed rows for retired tasks
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/live.ts, tests/**, docs/review-and-merge.md, CHANGELOG.md]
forbid: [docs/cards/**, bin/**, hooks/templates/**, .chassis-delegation.json, .claude-plugin/**, README.md, docs/upgrading.md, hooks/lib/brief.ts, docs/contracts.md]
red_test: engine test: after a task's attempt 1 is accepted and retired as merged, a hand-back for the same task gets the row `…hand-back after the task closed (merged); not verified, nothing owed`, the gate is never run and the /delegation summary has no owed row for it; at base the hand-back is verified and an owed row is written. Red first
gate: validate, node, test
budget: 2-attempts
spend: 8
---
## Why

Issue #222, second half: after a task is merged, a late attempt hand-back is verified against the post-merge tree and produces a misleading refute, and its owed row lingers in status for a task that is done. A merged task should stay closed so the person is not asked to act on stale rows.

## Done when

- hooks/register.ts: at hand-back, before any verify, a spawn whose task's last attempt is retired (retireCheck reads retired, or the card reads status: merged), or whose recorded worktree folder no longer exists and whose branch agent/<domain>/<task> is absent both locally and on origin, is closed: no verifier run, no attempt counted against the budget, no owed row, and one row `<task>: hand-back after the task closed (merged|branch gone); not verified, nothing owed`.
- Owed rows for a task whose last attempt is retired are dropped: the retire sweep and the MOD-35 merge-command retire both clear the task's owed row, and the /delegation summary and the band's owed list skip a retired task even when its row was written before the retire (old records).
- A task that is not retired and still has its branch is verified exactly as today (no change on the normal path), and `/delegation accept --owed` keeps working.
- Engine tests in tests/: (1) a task retired as merged, then a hand-back for attempt 2, gets the closed row, no verify (the gate is never run) and no owed row; (2) a hand-back whose worktree folder is gone and whose branch is missing gets the `branch gone` row; (3) an owed row written before the task retired is absent from the /delegation summary afterwards; (4) the normal refute-then-resume path is unchanged.
- docs/review-and-merge.md says a merged task stays closed and what the closed row means; CHANGELOG Unreleased gets one Fixed entry. Wording generic: no product, repo, person, path or session names.

## Review

Attempt 1 consistent at 7181eaf (validate, node 1062, engine 1580). finalizeOnce closes a hand-back before verify when an earlier judged attempt is retired, the origin/main card reads merged (only once an earlier attempt exists), or the worktree folder is gone and the branch is in neither refs/heads nor refs/remotes/origin; the closed hand-back's pending attempt is dropped so it costs no budget. clearOwed removes the task's owed row from retireCheck, the merge-command retire and merge --finish. "branch gone" reads origin through the remote-tracking ref (no ls-remote on the allowlist), so it reflects the last fetch. live.ts unchanged. The row's "not verified" carries the legacy-word marker comment.
