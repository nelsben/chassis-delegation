---
id: MOD-401
title: "Release 0.9.67: version bumped in three places, the CHANGELOG's Unreleased section becomes the dated 0.9.67 section, upgrading.md gains the 0.9.66 to 0.9.67 section"
domain: mod
tier: economy
tier_reason: Mechanical release touch; MOD-298 through MOD-398 releases shipped on haiku first try
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, docs/upgrading.md]
forbid: [hooks/register.ts, hooks/lib/gaterun.ts, hooks/lib/mergecmd.ts, hooks/templates/**, bin/**, docs/guide.md, docs/internals.md, docs/cards/**, tests/**]
red_test: none
gate: validate
budget: 2-attempts
spend: 3
---
## Why

The type-check clean-up (MOD-400) reaches adopters only in a tagged version.

## Done when

- hooks/lib/version.ts, .claude-plugin/plugin.json (the `"version"` value only) and README.md (the `Version 0.9.66, MIT.` line) all say 0.9.67, and nothing else in those files changes.
- In CHANGELOG.md, the heading line `## Unreleased` becomes `## 0.9.67 — 2026-11-18` (em dash). Nothing else in the file changes: every heading and bullet below it stays word for word, in its order, and no `## Unreleased` heading remains.
- docs/upgrading.md gains a section `### From 0.9.66 to 0.9.67` directly above `### From 0.9.65 to 0.9.66`, in the same shape, with this one paragraph word for word: No action needed. From engine 2.1.323 on, `claude plugin validate` type-checks the mod's hooks and tests, and it now reports no type error. Nothing changes at runtime. Detail: [CHANGELOG 0.9.67](../CHANGELOG.md).
- No other file changes.
- The validate gate is green.

## Review

Brain review (Opus 5.5): Mechanical and exact. The version is 0.9.67 in all three places, and the changelog heading is dated with an em dash, the rest of the file untouched. The upgrading section sits above 0.9.65 to 0.9.66 with the paragraph word for word.
