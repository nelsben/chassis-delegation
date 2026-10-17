---
id: MOD-86
title: /delegation merge works with a git-ignored card folder: the card is marked merged in place, no card commit is made, and --finish confirms the merge by the branch head or its rebased twin
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/mergecmd.ts, hooks/lib/allow.ts, hooks/lib/setup.ts, hooks/lib/init.ts, tests/merge.test.ts, tests/allow.test.ts, tests/setup.test.ts, tests/init.test.ts, tests/hooks.test.ts, docs/review-and-merge.md, docs/install.md, CHANGELOG.md]
forbid: [docs/cards/**, hooks/lib/norepo.ts, hooks/lib/card.ts, hooks/lib/version.ts, hooks/templates/**, bin/**, .claude-plugin/**, .chassis-delegation.json, README.md, docs/contracts.md, docs/guide.md, tests/norepo.test.ts, tests/research.test.ts, tests/dispatchtool.test.ts]
red_test: a new case in tests/merge.test.ts: with `git check-ignore -q -- <card>` answering exit 0, /delegation merge <ID> runs no `git add` of the card and leaves the root card reading status: merged; on main it runs the add, which the stand-in git refuses as an ignored path, and stops; red first
gate: validate, node, test
budget: 2-attempts
spend: 8
---
## Why

A public repo that keeps its cards local through .git/info/exclude cannot use /delegation merge (#141): prepare's `git add` of the card is refused as an ignored path, and --finish refuses because the card is not on origin/main, so the worktree, branch and merged ledger row are left for the brain to do by hand. The rest of the mod already works with local-only cards; the merge pipeline is the one place that assumes the card is tracked.

## Done when

- DETECT. The merge pipeline asks git whether the card path is ignored: `git -C <dir> check-ignore -q -- <card repo-relative path>` (exit 0 = ignored, 1 = not). hooks/lib/allow.ts lets that exact read shape pass (any -C dir, one path after `--`, no other options); a check-ignore with any other option or more than one path is refused. tests/allow.test.ts pins both.
- PREPARE, IGNORED. When the card path is ignored, prepare rewrites the root card (the main checkout's) in place with markMerged (status merged, plus the Review section when one is given), runs no `git add` of the card and makes no card commit; the rest runs as today (rebase, gates in the worktree, the PR body from the card text, the push block). Its first line says `card kept local (git-ignored): <root card path> marked merged` in place of `card committed as merged`. A tracked card behaves exactly as today.
- FINISH, IGNORED. When the card path is ignored, --finish does not look for the card on origin/<default> and does not remove the root card (it is the only copy, and it already reads merged). It confirms the merge the way it already can: the worktree head is on origin/<default> or has a rebased twin there (twinIn); when neither, it refuses naming the head and changes nothing. Then the usual: main pulled, worktree and branch removed, the merged ledger row written, the remote cleanup (and release) lines printed. A tracked card behaves exactly as today.
- SETUP. /delegation setup and /delegation init print one line when the card folder is git-ignored: `cards: <cardDir> is git-ignored, so cards stay local; /delegation merge marks them merged in place`. Nothing else they write or check changes.
- TESTS. tests/merge.test.ts: ignored prepare runs no add and no card commit and leaves the root card reading `status: merged` with the review; ignored finish with a twin on origin cleans up, writes the merged row and keeps the root card; ignored finish with no twin refuses and removes nothing. tests/setup.test.ts (or tests/init.test.ts): the line shows for an ignored card folder and not otherwise. Every existing merge, allow, setup and init test passes unchanged.
- DOCS. docs/review-and-merge.md's Merging a card section and docs/install.md's Setup section say how local-only cards merge. CHANGELOG.md has an entry under `## Unreleased` above the latest version heading (create it if there is none). The three gates pass.

## Review

Attempt 1 (sonnet, $1.10) accepted as handed back. Read the ignored-card path end to end: the merge asks git check-ignore -q -- <card> (a new exact read shape in the allowlist, -C <dir> and one path only); for an ignored card prepare marks the root card merged in place and commits nothing, and --finish skips the origin card check, keeps the root card (the only copy) and confirms the merge by the head or its rebased twin. A tracked card takes the old path, and the two pinned argv tests now include the check-ignore call. The ignored root card reads merged once prepare passes the rebase, before the gates, the same point at which a tracked card is committed as merged in the worktree. The red run was taken after source edits were reverted rather than before any edit; the new merge tests fail without the change, which is what counts. Rebased by hand onto MOD-85 (CHANGELOG: all three Unreleased entries kept).
