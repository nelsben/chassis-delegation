---
id: MOD-346
title: Release 0.9.55: version bumped in three places, the CHANGELOG's Unreleased section becomes the dated 0.9.55 section, upgrading.md gains the 0.9.54 to 0.9.55 section
domain: mod
tier: economy
tier_reason: Mechanical release touch; MOD-298, 302, 320, 323, 327 and 330 shipped on haiku first try
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, docs/upgrading.md]
forbid: [hooks/register.ts, hooks/lib/brain.ts, hooks/lib/card.ts, hooks/lib/issuematch.ts, hooks/lib/reconcile.ts, hooks/lib/handback.ts, hooks/lib/storeloss.ts, bin/**, docs/contracts.md, docs/guide.md, docs/internals.md, docs/cards/**, tests/**]
red_test: none
gate: validate
budget: 2-attempts
spend: 3
---
## Why

MOD-338 to MOD-345 add the measurements that say whether the mod is working (worker choices, repaired cards, issue links, the brain's spend and how the brain was run, and a scorecard that reads them), and two fixes. They reach adopters only in a tagged version.

## Done when

- hooks/lib/version.ts, .claude-plugin/plugin.json and README.md (the `Version 0.9.54, MIT.` line) all say 0.9.55 and nothing else in those files changes.
- In CHANGELOG.md the heading line `## Unreleased` becomes `## 0.9.55 — 2026-11-08` (em dash). Nothing else in the file changes: the six `### Added` bullets and the two `### Fixed` bullets under it stay word for word, in their order, and no `## Unreleased` heading remains.
- docs/upgrading.md gains a section `### From 0.9.54 to 0.9.55` directly above `### From 0.9.53 to 0.9.54`, in the same shape, with this one paragraph word for word: No action needed. Ledger rows gain fields (a worker's `choices`, a spawn row's `fixes` and `linked`, and `brain` on judged and merged rows), and `node bin/evidence.mjs --scorecard <ledger>` prints a scorecard by week, by worker model and by brain setup; a ledger written before this version reads as before, with those columns empty. Detail: [CHANGELOG 0.9.55](../CHANGELOG.md).
- No other file changes.
- The validate gate is green.

## Review

Brain review: diff read whole. Three version mentions bumped, the Unreleased heading became the dated 0.9.55 heading with its bullets untouched, and the upgrading section is word for word.
