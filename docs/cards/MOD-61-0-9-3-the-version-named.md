---
id: MOD-61
title: 0.9.3: the version named in its four places, the CHANGELOG dated, and a README "From 0.9.2 to 0.9.3" section for issue 117
domain: mod
tier: economy
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, tests/**]
forbid: [.claude-plugin/types/**, .chassis-delegation.json, docs/**, hooks/register.ts, hooks/types/**, bin/**]
red_test: bump MOD_VERSION in hooks/lib/version.ts to 0.9.3 first and run the node suite: tests/node/version.node.mjs fails on the manifest, the README and the CHANGELOG still naming 0.9.2; save that run as the red evidence, then bring the other three into line; red first
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

Two changes sit under CHANGELOG "Unreleased" since v0.9.2, both from issue 117: a state check's red file gets an expected/got marker line and a no-marker red file is checked by hand (MOD-59), and a non-consistent verdict for a merged or accepted task no longer wakes the brain, with sha ancestry counted only for a consistent verdict (MOD-60). Both are additive, so this is a patch bump.

## Done when

- hooks/lib/version.ts exports MOD_VERSION = '0.9.3', .claude-plugin/plugin.json says "version": "0.9.3" and nothing else in the manifest changes, README.md says "Version 0.9.3, MIT.", and the CHANGELOG's "## Unreleased" heading becomes "## 0.9.3 — 2026-10-11" with its entries unchanged and no empty Unreleased section left behind
- README.md gains "### From 0.9.2 to 0.9.3" directly above "### From 0.9.1 to 0.9.2", in the same voice and shape: "What the brain will see:" then one bullet each for: a red test that is a query or state check now ends its red file with an `expected: …; got: …` line, and a red file with no failure marker is advised `check red by hand` instead of a resume that cannot help (MOD-59); a refuted or unverified verdict for a task already merged or accepted no longer wakes the brain, and a worker's sha being on origin/main no longer counts as merged for a verdict that is not consistent, so a refuted hand-back with no commits is never retired as merged (MOD-60); then a "What to do" note: nothing in an existing repo's config needs to change
- any test that pins the version string derives it from MOD_VERSION; no other change; tests/node/version.node.mjs is green and the three gates pass
