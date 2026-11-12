---
id: MOD-370
title: Release 0.9.60: version bumped in three places, the CHANGELOG's Unreleased section becomes the dated 0.9.60 section, upgrading.md gains the 0.9.59 to 0.9.60 section
domain: mod
tier: economy
tier_reason: Mechanical release touch; MOD-298, 302, 320, 323, 327, 330, 346, 352, 355, 360 and 363 shipped on haiku first try
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, docs/upgrading.md]
forbid: [hooks/register.ts, hooks/lib/advisor.ts, hooks/lib/handback.ts, hooks/lib/attempts.ts, hooks/lib/verify.ts, hooks/lib/quiet.ts, hooks/lib/card.ts, hooks/lib/dispatch.ts, hooks/templates/**, bin/**, docs/guide.md, docs/internals.md, docs/cards/**, tests/**]
red_test: none
gate: validate
budget: 2-attempts
spend: 3
---
## Why

MOD-365 to MOD-369 count advisor use, give the brief an advisor rule and a stop rule, give the brain an advisor line and cues, and add `bin/advisor.mjs`. They reach adopters only in a tagged version.

## Done when

- hooks/lib/version.ts, .claude-plugin/plugin.json (the `"version"` value only) and README.md (the `Version 0.9.59, MIT.` line) all say 0.9.60 and nothing else in those files changes.
- In CHANGELOG.md the heading line `## Unreleased` becomes `## 0.9.60 — 2026-11-12` (em dash). Nothing else in the file changes: every heading and bullet below it stays word for word, in its order, and no `## Unreleased` heading remains.
- docs/upgrading.md gains a section `### From 0.9.59 to 0.9.60` directly above `### From 0.9.58 to 0.9.59`, in the same shape, with this one paragraph word for word: No action needed. Every brief now carries two more rules: an advisor line (a frontier card is allowed one advisor call before it changes any file on half its cards, chosen by the card id, and every other card none; a card's `advisor: none|once` overrides it) and a stop rule (after two rounds of fixes on a failing gate the worker hands back `gate=fail` with a `tried:` line per round, which steps the card up a tier). A worker's advisor calls are now counted in its attempt's dollars and shown on the verdict row, with calls over its brief's rule flagged. The brain's delegation state gains one advisor line, and a second refuted attempt or a review that refutes raises an advisor cue, written to the ledger. `node bin/advisor.mjs <transcripts folder> --ledger <repo>/.delegation/ledger.jsonl` reports advisor use across sessions. A brief written before this version is reused as it is and carries neither rule. Detail: [CHANGELOG 0.9.60](../CHANGELOG.md).
- No other file changes.
- The validate gate is green.

## Review

Brain review (Opus 5.5): five files, the version in version.ts, plugin.json and README, the changelog heading dated 2026-11-12, and the 0.9.59→0.9.60 upgrading paragraph covering the advisor rule, the stop rule, advisor spend on the verdict row, the brain advisor line and cues, bin/advisor.mjs, and old briefs reused without either rule. Nothing else changed. Accept.
