---
id: MOD-290
title: Release 0.9.48: version named in its three places, changelog dated, upgrading note for the tree changes
domain: mod
tier: economy
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, docs/upgrading.md]
forbid: [hooks/register.ts, hooks/lib/scheduler.ts, hooks/lib/configeff.ts, hooks/lib/configtable.ts, hooks/lib/allow.ts, docs/cards/**]
red_test: none
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

The 0.9.48 cards (nesting order, setup tree checks, ancestor closes at finish, issue match, tree reconcile, the adoption guide) are merged on main under CHANGELOG.md Unreleased. The release names the version in its three places, dates the changelog and tells adopters what to do.

## Done when

- hooks/lib/version.ts, .claude-plugin/plugin.json and README.md (where the version is shown, if it is) all say 0.9.48; nothing else in those files changes.
- CHANGELOG.md: the Unreleased heading becomes `## 0.9.48 — <today's date, ISO>`; its lines are grouped under `### Added` (setup tree checks, issue match and the issueMatch option, tree reconcile, the adoption guide section) and `### Changed` (nesting order enforced at filing, finish closes ancestors), in that order, each line kept as written by its card; no line is dropped or reworded beyond the grouping.
- docs/upgrading.md gains `### From 0.9.47 to 0.9.48`: run /delegation setup once per repo that uses the issue tree and act on its Tree lines; the issueMatch option defaults to suggest (set `off` to silence, `require` to refuse); trees filed from now on must be in the order epic, feature, story, task (existing trees are untouched); finish now closes ancestors too, so run `tree reconcile <n>` once on stale trees.
- No other file changes.

## Review

Brain review: version 0.9.48 in version.ts, plugin.json and README; CHANGELOG Unreleased became 0.9.48 — 2026-11-04 with Added (285, 287, 288, 289) then Changed (284, 286), lines unchanged; upgrading.md gains From 0.9.47 to 0.9.48 (setup Tree lines, issueMatch default, filing order, reconcile). Only the five scope files. First attempt, $0.02.
