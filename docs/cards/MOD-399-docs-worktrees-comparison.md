---
id: MOD-399
title: "Docs: docs/worktrees.md compares Claude Code's built-in worktrees with the mod's and says why the mod cuts its own, linked from the README's docs list"
domain: mod
tier: economy
tier_reason: Mechanical docs touch; the page is written by the brain and copied as is, plus one README line
status: merged
issue: 559
scope: [docs/worktrees.md, README.md]
forbid: [hooks/**, bin/**, tests/**, .claude-plugin/**, CHANGELOG.md, docs/cards/**, docs/guide.md, docs/upgrading.md]
red_test: none
gate: validate
budget: 2-attempts
spend: 3
---
## Why

Issue #559. Claude Code has built-in worktrees, but the docs never say how the mod's worktrees differ, or why the mod does not use the built-in ones.

## Design (decided by the brain; build it, do not redesign it)

- **The page:** the brain has written the whole page. Copy it, unchanged byte for byte, from `.delegation/drafts/worktrees.md` in the main checkout to `docs/worktrees.md` in your worktree. The main checkout is the first line of `git worktree list`; `.delegation/` is git-ignored, so the file is not in your worktree. Do not edit its text.
- **The link:** in `README.md`, in the docs list, insert this one line directly above the line that starts `- [Spend](docs/spend.md)`:
  `- [Worktrees](docs/worktrees.md): Claude Code's built-in worktrees beside the mod's, and why the mod cuts its own.`
- Nothing else changes.

## Done when

- `docs/worktrees.md` equals the draft byte for byte (`cmp` exits 0), and the README holds the one new line in that place.
- No other file changes.
- The validate gate is green.

## Review

Brain review (Opus 5.5): Exact. docs/worktrees.md matches the brain's draft byte for byte (cmp), and the README docs list gains the one Worktrees line above Spend. The built-in feature's facts were checked against Claude Code's current worktree, sub-agent, hooks, settings and desktop docs on 2026-11-17.
