---
id: MOD-30
title: 0.8.1: the version named in its four places, the CHANGELOG dated, and a README "From 0.8.0 to 0.8.1" section that tells the brain what changed
domain: mod
tier: economy
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, tests/**]
forbid: [.claude-plugin/types/**, .chassis-delegation.json, docs/**, hooks/register.ts, hooks/types/**, bin/**]
red_test: bump MOD_VERSION in hooks/lib/version.ts to 0.8.1 first and run the node suite: tests/node/version.node.mjs fails on the manifest, the README and the CHANGELOG still naming 0.8.0; save that run as the red evidence, then bring the other three into line; red first
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

Four fixes sit under CHANGELOG "Unreleased" since v0.8.0: the debrief prompt carries only the facts inside its window, dated, and a boundary-only window spawns nothing (MOD-26, public #55); files= takes a folder glob and the red claim quotes the line that failed (MOD-27, #56); templates are read once at load, a brief with a leftover marker is refused, and /delegation says when the folder on disk is newer than the code running (MOD-28); the card dry run warns when a forbid matches the card's own scope or done-when (MOD-29, #63). None changes a contract, so this is a patch. Sessions upgrade with /delegation update, which prints this slice. A test may pin the version string, so tests/** stays in scope.

## Done when

- hooks/lib/version.ts exports MOD_VERSION = '0.8.1', .claude-plugin/plugin.json says "version": "0.8.1" and nothing else in the manifest changes, README.md says "Version 0.8.1, MIT.", and the CHANGELOG's "## Unreleased" heading becomes "## 0.8.1 — 2026-10-11" with its entries unchanged and no empty Unreleased section left behind
- README.md gains "### From 0.8.0 to 0.8.1" directly above "### From 0.7.0 to 0.8.0", in the same voice and shape: "What the brain will see:" then one bullet per Unreleased entry, bold lead naming the card and public issue, and a closing bullet that after /delegation update the window must be reloaded for the new code to run (and that /delegation now says so itself)
- any test that pins the version string derives it from MOD_VERSION; no other change; tests/node/version.node.mjs is green and the three gates pass
