---
id: MOD-330
title: Release 0.9.54: version bumped in three places, CHANGELOG gains a dated 0.9.54 section with three bullets, upgrading.md gains the 0.9.53 to 0.9.54 section
domain: mod
tier: economy
tier_reason: Mechanical release touch; MOD-298, 302, 320, 323 and 327 shipped on haiku first try
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, docs/upgrading.md]
forbid: [hooks/register.ts, hooks/lib/blocked.ts, hooks/lib/card.ts, hooks/lib/dispatch.ts, hooks/lib/tree.ts, docs/contracts.md, docs/guide.md, docs/review-and-merge.md, docs/cards/**, tests/**]
red_test: none
gate: validate
budget: 2-attempts
spend: 3
---
## Why

MOD-328 and MOD-329 close #432: an overlapping sibling card is written blocked instead of refused, and merge --finish of its last blocker releases it. They reach adopters only in a tagged version.

## Done when

- hooks/lib/version.ts, .claude-plugin/plugin.json and README.md (the `Version 0.9.53, MIT.` line) all say 0.9.54 and nothing else in those files changes.
- CHANGELOG.md gains, directly above `## 0.9.53 — 2026-11-06`, a section `## 0.9.54 — 2026-11-07` (em dash) with `### Added` holding three bullets and no other subsection, each a `- ` bullet wrapped in `**…**` like the 0.9.53 bullets. The three bullet texts, word for word, in this order (the backticks are literal markdown code spans):
- Bullet 1: **`card` writes a card whose scope overlaps an open sibling under the same parent as a blocked card (`status: blocked`, `blocked_by: [ids]`) instead of refusing it, and takes `blockedBy` (card ids or `#n` issue numbers) to name blockers by hand; a blocked card gets no dry run, brief or worktree until it is released, and dispatch refuses it (MOD-328).**
- Bullet 2: **`merge --finish` releases each blocked card whose last blocker it lands, in card-id order: the card goes to `status: queued` and the output prints `released: <id> (its last blocker <id> merged): dispatch task=<id>`; a card with blockers left, or whose scope overlaps an open sibling, stays blocked and the output names them (`still blocked: <id> by <ids>`) (MOD-329).**
- Bullet 3: **`tree` shows a blocked card as a `blocked` row naming its blockers, and its counts line adds `n blocked` when any card is blocked (MOD-329).**
- docs/upgrading.md gains a section `### From 0.9.53 to 0.9.54` directly above `### From 0.9.52 to 0.9.53`, in the same shape, with this one paragraph word for word: No action needed. A card cut under a parent whose scope overlaps an open sibling is now written blocked instead of refused, and `merge --finish` of its last blocker releases it to queued; set `status: queued` on the card by hand to dispatch it sooner. Detail: [CHANGELOG 0.9.54](../CHANGELOG.md).
- No other file changes.
- The validate gate is green.
