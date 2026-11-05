---
id: MOD-312
title: merge resolves a rebase conflict where both sides only add lines to the same file by keeping both, and says so
domain: mod
tier: standard
effort: high
effort_reason: Git rebase state handling and conflict parsing; a wrong resolution corrupts a file silently
status: merged
issue: 426
scope: [hooks/lib/mergecmd.ts, hooks/lib/allow.ts, hooks/register.ts, tests/node/unionresolve.node.mjs, tests/merge.test.ts, tests/allow.test.ts, tests/harness.ts, docs/review-and-merge.md, CHANGELOG.md]
forbid: [hooks/lib/scheduler.ts, hooks/lib/verify-native.ts, hooks/templates/**, docs/cards/**]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/unionresolve.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Two cards in one wave each appended a bullet to the same Markdown file; the second merge stopped at `rebase onto origin/main conflicts in CHANGELOG.md; resolve by hand` although neither side removed or changed a line. The adopter wants the pick to go through on its own when the only conflicts are append-only. Today mergePrepare in hooks/register.ts aborts the rebase on any conflict.

## Done when

- mergePrepare (hooks/register.ts) runs `git rebase <baseRef>` and, when it continues a rebase, `git rebase --continue` with the run call's env set to `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=merge.conflictStyle GIT_CONFIG_VALUE_0=diff3` plus `GIT_EDITOR=true`; env is passed as run's init.env, never as a `-c` argument (the allowlist refuses global git options).
- hooks/lib/mergecmd.ts exports a pure `unionResolve(text: string): { text: string } | { why: string }` over a conflicted file in diff3 (or zdiff3) style: a block is `<<<<<<< ours` … `||||||| base` … `=======` … `>>>>>>> theirs`; a block resolves only when its base section is empty and both the ours and theirs sections are non-empty, and is replaced by the ours lines (the base's, since in a rebase ours is the upstream) followed by the theirs lines (the branch's); a block whose base section is not empty returns `why: a line changed on both sides`; a block with no base section returns `why: no base section (conflictStyle is not diff3)`; a block with an empty side returns `why: one side is empty`; a non-blank line present in both the ours and theirs sections of one block returns `why: the same line was added on both sides`.
- In mergePrepare, on a non-zero rebase exit, the files whose `git status --porcelain` code is UU are read from the worktree and passed through unionResolve; when every UU file resolves, each is written back, `git -C <wt> add -- <file>` runs for each, then `git -C <wt> rebase --continue`; a second stop in the same rebase repeats the step once more, then aborts as today. hooks/lib/allow.ts isMergeShape gains exactly two shapes for this: `add -- <file>` for a file mergePrepare has just unioned (the list is held on the merge context) and `rebase --continue`; tests/allow.test.ts's SHAPES list covers both, and `rebase --continue` from anywhere else stays refused.
- When no UU file resolves, or none is UU, the rebase is aborted as today; the message is the existing conflictLine, followed by `; <file>: <why>` only when a UU file was tried and refused (tests/merge.test.ts's existing conflict case, which answers no status call, keeps its exact text).
- When the union let the rebase finish, the merge output carries one line `rebase: kept both sides in <files> (both only added lines)` immediately before the `<ID>: rebased onto` line, and the PR body (prBody in mergecmd.ts gains `rebase?: string`) renders it under a `## Rebase` heading after `## Gates`.
- tests/node/unionresolve.node.mjs covers: an empty-base block resolves ours then theirs; a non-empty base returns the changed-on-both-sides why; a merge-style block (no base section) returns the no-base why; an empty side returns its why; a duplicate non-blank line returns its why; blank lines on both sides do not count as duplicates. tests/merge.test.ts gains one engine case where two branches each append a bullet to the same file and merge lands the second with the rebase line, and keeps the existing real-conflict case unchanged.
- docs/review-and-merge.md, in the paragraph that says `resolve by hand`, gains two sentences on the both-added resolution and its line.
- CHANGELOG.md gains an `### Added` heading above `### Fixed` under `## Unreleased` (if absent) with one bullet naming MOD-312.
- The validate, node and test gates are green.

## Review

Diff read in full. unionResolve is pure: a diff3 block resolves only with an empty base, both sides non-empty and no line shared, ours then theirs; an unclosed block, a non-diff3 block or a file with no block refuses the whole file. mergePrepare passes the diff3 and GIT_EDITOR env on rebase and continue, reads the UU files, writes back only when every one resolves, stages them under a unioned list carried on the merge context so the allowlist admits add -- for those files alone, continues at most twice and otherwise aborts with the conflict line plus the refusal reasons; the rebase line goes before the rebased line and into the PR body under Rebase. rebase --continue outside a merge context stays refused. Node, allow and two merge engine cases. Verdict consistent at 2f98ec0.
