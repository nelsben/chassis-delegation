---
id: MOD-352
title: Release 0.9.56: version bumped in three places, the CHANGELOG's Unreleased section becomes the dated 0.9.56 section, upgrading.md gains the 0.9.55 to 0.9.56 section
domain: mod
tier: economy
tier_reason: Mechanical release touch; MOD-298, 302, 320, 323, 327, 330 and 346 shipped on haiku first try
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, docs/upgrading.md]
forbid: [hooks/register.ts, hooks/lib/brain.ts, hooks/lib/cost.ts, hooks/lib/card.ts, hooks/lib/issuematch.ts, hooks/lib/storeloss.ts, bin/**, docs/contracts.md, docs/guide.md, docs/internals.md, docs/spend.md, docs/cards/**, tests/**]
red_test: none
gate: validate
budget: 2-attempts
spend: 3
---
## Why

MOD-348 to MOD-351 correct the brain's dollars, name the model version in a brain pair, make the scorecard read the brain's spend per card and per week, remember issue states between a card call and its dispatch, and warn about a glob that misses the files directly in a folder. They reach adopters only in a tagged version.

## Done when

- hooks/lib/version.ts, .claude-plugin/plugin.json and README.md (the `Version 0.9.55, MIT.` line) all say 0.9.56 and nothing else in those files changes.
- In CHANGELOG.md the heading line `## Unreleased` becomes `## 0.9.56 — 2026-11-09` (em dash). Nothing else in the file changes: every bullet under `### Added`, `### Changed` and `### Fixed` below it stays word for word, in its order, and no `## Unreleased` heading remains.
- docs/upgrading.md gains a section `### From 0.9.55 to 0.9.56` directly above `### From 0.9.54 to 0.9.55`, in the same shape, with this one paragraph word for word: No action needed. Brain dollars recorded from this version on read about 30% higher than before for the same work: the host's main loop writes 1-hour cache entries, which were priced at the 5-minute rate. Stored records are not repriced, so a chart of brain spend steps up at the upgrade. A brain pair now names the model version (`fable-5.2/high`), and the scorecard's `brains` and `contexts` blocks read only sessions on this version or later. The card tool and dispatch warn about a scope or forbid glob such as `tests/**/x`, which here needs a folder between and misses `tests/x`. Detail: [CHANGELOG 0.9.56](../CHANGELOG.md).
- No other file changes.
- The validate gate is green.

## Review

Brain review: diff read whole. Three version mentions bumped, the Unreleased heading became the dated 0.9.56 heading with its bullets untouched, and the upgrading section is word for word.
