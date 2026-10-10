---
id: MOD-5
title: 0.6.0: the version named in its four places, the CHANGELOG dated, and a README "From 0.5.0 to 0.6.0" section that tells the brain what changed
domain: mod
tier: standard
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md]
forbid: [.claude-plugin/types/**, .chassis-delegation.json, docs/**, hooks/register.ts, hooks/types/**, tests/**]
red_test: bump MOD_VERSION in hooks/lib/version.ts to 0.6.0 first and run the node suite: tests/node/version.node.mjs fails on the manifest, the README and the CHANGELOG still naming 0.5.0; save that run as the red evidence, then bring the other three into line; red first
gate: validate, node, test
budget: 2-attempts
spend: 5
---
## Why

Everything since v0.5.0 sits under CHANGELOG "Unreleased": the live dashboard and its text fallback (GH-112), alias sightings and the classifier's second opinion (GH-114), escalation only on sha, gate or red refutes (GH-115), the brain's spend priced apart, Fable priced and delegateOnly (GH-113), spend defaults 3/10/25 (GH-116), base= written into a reused brief (MOD-2), one proof of red per task and --verify re-judging (MOD-1), /delegation update (MOD-3) and owed rows that retire (MOD-4). Five or more sessions run older copies and the founder wants one upgrade for all of them; from 0.6.0 on that upgrade is /delegation update, so 0.6.0 must be the version it lands and the README must tell the brain in each session what it will see. The version is named in four places and tests/node/version.node.mjs holds them equal.

## Done when

- hooks/lib/version.ts exports MOD_VERSION = '0.6.0', .claude-plugin/plugin.json says "version": "0.6.0", README.md says "Version 0.6.0, MIT.", and the CHANGELOG's "## Unreleased" heading becomes "## 0.6.0 — 2026-10-10" with its entries unchanged and no empty Unreleased section left behind
- README.md gains "### From 0.5.0 to 0.6.0" directly above "### From 0.4.0 to 0.5.0", in the same voice and shape as that section ("What the brain will see:" then bullets): one bullet per Unreleased entry saying what changes for the brain in a session, bold lead naming the card and public issue, and a closing bullet saying that from 0.6.0 on the upgrade is /delegation update while a 0.5.0 session still follows the hand steps once
- no other file changes; tests/node/version.node.mjs is green and the three gates pass
- the manifest edit is the version field only; the manifest's option declarations are untouched
