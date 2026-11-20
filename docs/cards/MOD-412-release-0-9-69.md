---
id: MOD-412
title: "Release 0.9.69: version bumped in three places, the CHANGELOG's Unreleased section becomes the dated 0.9.69 section, upgrading.md gains the 0.9.68 to 0.9.69 section"
domain: mod
tier: economy
tier_reason: Mechanical release touch; MOD-298 through MOD-405 releases shipped on haiku first try
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, docs/upgrading.md]
forbid: [hooks/register.ts, hooks/lib/gaterun.ts, hooks/lib/mergecmd.ts, hooks/templates/**, bin/**, docs/guide.md, docs/internals.md, docs/cards/**, tests/**]
red_test: none
gate: validate
budget: 2-attempts
spend: 3
---
## Why

The test record on merged cards (MOD-406, MOD-407, MOD-411), the red-test warning (MOD-408), the card class by breadth (MOD-409) and the scorecard flags (MOD-410) reach adopters only in a tagged version.

## Done when

- hooks/lib/version.ts, .claude-plugin/plugin.json (the `"version"` value only) and README.md (the `Version 0.9.68, MIT.` line) all say 0.9.69, and nothing else in those files changes.
- In CHANGELOG.md, the heading line `## Unreleased` becomes `## 0.9.69 — 2026-11-20` (em dash). Nothing else in the file changes: every heading and bullet below it stays word for word, in its order, and no `## Unreleased` heading remains.
- docs/upgrading.md gains a section `### From 0.9.68 to 0.9.69` directly above `### From 0.9.67 to 0.9.68`, in the same shape, with this one paragraph word for word: No action needed. A merged card and its PR now carry a `## Testing` section: the planned test, the red test's result, each gate's result line and time, and what the worker ran. Dispatch warns when a card that changes code has no red test; it still goes ahead. A card's class is now sized narrow, mid or wide by the source paths in its scope, so the history line starts again per new class. Detail: [CHANGELOG 0.9.69](../CHANGELOG.md).
- No other file changes.
- The validate gate is green.

## Review

Brain review (Fable 5.2): Mechanical and exact. The version is 0.9.69 in all three places, the changelog heading is dated with an em dash and the rest of the file is untouched, and the upgrading section sits above 0.9.67 to 0.9.68 with the paragraph word for word.
