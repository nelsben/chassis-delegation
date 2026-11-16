---
id: MOD-398
title: "Release 0.9.66: version bumped in three places, the CHANGELOG's Unreleased section becomes the dated 0.9.66 section, upgrading.md gains the 0.9.65 to 0.9.66 section"
domain: mod
tier: economy
tier_reason: Mechanical release touch; MOD-298 through MOD-394 releases shipped on haiku first try
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, docs/upgrading.md]
forbid: [hooks/register.ts, hooks/lib/gaterun.ts, hooks/lib/mergecmd.ts, hooks/templates/**, bin/**, docs/guide.md, docs/internals.md, docs/cards/**, tests/**]
red_test: none
gate: validate
budget: 2-attempts
spend: 3
---
## Why

The Work pane's heading and folded notes (MOD-395), the stack-mode Column select (MOD-396) and the type icons (MOD-397) reach adopters only in a tagged version.

## Done when

- hooks/lib/version.ts, .claude-plugin/plugin.json (the `"version"` value only) and README.md (the `Version 0.9.65, MIT.` line) all say 0.9.66, and nothing else in those files changes.
- In CHANGELOG.md, the heading line `## Unreleased` becomes `## 0.9.66 — 2026-11-16` (em dash). Nothing else in the file changes: every heading and bullet below it stays word for word, in its order, and no `## Unreleased` heading remains.
- docs/upgrading.md gains a section `### From 0.9.65 to 0.9.66` directly above `### From 0.9.64 to 0.9.65`, in the same shape, with this one paragraph word for word: No action needed. The Work pane's toolbar starts with a bold Work heading, and its notes fold behind one dim `N notes · show` line. Below 100 columns the board shows one column per lane, picked with a Column select (Working at first); mobile still stacks every column. On the desktop, the editor and mobile, each item type is drawn as a small coloured icon; the terminal keeps its glyphs. Detail: [CHANGELOG 0.9.66](../CHANGELOG.md).
- No other file changes.
- The validate gate is green.

## Review

Brain review (Opus 5.5): Mechanical and exact. The version is 0.9.66 in all three places, and the changelog heading is dated with an em dash, the rest of the file untouched. The upgrading section sits above 0.9.64 to 0.9.65 with the paragraph word for word.
