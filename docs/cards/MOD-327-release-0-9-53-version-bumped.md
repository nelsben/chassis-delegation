---
id: MOD-327
title: Release 0.9.53: version bumped in three places, CHANGELOG gains a dated 0.9.53 section with three bullets, upgrading.md gains the 0.9.52 to 0.9.53 section
domain: mod
tier: economy
tier_reason: Mechanical release touch; MOD-298, 302, 320 and 323 shipped on haiku first try
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, docs/upgrading.md]
forbid: [hooks/register.ts, hooks/lib/choice.ts, hooks/lib/waitstate.ts, hooks/lib/repoconfig.ts, hooks/lib/verdicttool.ts, docs/cards/**, tests/**]
red_test: none
gate: validate
budget: 2-attempts
spend: 3
---
## Why

MOD-324, MOD-325 and MOD-326 fix three problems another session hit: a still-running task treated as merged, spend double-counted after a re-verify, and the pause cap charging long proof runs. They reach adopters only in a tagged version.

## Done when

- hooks/lib/version.ts, .claude-plugin/plugin.json and README.md (the `Version 0.9.52, MIT.` line) all say 0.9.53 and nothing else in those files changes.
- CHANGELOG.md gains, directly above `## 0.9.52 — 2026-11-05`, a section `## 0.9.53 — 2026-11-06` (em dash) with `### Added` holding one bullet and `### Fixed` holding two, each a `- ` bullet wrapped in `**…**` like the 0.9.52 bullets. The three bullet texts, word for word (the backticks around pauseCap and merged are literal markdown code spans):
  - Added: **A repo-file key `pauseCap` (a whole number from 2 to 20, default 3) sets how many pauses an attempt may take before the next is charged as an attempt, so repos whose proof runs outlast two pauses can raise it; any other value is named in the config errors and 3 is used (MOD-326).**
  - Fixed: **A `merged` mark on an attempt that recorded no dispatch base (spawned before 0.9.51) is cleared when its commit's committer time predates the attempt's spawn, and the retire check skips such a commit, so a still-running task is no longer treated as merged and its hand-back is verified (MOD-324).**
  - Fixed: **Spend in the pair history and the adaptive suggestion counts one row per kind, subtask and attempt: a refuted verdict followed by a consistent re-verify of the same attempt no longer doubles that attempt's usd (MOD-325).**
- docs/upgrading.md gains a section `### From 0.9.52 to 0.9.53` directly above `### From 0.9.51 to 0.9.52`, in the same shape: one paragraph opening `No action needed.` that says a task whose attempt predates 0.9.51 and was wrongly marked merged is cleared at its next hand-back, spend history no longer double-counts a re-verified attempt, and a repo whose workers pause on long runs may set `pauseCap` in its repo file; it ends with `Detail: [CHANGELOG 0.9.53](../CHANGELOG.md).`
- No other file changes.
- The validate gate is green.

## Review

Diff read in full: 0.9.53 in version.ts, plugin.json and README; CHANGELOG 0.9.53 — 2026-11-06 with the three bullets word for word; upgrading.md 0.9.52 to 0.9.53 section in the usual shape. Nothing else changed.
