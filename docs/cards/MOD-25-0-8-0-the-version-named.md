---
id: MOD-25
title: 0.8.0: the version named in its four places, the CHANGELOG dated, and a README "From 0.7.0 to 0.8.0" section that tells the brain what changed, the verdict word first
domain: mod
tier: standard
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, tests/**]
forbid: [.claude-plugin/types/**, .chassis-delegation.json, docs/**, hooks/register.ts, hooks/types/**, bin/**]
red_test: bump MOD_VERSION in hooks/lib/version.ts to 0.8.0 first and run the node suite: tests/node/version.node.mjs fails on the manifest, the README and the CHANGELOG still naming 0.7.0; save that run as the red evidence, then bring the other three into line; red first
gate: validate, node, test
budget: 2-attempts
spend: 5
---
## Why

Every open public issue (#1, #2, #24, #32, #33) is fixed on main under CHANGELOG "Unreleased", along with MOD-15 (a verdict wakes the brain), MOD-18 (the debrief's proposals and posting defaults) and MOD-20 (gates do not false-refute under load). The verdict word changed from verified to consistent (read both until 0.9.0), the report and brief grammars gained fields, and the card tool gained repo, resources and lanes, so this is a minor bump. Sessions upgrade with /delegation update, which prints the CHANGELOG slice newer than their version; the README section is what the brain in each session reads to learn what it will see. A test may pin the version string, so tests/** stays in scope.

## Done when

- hooks/lib/version.ts exports MOD_VERSION = '0.8.0', .claude-plugin/plugin.json says "version": "0.8.0" and nothing else in the manifest changes, README.md says "Version 0.8.0, MIT.", and the CHANGELOG's "## Unreleased" heading becomes "## 0.8.0 — 2026-10-11" with its entries unchanged and no empty Unreleased section left behind
- README.md gains "### From 0.7.0 to 0.8.0" directly above "### From 0.6.1 to 0.7.0", in the same voice and shape: "What the brain will see:" then one bullet per Unreleased entry, bold lead naming the card and public issue; the first bullet is the verdict word (rows now say consistent; scripts reading rows or the ledger should accept both words until 0.9.0; consistent is not a review); then the wake on verdict and the posture line, the reviewer stage (off by default), research cards, resources and lanes, a worker's identity, the settings.json fallback, the debrief's proposals and the empty-redact refusal, and the gate rerun; a closing bullet says the upgrade is /delegation update
- a "What to do" note says what an adopter may want to set: review in the repo file, redact in /config before posting, issueRepo only to send findings somewhere other than the mod's own tracker
- any test that pins the version string derives it from MOD_VERSION; no other change; tests/node/version.node.mjs is green and the three gates pass
