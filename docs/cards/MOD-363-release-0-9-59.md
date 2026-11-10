---
id: MOD-363
title: Release 0.9.59: version bumped in three places, the CHANGELOG's Unreleased section becomes the dated 0.9.59 section, upgrading.md gains the 0.9.58 to 0.9.59 section
domain: mod
tier: economy
tier_reason: Mechanical release touch; MOD-298, 302, 320, 323, 327, 330, 346, 352, 355 and 360 shipped on haiku first try
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, docs/upgrading.md]
forbid: [hooks/register.ts, hooks/lib/statusmap.ts, hooks/lib/reconcile.ts, hooks/lib/tree.ts, hooks/lib/repoconfig.ts, hooks/lib/configeff.ts, hooks/lib/configtable.ts, hooks/lib/allow.ts, bin/**, docs/contracts.md, docs/configuration.md, docs/guide.md, docs/install.md, docs/internals.md, docs/cards/**, tests/**]
red_test: none
gate: validate
budget: 2-attempts
spend: 3
---
## Why

MOD-361 adds the `statusMap` option and reads a card's status by its first word. MOD-362 gives `tree reconcile` a list for open parents whose sub-issues are all closed, and has `--confirm` close them. They reach adopters only in a tagged version.

## Done when

- hooks/lib/version.ts, .claude-plugin/plugin.json (the `"version"` value only) and README.md (the `Version 0.9.58, MIT.` line) all say 0.9.59 and nothing else in those files changes.
- In CHANGELOG.md the heading line `## Unreleased` becomes `## 0.9.59 — 2026-11-09` (em dash). Nothing else in the file changes: every heading and bullet below it stays word for word, in its order, and no `## Unreleased` heading remains.
- docs/upgrading.md gains a section `### From 0.9.58 to 0.9.59` directly above `### From 0.9.57 to 0.9.58`, in the same shape, with this one paragraph word for word: No action needed for a repo whose cards carry the mod's own status words. Two things change. A card's status is now read by its first word, lower-cased: `Merged` and `merged (PR 27)` read as merged, and `queued (waiting)` reads as queued and can be dispatched. A new option `statusMap` maps a repo's own status words onto queued, merged or parked, for example `{"done": "merged", "held": "parked"}` in `.chassis-delegation.json`; no card file is rewritten, and the Work view says how many cards carry a word the mod does not know. `tree reconcile` gains a fourth list: an open sub-issue whose own sub-issues are all closed, and the named parent once its sub-issues are closed, each with a live close line in place of the commented `not planned` one. `--confirm` now runs those closes too, the named parent last, so read the dry run before you confirm. Detail: [CHANGELOG 0.9.59](../CHANGELOG.md).
- No other file changes.
- The validate gate is green.

## Review

Brain review: diff read whole. Three version mentions bumped, the Unreleased heading became the dated 0.9.59 heading with its Added and Changed bullets untouched, and the upgrading section sits above the 0.9.57 to 0.9.58 one with the card's paragraph word for word.
