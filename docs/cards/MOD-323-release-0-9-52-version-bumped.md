---
id: MOD-323
title: Release 0.9.52: version bumped in three places, CHANGELOG Unreleased dated, upgrading.md gains the 0.9.51 to 0.9.52 section
domain: mod
tier: economy
tier_reason: Mechanical release touch; MOD-298, MOD-302 and MOD-320 shipped on haiku first try
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, docs/upgrading.md]
forbid: [hooks/register.ts, hooks/lib/scheduler.ts, hooks/lib/configeff.ts, hooks/lib/configtable.ts, hooks/lib/allow.ts, hooks/lib/identity.ts, docs/cards/**, tests/**]
red_test: none
gate: validate
budget: 2-attempts
spend: 3
---
## Why

MOD-321 and MOD-322 fix workers whose commit the auto-mode classifier refused after the session switched to auto mid-run, a bug another session hit twice today. They sit under `## Unreleased` and reach adopters only in a tagged version.

## Done when

- hooks/lib/version.ts, .claude-plugin/plugin.json and README.md (the `Version 0.9.51, MIT.` line) all say 0.9.52 and nothing else in those files changes.
- CHANGELOG.md: the `## Unreleased` heading becomes `## 0.9.52 — 2026-11-05` (em dash, as the `## 0.9.51 — 2026-11-05` heading below it); both bullets under it stay, in order and unchanged.
- docs/upgrading.md gains a section `### From 0.9.51 to 0.9.52` directly above `### From 0.9.50 to 0.9.51`, in the same shape: one paragraph opening `No action needed.` that says a worker's Bash now runs as typed whenever the session is in auto mode at the time of the call, not only when it was at spawn, and that a host refusal the hooks never saw still latches the worker and makes an uncommitted hand-back read `blocked by environment`; it ends with `Detail: [CHANGELOG 0.9.52](../CHANGELOG.md).`
- No other file changes.
- The validate gate is green.

## Review

Diff read in full: 0.9.52 in version.ts, plugin.json and README; Unreleased dated 0.9.52 — 2026-11-05 with both bullets kept; upgrading.md 0.9.51 to 0.9.52 section in the usual shape ending with the CHANGELOG link. Nothing else changed. Verdict consistent at 7db6736.
