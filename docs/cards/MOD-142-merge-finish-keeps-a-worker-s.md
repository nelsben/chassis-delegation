---
id: MOD-142
title: merge --finish keeps a worker's evidence: before anything is cleaned up it lists the worktree's untracked and git-ignored files outside a built-in skip list and stops, naming them with a copy-first line, unless --discard is given
domain: mod
tier: standard
status: merged
scope: [hooks/lib/mergecmd.ts, hooks/register.ts, tests/**, docs/review-and-merge.md, CHANGELOG.md]
forbid: [docs/cards/**, bin/**, hooks/templates/**, .chassis-delegation.json, .claude-plugin/**, README.md, docs/upgrading.md, hooks/lib/verify-native.ts, hooks/lib/allow.ts]
red_test: engine test: a merged task whose worktree holds a git-ignored `.local/run/log.txt` gets, from merge --finish, `…holds 1 untracked or ignored files the merge does not carry…` and the worktree still exists; at base finish removes the worktree and the file with it. Red first
gate: validate, node, test
budget: 2-attempts
spend: 8
---
## Why

Issue #231, part 1: a worker saved its run's screenshots and log under a git-ignored folder in its worktree, and `merge --finish` removed the worktree and with it the only copy of the proof (`git worktree remove` refuses on untracked files but not on ignored ones). The mod cannot copy binaries itself (the host's fs.write takes text only), so finish should stop and say what is there before it deletes it.

## Done when

- hooks/lib/mergecmd.ts: `--discard` is a flag of `--finish` only (`/delegation merge <ID> --finish [--discard]`), MERGE_USAGE and the merge tool's input (a `discard` boolean beside `finish`) say so, and `--discard` without `--finish` is refused with `refused --discard without --finish`.
- hooks/register.ts finish path: right after the branch is found in origin (before the root card is removed, before the pull), it runs `git -C <worktree> status --porcelain --ignored --untracked-files=all` and keeps the `??` and `!!` paths, minus a built-in skip list exported as FINISH_SKIP from hooks/lib/mergecmd.ts: `.delegation/`, `node_modules/`, `.venv/`, `venv/`, `__pycache__/`, `.pytest_cache/`, `.mypy_cache/`, `.ruff_cache/`, `dist/`, `build/`, `coverage/`, `.next/`, `.turbo/`, `target/`, `.cache/`, `.DS_Store`, and any path ending `.pyc` (a folder entry skips everything under it, at any depth).
- When paths are left and --discard is not given, finish does nothing else and returns `<ID>: the worktree <path> holds <n> untracked or ignored files the merge does not carry; copy what you need, then run /delegation merge <ID> --finish again, or add --discard to delete them:` followed by up to 20 paths (worktree-relative, one per line, folders collapsed to `<folder>/ (<k> files)` when they hold more than 3) and `… <m> more` past 20. The root card, the pull, the worktree, the branch and the ledger are untouched.
- With --discard, or with no paths left, finish runs exactly as today; with --discard and paths present, the result gains one line `note: discarded <n> untracked or ignored files from <path>`. A status read that fails is a note and finish proceeds as today (it never blocks on a git error).
- Tests: pure tests in tests/node for the porcelain parse, the skip list (nested node_modules, a .pyc, .DS_Store) and the folder collapsing; engine tests in tests/ for (1) a worktree with an ignored `.local/run/shot.png` and `log.txt`: finish stops with the copy-first line naming `.local/run/ (2 files)` or both paths, and the worktree, branch and root card are still there; (2) the same with --discard: finish completes and notes the discard; (3) only node_modules/ and .delegation/ present: finish completes with no note; (4) `--discard` without `--finish` is refused.
- docs/review-and-merge.md (the finish step) says what finish checks, the skip list, and --discard; CHANGELOG.md Unreleased gets one Fixed entry. Wording generic: no product, repo, person, path or session names.

## Review

Attempt 1 consistent at 8424505; the brain resumed it because with --discard and untracked files `git worktree remove` (no --force; allow.ts untouched) refuses, yet finish printed `discarded`. Attempt 2 consistent at 391c73e (validate, node 1089, engine 1602). Finish reads `git status --porcelain --ignored --untracked-files=all` after the branch is found on origin and before the root card or pull, and stops with the copy-first list unless --discard (FINISH_SKIP skips deps, caches and build output). The discard note prints only when the remove succeeded; a remove blocked by untracked files returns early keeping the branch and writing no merged row, so a second finish completes (the root card is already gone, so cardNameIn finds none and that step is skipped). A failed remove with no untracked files keeps today's flow.
