---
id: MOD-419
title: Release 0.9.70: version bumped in three places, the CHANGELOG's Unreleased section becomes the dated 0.9.70 section, upgrading.md gains the 0.9.69 to 0.9.70 section
domain: mod
tier: economy
tier_reason: Mechanical release touch; every release card since MOD-298 shipped on haiku first try
status: merged
issue: 594
parent: 589
fixes: []
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, docs/upgrading.md]
forbid: [hooks/register.ts, hooks/lib/waitstate.ts, hooks/lib/review.ts, hooks/templates/**, bin/**, docs/guide.md, docs/internals.md, docs/cards/**, tests/**]
red_test: none
gate: validate
budget: 2-attempts
spend: 3
---
## Why

Issue #594. The reviewer's fourth label (MOD-415), the reviewer's copy of the worker's own hand-back (MOD-416), the fuller review ledger row (MOD-417), the wider wait wording (MOD-418) and brain calls by kind (MOD-413) reach adopters only in a tagged version, and the ledger keys record nothing until sessions run it.

## Done when

- hooks/lib/version.ts, .claude-plugin/plugin.json (the version value only) and README.md (the line `Version 0.9.69, MIT.`) all say 0.9.70, and nothing else in those files changes.
- In CHANGELOG.md, the heading line `## Unreleased` becomes `## 0.9.70 — 2026-11-26` (em dash). Nothing else in the file changes: every heading and bullet below it stays word for word, in its order, and no `## Unreleased` heading remains.
- docs/upgrading.md gains a section `### From 0.9.69 to 0.9.70` directly above `### From 0.9.68 to 0.9.69`, in the same shape, with this one paragraph word for word: No action needed. A reviewer has a fourth label, `misreported`: the work at the sha is right and a statement in the hand-back about it is wrong. Only `refuted` rows send the work back. After a `--verify` the reviewer is given the worker's own hand-back when the worker's transcript holds one for the same sha. A review's ledger row gains `workerTier`, `handback`, `refutedLines` and `misreportedLines`, and every brain stamp gains `calls` by kind; rows written before this version carry none of them. A worker that ends a turn saying its own run is still in the background is shown as waiting, not as no-report. Detail: [CHANGELOG 0.9.70](../CHANGELOG.md).
- No other file changes.
- The validate gate is green.

## Testing

- Planned: none
- Red test: none
- Gate validate: pass · ✔ Validation passed with warnings · 7 s · verify pass reused at merge
- Test files changed: none

## Review

Brain review (Fable 5.2): Mechanical and exact. I read the whole diff at cd08ec0: the version is 0.9.70 in all three places, the changelog heading is dated with an em dash and the rest of the file is untouched, and the upgrading section sits above 0.9.68 to 0.9.69 with the paragraph word for word. The engine suite was not run on this card (gate validate only); it last ran green on MOD-418's tree, which holds every change this release carries.
