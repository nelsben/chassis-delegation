---
id: MOD-378
title: Release 0.9.62: version bumped in three places, the CHANGELOG's Unreleased section becomes the dated 0.9.62 section, upgrading.md gains the 0.9.61 to 0.9.62 section
domain: mod
tier: economy
tier_reason: Mechanical release touch; MOD-298, 302, 320, 323, 327, 330, 346, 352, 355, 360, 363, 370 and 371 shipped on haiku first try
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, docs/upgrading.md]
forbid: [hooks/register.ts, hooks/lib/spike.ts, hooks/lib/gaterun.ts, hooks/templates/**, bin/**, docs/guide.md, docs/internals.md, docs/cards/**, tests/**]
red_test: none
gate: validate
budget: 2-attempts
spend: 3
---
## Why

Spike cards (MOD-372, 373, 374), the outside-listing fix (MOD-375), the files-refute re-judge advice (MOD-376) and the gate deadline and output tail (MOD-377) reach adopters only in a tagged version.

## Done when

- hooks/lib/version.ts, .claude-plugin/plugin.json (the `"version"` value only) and README.md (the `Version 0.9.61, MIT.` line) all say 0.9.62, and nothing else in those files changes.
- In CHANGELOG.md the heading line `## Unreleased` becomes `## 0.9.62 — 2026-11-15` (em dash). Nothing else in the file changes: every heading and bullet below it stays word for word, in its order, and no `## Unreleased` heading remains.
- docs/upgrading.md gains a section `### From 0.9.61 to 0.9.62` directly above `### From 0.9.60 to 0.9.61`, in the same shape, with this one paragraph word for word: No action needed. A card can now be a spike: `purpose: spike` with a `findings:` file in scope, a `## Questions` list, `red_test: none` and `gate: findings`; the worker writes a cited findings file and the built-in `findings` gate checks it at verify and at merge (see Spike cards in the guide). A build card's `spike: <ID>` records the spike it came from on its ledger rows. Every gate command now runs with `CHASSIS_GATE_DEADLINE`, the whole seconds until `gateTimeoutMinutes`, so a long gate can stop its own children and exit before the ceiling; a gate stopped at the ceiling names its last output in the verdict. A refute on `files=` alone with the gate green now advises `dispatch verify=<sha>`, which spends no attempt. A folder outside the repo that grows past 10000 files during a run is now judged at hand-back, not left unchecked. Detail: [CHANGELOG 0.9.62](../CHANGELOG.md).
- No other file changes.
- The validate gate is green.

## Review

Brain review (Opus 5.5): Mechanical and exact. The version is 0.9.62 in all three places, and the changelog heading is dated with an em dash, the rest of the file untouched. The upgrading section sits above 0.9.60 to 0.9.61 with the paragraph word for word.
