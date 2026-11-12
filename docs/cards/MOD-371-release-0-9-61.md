---
id: MOD-371
title: Release 0.9.61: version bumped in three places, the CHANGELOG's Unreleased section becomes the dated 0.9.61 section, upgrading.md gains the 0.9.60 to 0.9.61 section
domain: mod
tier: economy
tier_reason: Mechanical release touch; MOD-298, 302, 320, 323, 327, 330, 346, 352, 355, 360, 363 and 370 shipped on haiku first try
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, docs/upgrading.md]
forbid: [hooks/register.ts, hooks/lib/reconcile.ts, hooks/lib/tree.ts, hooks/templates/**, bin/**, docs/guide.md, docs/internals.md, docs/cards/**, tests/**]
red_test: none
gate: validate
budget: 2-attempts
spend: 3
---
## Why

MOD-364 stops `tree reconcile` from proposing a sub-issue as done because a merged card names it as `parent:`. It reaches adopters only in a tagged version.

## Done when

- hooks/lib/version.ts, .claude-plugin/plugin.json (the `"version"` value only) and README.md (the `Version 0.9.60, MIT.` line) all say 0.9.61 and nothing else in those files changes.
- In CHANGELOG.md the heading line `## Unreleased` becomes `## 0.9.61 — 2026-11-12` (em dash). Nothing else in the file changes: every heading and bullet below it stays word for word, in its order, and no `## Unreleased` heading remains.
- docs/upgrading.md gains a section `### From 0.9.60 to 0.9.61` directly above `### From 0.9.59 to 0.9.60`, in the same shape, with this one paragraph word for word: Read the reconcile dry run again before you confirm. `tree reconcile` now proposes a sub-issue as done elsewhere only when a merged card names it in its own `issue:`. A sub-issue that merged cards name only as `parent:` gets its own row, `<k> merged cards under it, none open (<ids>)`, with a commented close line; a bare `--confirm` leaves it open and prints the `--only` line that closes it once you have checked its done-when. A sub-issue with an open card under it is listed as `<k> cards under it still open` and never proposed, and the named parent waits while either row is present. `--confirm --only <n,n,…>` (the `tree` tool's `only`) closes just the numbers given. Detail: [CHANGELOG 0.9.61](../CHANGELOG.md).
- No other file changes.
- The validate gate is green.

## Review

Brain review (Opus 5.5): five files; version 0.9.61 in version.ts, plugin.json and README; the changelog heading dated 2026-11-12 with the MOD-364 bullets below it unchanged; the 0.9.60→0.9.61 upgrading paragraph word for word from the card. Nothing else changed. Accept.
