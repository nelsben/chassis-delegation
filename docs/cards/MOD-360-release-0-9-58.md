---
id: MOD-360
title: Release 0.9.58: version bumped in three places, the CHANGELOG's Unreleased section becomes the dated 0.9.58 section, upgrading.md gains the 0.9.57 to 0.9.58 section
domain: mod
tier: economy
tier_reason: Mechanical release touch; MOD-298, 302, 320, 323, 327, 330, 346, 352 and 355 shipped on haiku first try
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, docs/upgrading.md]
forbid: [hooks/register.ts, hooks/lib/work.ts, hooks/lib/workpane.tsx, hooks/lib/brief.ts, hooks/lib/issuematch.ts, hooks/lib/repoconfig.ts, hooks/lib/configtable.ts, hooks/lib/allow.ts, bin/**, docs/contracts.md, docs/configuration.md, docs/guide.md, docs/install.md, docs/internals.md, docs/cards/**, tests/**]
red_test: none
gate: validate
budget: 2-attempts
spend: 3
---
## Why

MOD-356 and MOD-357 finish the Work pane (a detail panel with actions, and a Board view). MOD-358 lets `scopeAmends within-parent` apply an amend inside the card's own folders when the card has no parent scope. MOD-359 adds the `issueLink` option. They reach adopters only in a tagged version.

## Done when

- hooks/lib/version.ts, .claude-plugin/plugin.json (the `"version"` value only) and README.md (the `Version 0.9.57, MIT.` line) all say 0.9.58 and nothing else in those files changes.
- In CHANGELOG.md the heading line `## Unreleased` becomes `## 0.9.58 — 2026-11-09` (em dash). Nothing else in the file changes: every heading and bullet below it stays word for word, in its order, and no `## Unreleased` heading remains.
- docs/upgrading.md gains a section `### From 0.9.57 to 0.9.58` directly above `### From 0.9.56 to 0.9.57`, in the same shape, with this one paragraph word for word: No action needed. The Work pane gains a detail panel and a Board. A leaf's title opens its detail (its fields and its activity from the ledger) with one action, Dispatch, Review or Unblock: a press starts nothing itself, it puts one line to the session. The List and Board buttons switch to a board with a lane per epic and a column per state. Two rules change. Under `scopeAmends within-parent`, a card with no parent scope no longer holds every amend: a `scope+=` whose every path sits in a folder the card's scope already names is applied, and the rest still wait for you; set `scopeAmends ask` to keep every amend waiting. A new option `issueLink` (off, hint, require; default hint) adds one note to the card tool's reply and to the dispatch dry run for a card with no issue; `require` refuses such a card, release cards and cards with no repo work apart. Detail: [CHANGELOG 0.9.58](../CHANGELOG.md).
- No other file changes.
- The validate gate is green.

## Review

Brain review: diff read whole. Three version mentions bumped, the Unreleased heading became the dated 0.9.58 heading with its Added and Changed bullets untouched, and the upgrading section sits above the 0.9.56 to 0.9.57 one.
