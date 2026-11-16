---
id: MOD-391
title: "Release 0.9.64: version bumped in three places, the CHANGELOG's Unreleased section becomes the dated 0.9.64 section, upgrading.md gains the 0.9.63 to 0.9.64 section"
domain: mod
tier: economy
tier_reason: Mechanical release touch; MOD-298 through MOD-385 releases shipped on haiku first try
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, docs/upgrading.md]
forbid: [hooks/register.ts, hooks/lib/gaterun.ts, hooks/lib/mergecmd.ts, hooks/templates/**, bin/**, docs/guide.md, docs/internals.md, docs/cards/**, tests/**]
red_test: none
gate: validate
budget: 2-attempts
spend: 3
---
## Why

The findings gate fix (MOD-386), the model badge in the Work pane (MOD-387) and the Work pane changes from the MOD-384 review (MOD-388, MOD-389, MOD-390) reach adopters only in a tagged version.

## Done when

- hooks/lib/version.ts, .claude-plugin/plugin.json (the `"version"` value only) and README.md (the `Version 0.9.63, MIT.` line) all say 0.9.64, and nothing else in those files changes.
- In CHANGELOG.md the heading line `## Unreleased` becomes `## 0.9.64 — 2026-11-15` (em dash). Nothing else in the file changes: every heading and bullet below it stays word for word, in its order, and no `## Unreleased` heading remains.
- docs/upgrading.md gains a section `### From 0.9.63 to 0.9.64` directly above `### From 0.9.62 to 0.9.63`, in the same shape, with this one paragraph word for word: No action needed. The findings gate no longer reads a ⚠ inside backticks as a flag, and a malformed flag's problem line now quotes what it found. The Work pane draws the model badge (🟢 🔵 🟣) beside the worker in the list, the board and the detail; `modelGlyphs off` restores the dot. The list's Progress and Card columns are now one Card column, so Worker shows from 96 columns, and below 28 columns the status is a coloured dot. Board titles take two lines and the column headers carry counts. The chips and the List/Board switch keep their width when pressed, and a selected row has a blue bar. Detail: [CHANGELOG 0.9.64](../CHANGELOG.md).
- No other file changes.
- The validate gate is green.

## Review

Brain review (Opus 5.5): Mechanical and exact. The version is 0.9.64 in all three places, and the changelog heading is dated with an em dash, with the rest of the file untouched. The upgrading section sits above 0.9.62 to 0.9.63 with the paragraph word for word.
