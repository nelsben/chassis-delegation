---
id: MOD-394
title: "Release 0.9.65: version bumped in three places, the CHANGELOG's Unreleased section becomes the dated 0.9.65 section, upgrading.md gains the 0.9.64 to 0.9.65 section"
domain: mod
tier: economy
tier_reason: Mechanical release touch; MOD-298 through MOD-391 releases shipped on haiku first try
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, docs/upgrading.md]
forbid: [hooks/register.ts, hooks/lib/gaterun.ts, hooks/lib/mergecmd.ts, hooks/templates/**, bin/**, docs/guide.md, docs/internals.md, docs/cards/**, tests/**]
red_test: none
gate: validate
budget: 2-attempts
spend: 3
---
## Why

The Work pane's links on remote surfaces (MOD-392) and its bars and counts (MOD-393) reach adopters only in a tagged version.

## Done when

- hooks/lib/version.ts, .claude-plugin/plugin.json (the `"version"` value only) and README.md (the `Version 0.9.64, MIT.` line) all say 0.9.65, and nothing else in those files changes.
- In CHANGELOG.md, the heading line `## Unreleased` becomes `## 0.9.65 — 2026-11-16` (em dash). Nothing else in the file changes: every heading and bullet below it stays word for word, in its order, and no `## Unreleased` heading remains.
- docs/upgrading.md gains a section `### From 0.9.64 to 0.9.65` directly above `### From 0.9.63 to 0.9.64`, in the same shape, with this one paragraph word for word: No action needed. On the desktop, the editor and mobile, the Work pane's titles, toggles, show links, Clear filters, Show done, the List/Board switch and the detail's back control are now links instead of boxed buttons, and on the desktop and the editor the pane closes from its own ✕. Progress bars are drawn as coloured boxes, a stacked board heading counts its folded cards, and a state chip with a count of 0 is dim. The terminal draws as before, apart from the bars and counts. Detail: [CHANGELOG 0.9.65](../CHANGELOG.md).
- No other file changes.
- The validate gate is green.

## Review

Brain review (Opus 5.5): Mechanical and exact. The version is 0.9.65 in all three places, and the changelog heading is dated with an em dash, the rest of the file untouched. The upgrading section sits above 0.9.63 to 0.9.64 with the paragraph word for word.
