---
id: MOD-320
title: Release 0.9.51: version bumped in three places, CHANGELOG Unreleased dated, upgrading.md gains the 0.9.50 to 0.9.51 section
domain: mod
tier: economy
tier_reason: Mechanical release touch version strings, a heading rename, one upgrading paragraph and two doc nits; MOD-298 and MOD-30
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, docs/upgrading.md, docs/contracts.md]
forbid: [hooks/register.ts, hooks/lib/scheduler.ts, hooks/lib/configeff.ts, hooks/lib/configtable.ts, hooks/lib/allow.ts, hooks/lib/mergecmd.ts, hooks/lib/repoconfig.ts, docs/cards/**, tests/**]
red_test: none
gate: validate
budget: 2-attempts
spend: 3
---
## Why

Seventeen cards (MOD-303, 304, 305, 306, 307, 308, 309, 310, 311, 312, 313, 314, 315, 316, 317, 318, 319) have merged onto main since 0.9.50 and sit under `## Unreleased` in CHANGELOG.md. The plugin clone loads a tagged version, so the pile needs a version, a dated CHANGELOG heading and an upgrading note before adopters can take it. Two doc nits ride along: stray blank lines inside the `### Fixed` list and a missing sentence separator in the contracts.md `red_test` row.

## Done when

- hooks/lib/version.ts, .claude-plugin/plugin.json and README.md (the `Version 0.9.50, MIT.` line) all say 0.9.51 and nothing else in those files changes.
- CHANGELOG.md: the `## Unreleased` heading becomes `## 0.9.51 — 2026-11-05` (em dash, as the `## 0.9.50 — 2026-11-05` heading below it); every bullet already under it stays, in order and unchanged in text; the blank lines between bullets inside the `### Fixed` list of that section are removed so the list is contiguous (one blank line after the `### Fixed` heading and one before the next `##` heading, as the `### Added` list is).
- docs/upgrading.md gains a section `### From 0.9.50 to 0.9.51` directly above `### From 0.9.49 to 0.9.50`, in the same shape as that section: one paragraph opening `No action needed.` that names, in the CHANGELOG's own words, the merge union-resolve of add-only rebase conflicts, the two repo-file keys `mergeStyle` and `finishSkip`, `merge --finish` on a worktree that is already gone, the dispatch base never counting as landed, the gate re-run before a red verdict, the live-process note on the verdict row, and the brief hash on ledger rows; it ends with `Detail: [CHANGELOG 0.9.51](../CHANGELOG.md).`
- docs/contracts.md: in the `red_test` row of the brief header table, the sentence `dispatch warns when a path in it is outside scope or inside forbid` is followed by a period and a space before `` `none (test-only)` is for a card … `` so the two sentences are separated; no other text in the row or file changes.
- No file outside the scope changes; no source under hooks/ other than hooks/lib/version.ts changes.
- The validate gate is green.

## Review

Diff read in full: version 0.9.51 in version.ts, plugin.json and README; `## Unreleased` dated 0.9.51 — 2026-11-05 with the four stray blank lines inside the Fixed list removed and every bullet kept; upgrading.md section in the 0.9.50 shape naming the seven headline changes and ending with the CHANGELOG link; contracts.md red_test row gains the sentence separator. Nothing else changed. Verdict consistent at 30de964.
