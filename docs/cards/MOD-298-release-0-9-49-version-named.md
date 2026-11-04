---
id: MOD-298
title: Release 0.9.49: version named in its three places, changelog dated, upgrading note for the verifier fixes
domain: mod
tier: economy
tier_reason: Mechanical version bump and changelog dating, same shape as the last five releases
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, docs/upgrading.md]
forbid: [hooks/register.ts, hooks/lib/scheduler.ts, hooks/lib/configeff.ts, hooks/lib/configtable.ts, hooks/lib/allow.ts, docs/cards/**]
red_test: none
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

The seven verifier and ledger fixes for issues #388, #389, #390, #392, #393, #397, #398 and #336 are on main under Unreleased. A release names the version so /delegation and the plugin clone can be checked against it.

## Done when

- hooks/lib/version.ts, .claude-plugin/plugin.json and README.md say 0.9.49 and nothing else in them changes
- CHANGELOG.md: the `## Unreleased` heading becomes `## 0.9.49 — <today's date, YYYY-MM-DD>`; its lines are kept word for word, grouped as ### Added (if any) then ### Fixed, in the order they appear
- docs/upgrading.md gains `### From 0.9.48 to 0.9.49` above the 0.9.47 to 0.9.48 section: three or four sentences saying no action is needed, that a rebased head no longer opens an attempt, that a merged task reports merged, and that dispatch takes amend= for brain grants, ending with the CHANGELOG link in the same form as the section below it
- No other file changes; the validate, node and test gates are green

## Review

Brain review: version 0.9.49 in version.ts, plugin.json and README; CHANGELOG Unreleased renamed to 0.9.49 — 2026-11-04 with the Added and Fixed lines unchanged; upgrading.md gains a From 0.9.48 to 0.9.49 section (no action needed; names the rebase, merged-verdict and amend= changes). Same shape as 0.9.48. First attempt, $0.01.
