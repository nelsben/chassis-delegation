---
id: MOD-14
title: 0.7.0: the version named in its four places, the CHANGELOG dated, and a README "From 0.6.1 to 0.7.0" section that tells the brain the spawn contract changed
domain: mod
tier: standard
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, tests/**]
forbid: [.claude-plugin/types/**, .chassis-delegation.json, docs/**, hooks/register.ts, hooks/types/**]
red_test: bump MOD_VERSION in hooks/lib/version.ts to 0.7.0 first and run the node suite: tests/node/version.node.mjs fails on the manifest, the README and the CHANGELOG still naming 0.6.1; save that run as the red evidence, then bring the other three into line; red first
gate: validate, node, test
budget: 2-attempts
spend: 5
---
## Why

Two entries sit under CHANGELOG "Unreleased" since v0.6.1: the brain spawns and the mod shapes (MOD-12, public #22: dispatch prints an Agent call the brain makes, the queue and the ladder are advice, autoEscalate performs resumes only) and workers under the mod's hooks (MOD-13: the git guard names a worker's task, the spend ceiling stops a worker at twice its ceiling, effortByTier). The spawn contract changed, so this is a minor bump, not a patch. Sessions upgrade with /delegation update, which prints the CHANGELOG slice newer than their version; the brain in each session must learn that dispatch no longer spawns and that it makes the printed Agent call itself. The version is named in four places and tests/node/version.node.mjs holds them equal; a test may pin the version string, so tests/** stays in scope.

## Done when

- hooks/lib/version.ts exports MOD_VERSION = '0.7.0', .claude-plugin/plugin.json says "version": "0.7.0" and nothing else in the manifest changes, README.md says "Version 0.7.0, MIT.", and the CHANGELOG's "## Unreleased" heading becomes "## 0.7.0 — 2026-10-11" with its entries unchanged and no empty Unreleased section left behind
- README.md gains "### From 0.6.1 to 0.7.0" directly above "### From 0.6.0 to 0.6.1", in the same voice and shape: "What the brain will see:" then one bullet per Unreleased entry saying what changes for the brain in a session — the first bullet says plainly that dispatch now prints an Agent call and the brain makes it verbatim, that a hand-back's ready: line means make the next call, and that a respawn verdict prints the call instead of starting it — and a closing bullet saying the upgrade is /delegation update
- any test that pins the version string derives it from MOD_VERSION instead; no other change; tests/node/version.node.mjs is green and the three gates pass
