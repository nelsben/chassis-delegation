---
id: MOD-319
title: Two repo config keys: mergeStyle picks the gh pr merge flag the merge block prints (and finish recognises a squash), and finishSkip adds per-repo paths finish never stops on
domain: mod
tier: standard
status: merged
issue: 439
scope: [hooks/lib/repoconfig.ts, hooks/lib/mergecmd.ts, hooks/register.ts, tests/node/finishkeep.node.mjs, tests/node/mergestyle.node.mjs, tests/repoconfig.test.ts, tests/merge.test.ts, tests/harness.ts, docs/configuration.md, docs/review-and-merge.md, CHANGELOG.md]
forbid: [hooks/lib/allow.ts, hooks/lib/scheduler.ts, hooks/lib/verify-native.ts, hooks/templates/**, docs/cards/**]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/mergestyle.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

An adopter's repo takes merge commits, so the `gh pr merge … --rebase` line the merge tool prints is swapped by hand every card, and its finish step stops on an ignored build output in every worktree, so discard is passed every time. Both are repo facts that belong in .chassis-delegation.json.

## Done when

- `mergeStyle` and `finishSkip` are repo-file keys added the way `issueRepo` is in hooks/lib/repoconfig.ts: REPO_KEYS, the RepoConfig type, the parse switch, the Effective type and mergeConfig; the register.ts effective-config fields; and one docs/configuration.md table row each. There is no configtable.ts row and no plugin.json entry (neither is a /config option). `mergeStyle` takes rebase, merge or squash; any other value is one error line `mergeStyle: needs rebase, merge or squash (ignored)` and reads as rebase. `finishSkip` is parsed by ignoreOf (a list, or a comma string), and each entry is matched by mergecmd.ts's `skipped` rule (a trailing slash skips that folder at any depth; a name skips that file at any depth; a leading-dot entry other than `.DS_Store` skips by suffix).
- hooks/lib/mergecmd.ts: `pushLines` takes `mergeStyle?: 'rebase' | 'merge' | 'squash'` (default rebase) and prints `gh pr merge --repo <r> <branch> --<style>`; register.ts passes the effective value. `finishLeftovers(porcelain, only?, extra: readonly string[] = [])` applies `extra` after FINISH_SKIP; both mergeFinish calls (register.ts ~3833 and ~3858) pass cfg.finishSkip.
- mergeFinish with mergeStyle squash: when the head is neither an ancestor of origin/<default> nor a rebased twin, a line of the log already read (no new git read) whose sha is not the head and whose tree equals the head's tree is the landing; the first finish line then says `(squash of the worktree head)` where the twin case says `(the rebased twin of the worktree head)`. With rebase or merge nothing changes.
- tests/node/mergestyle.node.mjs (new) covers pushLines for the three styles and the default. tests/node/finishkeep.node.mjs gains cases for `extra`: a folder entry, a file name, a suffix, and an empty list changing nothing. tests/repoconfig.test.ts gains one case per key: parse, an unknown mergeStyle error line, and a bad finishSkip entry dropped. tests/merge.test.ts gains two engine cases: a config with finishSkip [bin/] and an ignored bin/app file lets finish run without discard; a config with mergeStyle squash where origin/main's log carries a commit with the head's tree and another sha: finish completes, its first line contains `(squash of the worktree head)`, and the merged row's sha is that commit. The existing exact finish command list (~350-361) keeps passing under the default style.
- docs/review-and-merge.md's finish paragraph names mergeStyle and finishSkip in one sentence each.
- CHANGELOG.md gains a `### Added` heading above `### Fixed` under `## Unreleased` (when none exists) with one bullet naming MOD-319.
- The validate, node and test gates are green.

## Review

Diff read in full. repoconfig.ts: MERGE_STYLES/MergeStyle, mergeStyle and finishSkip on RepoConfig, REPO_KEYS and Effective; layerOf validates mergeStyle with the one error line and routes finishSkip through ignoreOf, which gained a key parameter so its errors name finishSkip; mergeConfig defaults rebase and []. No configtable row, no plugin.json entry, as the card asks. mergecmd.ts: pushLines takes mergeStyle and defaults to rebase; finishLeftovers and skipped take extra; squashIn(log, head, tree) finds a non-head commit with the head's tree. register.ts: Config carries both keys from the effective config, mergePrepare passes cfg.mergeStyle, mergeFinish passes cfg.finishSkip on both leftover reads and falls back to squashIn only under squash when twinIn finds nothing, printing (squash of the worktree head). Docs rows and sentences and the CHANGELOG bullet match. Note for later: squashIn relies on main not moving between the prepare rebase and the squash landing, the same assumption twinIn already makes. Verdict consistent at 24a0ebf.
