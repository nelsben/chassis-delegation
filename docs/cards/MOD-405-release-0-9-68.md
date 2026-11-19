---
id: MOD-405
title: "Release 0.9.68: version bumped in three places, the CHANGELOG's Unreleased section becomes the dated 0.9.68 section, upgrading.md gains the 0.9.67 to 0.9.68 section"
domain: mod
tier: economy
tier_reason: Mechanical release touch; MOD-298 through MOD-401 releases shipped on haiku first try
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, docs/upgrading.md]
forbid: [hooks/register.ts, hooks/lib/gaterun.ts, hooks/lib/mergecmd.ts, hooks/templates/**, bin/**, docs/guide.md, docs/internals.md, docs/cards/**, tests/**]
red_test: none
gate: validate
budget: 2-attempts
spend: 3
---
## Why

The Work pane redesign for the desktop, the editor and the phone (MOD-402, MOD-403, MOD-404) reaches adopters only in a tagged version.

## Done when

- hooks/lib/version.ts, .claude-plugin/plugin.json (the `"version"` value only) and README.md (the `Version 0.9.67, MIT.` line) all say 0.9.68, and nothing else in those files changes.
- In CHANGELOG.md, the heading line `## Unreleased` becomes `## 0.9.68 — 2026-11-18` (em dash). Nothing else in the file changes: every heading and bullet below it stays word for word, in its order, and no `## Unreleased` heading remains.
- docs/upgrading.md gains a section `### From 0.9.67 to 0.9.68` directly above `### From 0.9.66 to 0.9.67`, in the same shape, with this one paragraph word for word: No action needed. On the desktop, the editor and the phone the Work pane is redrawn: its rows stay on one line, its controls sit on lines of links, statuses are pills and progress is a thin bar. The terminal draws as before. Detail: [CHANGELOG 0.9.68](../CHANGELOG.md).
- No other file changes.
- The validate gate is green.

## Review

Brain review (Opus 5.5): Mechanical and exact. The version is 0.9.68 in all three places, the changelog heading is dated with an em dash and the rest of the file is untouched, and the upgrading section sits above 0.9.66 to 0.9.67 with the paragraph word for word.
