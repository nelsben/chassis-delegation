---
id: MOD-43
title: 0.8.3: the version named in its four places, the CHANGELOG dated, and a README "From 0.8.2 to 0.8.3" section that tells the brain what changed
domain: mod
tier: economy
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, tests/**]
forbid: [.claude-plugin/types/**, .chassis-delegation.json, docs/**, hooks/register.ts, hooks/types/**, bin/**]
red_test: bump MOD_VERSION in hooks/lib/version.ts to 0.8.3 first and run the node suite: tests/node/version.node.mjs fails on the manifest, the README and the CHANGELOG still naming 0.8.2; save that run as the red evidence, then bring the other three into line; red first
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

Six changes sit under CHANGELOG "Unreleased" since v0.8.2: the session's money figures count only its own attempts plus ad hoc and unattributed (MOD-37, public issue 91); the debrief check accepts a correction the transcript holds (MOD-38, issue 90); the mod's own correction detector catches pushback and challenge questions (MOD-39, issue 89); a card frontmatter value with a space and a hash is no longer cut (MOD-40); a worker resumed after a consistent verdict is judged again (MOD-41); a verdict wake re-checks merged at delivery (MOD-42). The last two end the stale wakes the founder reported, so every session should get this. A test may pin the version string, so tests/** stays in scope.

## Done when

- hooks/lib/version.ts exports MOD_VERSION = '0.8.3', .claude-plugin/plugin.json says "version": "0.8.3" and nothing else in the manifest changes, README.md says "Version 0.8.3, MIT.", and the CHANGELOG's "## Unreleased" heading becomes "## 0.8.3 — 2026-10-11" with its entries unchanged and no empty Unreleased section left behind
- README.md gains "### From 0.8.2 to 0.8.3" directly above "### From 0.8.1 to 0.8.2", in the same voice and shape: "What the brain will see:" then one bullet per Unreleased entry with a bold lead naming the card and public issue, the first bullet being that a verdict wake for a task merged before it is delivered no longer arrives
- any test that pins the version string derives it from MOD_VERSION; no other change; tests/node/version.node.mjs is green and the three gates pass
