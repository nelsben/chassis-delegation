---
id: MOD-302
title: Release 0.9.50 names the version in its three places, dates the changelog, adds the upgrading note
domain: mod
tier: economy
tier_reason: Mechanical release edits three version strings, a changelog heading, one upgrading paragraph, as MOD-290 and MOD-298
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, docs/upgrading.md]
forbid: [hooks/register.ts, hooks/lib/scheduler.ts, hooks/lib/configeff.ts, hooks/lib/configtable.ts, hooks/lib/allow.ts, docs/cards/**]
red_test: none
gate: validate
budget: 2-attempts
spend: 3
---
## Why

Three merged changes sit on main under Unreleased: tree reconcile all (MOD-299), a by-hand verify spending no budget attempt (MOD-300), and a worker resumed after a by-hand verify being judged on its hand-back with an honest verdict wait (MOD-301). Adopters update by version, so the release names 0.9.50 in every place the version is read and tells them what to do.

## Done when

- hooks/lib/version.ts exports MOD_VERSION = '0.9.50'; .claude-plugin/plugin.json has "version": "0.9.50"; README.md's version line reads `Version 0.9.50, MIT.`; grep -rn '0\.9\.49' on those three files finds nothing
- CHANGELOG.md: the `## Unreleased` heading becomes `## 0.9.50 — 2026-11-05`; its Added and Fixed sections and their three bullets (MOD-299, MOD-301, MOD-300) are kept word for word; no new `## Unreleased` heading is added; the `## 0.9.49 — 2026-11-04` section and everything below it are unchanged
- docs/upgrading.md gains a `### From 0.9.49 to 0.9.50` section directly above `### From 0.9.48 to 0.9.49`, one paragraph in the shape of the existing sections, saying: no action needed; `/delegation tree reconcile all [--confirm]` runs reconcile over every open type:epic issue in one report, so stale trees need one command instead of one per epic; a by-hand `dispatch verify=<sha>` no longer spends an attempt of budget=, and a worker resumed after one is judged on its hand-back; the verdict tool says `attempt <n> pending, no verifier running; dispatch verify=<sha>` when nothing is verifying. It ends `Detail: [CHANGELOG 0.9.50](../CHANGELOG.md).`
- No other file changes; the validate gate passes

## Review

Diff read at a3c0472: version 0.9.50 in version.ts, plugin.json and README; CHANGELOG Unreleased heading dated 2026-11-05 with the three bullets untouched; upgrading.md gains the From 0.9.49 to 0.9.50 paragraph in the existing shape. Exactly the five files in scope. First attempt, $0.01.
