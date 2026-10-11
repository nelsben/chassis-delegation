---
id: MOD-58
title: 0.9.2: the version named in its four places, the CHANGELOG dated, and a README "From 0.9.1 to 0.9.2" section for the issue 108 wave
domain: mod
tier: economy
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, tests/**]
forbid: [.claude-plugin/types/**, .chassis-delegation.json, docs/**, hooks/register.ts, hooks/types/**, bin/**]
red_test: bump MOD_VERSION in hooks/lib/version.ts to 0.9.2 first and run the node suite: tests/node/version.node.mjs fails on the manifest, the README and the CHANGELOG still naming 0.9.1; save that run as the red evidence, then bring the other three into line; red first
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

Seven changes sit under CHANGELOG "Unreleased" since v0.9.1, all from issue 108 and its follow-up: stale verdict wakes dropped (MOD-51, MOD-57), bold done-when paths (MOD-52), the fresh-session row and its option freshSessionTokens (MOD-53), the wide-scope warning and economy hint (MOD-54), the forbid-= amend path for a gate failure (MOD-55), and the rate-limited stop (MOD-56). Every one is additive: a new /config option, a new optional ledger field and a new sentence in the brief, so this is a patch bump.

## Done when

- hooks/lib/version.ts exports MOD_VERSION = '0.9.2', .claude-plugin/plugin.json says "version": "0.9.2" and nothing else in the manifest changes, README.md says "Version 0.9.2, MIT.", and the CHANGELOG's "## Unreleased" heading becomes "## 0.9.2 — 2026-10-11" with its entries unchanged and no empty Unreleased section left behind
- README.md gains "### From 0.9.1 to 0.9.2" directly above "### From 0.9.0 to 0.9.1", in the same voice and shape: "What the brain will see:" then one bullet each for: stale verdict wakes no longer arrive after the brain resumed the worker or the task merged (MOD-51, MOD-57); a once-a-session row to start a fresh session past the option freshSessionTokens, default 400K (MOD-53); dispatch warnings for a scope of more than six files and a hint that economy would do for a small card (MOD-54); bold done-when paths no longer warn (MOD-52); a gate failure only a forbidden file can fix comes back with a forbid-= amend for the brain to approve, then resume (MOD-55); a worker stopped by a usage limit reads `no-report (rate limited)` and the queue says held: instead of ready: until the brain spawns again (MOD-56); then a "What to do" note: nothing in an existing repo's config needs to change; set freshSessionTokens to 0 in /config to turn the fresh-session row off
- any test that pins the version string derives it from MOD_VERSION; no other change; tests/node/version.node.mjs is green and the three gates pass
