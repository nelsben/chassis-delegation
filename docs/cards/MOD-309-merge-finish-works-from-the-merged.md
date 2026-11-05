---
id: MOD-309
title: merge finish works from the merged sha when the task's worktree is already gone
domain: mod
tier: standard
status: merged
issue: 415
scope: [hooks/register.ts, hooks/lib/mergecmd.ts, tests/merge.test.ts, tests/harness.ts, docs/review-and-merge.md, CHANGELOG.md]
forbid: [hooks/lib/allow.ts, hooks/lib/scheduler.ts, hooks/lib/verify-native.ts, hooks/lib/norepo.ts, hooks/templates/**, docs/cards/**]
red_test: claude plugin test <your worktree folder, absolute> (the engine suite; the red is the new worktree-gone finish case in tests/merge.test.ts failing on main)
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

After a PR was landed by hand with the branch deleted, `merge finish` answered `no worktree on agent/<domain>/<ID>; nothing to merge` and recorded nothing, so the card had to be committed by hand. Second half of issue #415. mergeFinish in hooks/register.ts returns noWorktreeLine before it looks at origin.

## Done when

- Red first: write the two --finish cases named below in tests/merge.test.ts before any source change and run `claude plugin test <your worktree folder, absolute>`; the worktree-gone case fails on main with `no worktree on …; nothing to merge`; save that run as the red evidence.
- In mergeFinish (hooks/register.ts), when mergeWorktree finds no worktree, finish does not stop: it fetches origin in the root and takes the candidate sha from K.mergePrep(id).head, else the last main attempt record's sha, else the newest consistent verdict row's sha for the task; with no candidate it returns the existing noWorktreeLine. It reads the candidate's tree and subject with `git -C <root> log -1 --format=%T%x09%s <sha>` (an allowed read shape; allow.ts is not changed) and checks whether the sha is an ancestor of origin/<default> or has a rebased twin there (the existing twinIn logic). A candidate equal to the attempt's recorded dispatch base (`baseSha` on the attempt record, when MOD-316 has landed; else skip this check) is not a landing, and the twin search skips a log line whose sha equals the candidate, so an unbuilt attempt is never taken as landed. With neither ancestor nor twin it returns `<ID>: no worktree on <branch> and <sha> is not in origin/<default> yet; nothing to merge`. The branch name is `agent/<domain>/<ID>` from the card, and the merge context's worktree value is the root.
- When the sha is landed, finish runs the same recording steps as the worktree path, skipping only the worktree steps (no leftovers check, no worktree remove; `git branch -D` runs only when the local branch exists): the root card is removed with the same guard; the attempt record is patched retired:'merged' with mergedSha; the kind:'merged' ledger row is appended; the owed row is cleared; K.merged is recorded; K.mergePrep is deleted; the issue-close steps (MOD-189/200) run reading the card from the root, and are skipped with a note when the root has no card; `version` comes from K.mergePrep only, none when absent; the remote cleanup line `git push origin --delete <branch>` is printed as the worktree path prints it.
- The output's first line reads `<ID>: on origin/<default> at <sha> (worktree already gone); card recorded` in this path.
- tests/merge.test.ts gains two cases in the --finish block: worktree gone and the sha an ancestor of origin/main records the merge and removes the root card; worktree gone and the sha not in origin returns the not-yet line and records nothing.
- docs/review-and-merge.md, the finish paragraph (line 73 today), gains one sentence saying finish also works after a by-hand landing with the worktree removed.
- CHANGELOG.md gains one bullet under `## Unreleased` / `### Fixed` naming MOD-309 and #415.
- The validate, node and test gates are green.

## Review

Diff read in full. mergeFinishGone takes the candidate from the merge prepare, the last main attempt or the newest consistent verdict row, reads the branch from the root card's domain, checks ancestry or a rebased twin with the MOD-316 base guard and the twin search skipping the candidate's own line, removes the root card under the same card-diff guard, pulls, drops the local branch only if present, and shares the recording tail with the worktree path through finishRecord, whose output for the worktree path is unchanged and the exact command-list test still holds. Nit carried: the gone path sets the merge context worktree to root/. so the allowlist's merge shape lets the root's clean, pull and branch -D through; a later allow.ts card could admit a finish with no worktree directly. Two engine cases. Verdict consistent at 21a31b0.
