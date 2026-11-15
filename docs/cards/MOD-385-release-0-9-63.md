---
id: MOD-385
title: Release 0.9.63: version bumped in three places, the CHANGELOG's Unreleased section becomes the dated 0.9.63 section, upgrading.md gains the 0.9.62 to 0.9.63 section
domain: mod
tier: economy
tier_reason: Mechanical release touch; MOD-298 through MOD-378 releases shipped on haiku first try
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, docs/upgrading.md]
forbid: [hooks/register.ts, hooks/lib/gaterun.ts, hooks/lib/mergecmd.ts, hooks/templates/**, bin/**, docs/guide.md, docs/internals.md, docs/cards/**, tests/**]
red_test: none
gate: validate
budget: 2-attempts
spend: 3
---
## Why

The gate cap (MOD-379), the late-report judging (MOD-380), the small fixes (MOD-381) and the local-base refusal (MOD-382) reach adopters only in a tagged version.

## Done when

- hooks/lib/version.ts, .claude-plugin/plugin.json (the `"version"` value only) and README.md (the `Version 0.9.62, MIT.` line) all say 0.9.63, and nothing else in those files changes.
- In CHANGELOG.md the heading line `## Unreleased` becomes `## 0.9.63 — 2026-11-15` (em dash). Nothing else in the file changes: every heading and bullet below it stays word for word, in its order, and no `## Unreleased` heading remains.
- docs/upgrading.md gains a section `### From 0.9.62 to 0.9.63` directly above `### From 0.9.61 to 0.9.62`, in the same shape, with this one paragraph word for word: No action needed. A new repo option, `maxConcurrentGates` (0 to 16, default 0, no cap), caps how many gate commands the verifier and merge run at once in a session; the rest wait in line and the wait does not count against `gateTimeoutMinutes`. Set it to 1 or 2 in a repo whose gate slows down when several run together. A worker that hands back a report after a `no-report` on the same attempt is now judged on that attempt, uncharged. Merge now refuses a `baseRef` that is a local branch with no copy on origin and says to push it first, where before it went on toward main. Detail: [CHANGELOG 0.9.63](../CHANGELOG.md).
- No other file changes.
- The validate gate is green.

## Review

Brain review (Opus 5.5): Mechanical and exact. The version is 0.9.63 in all three places, and the changelog heading is dated with an em dash, the rest of the file untouched. The upgrading section sits above 0.9.61 to 0.9.62 with the paragraph word for word.
