---
id: MOD-11
title: 0.6.1: the version named in its four places, the CHANGELOG dated, and a README "From 0.6.0 to 0.6.1" section that tells the brain what changed
domain: mod
tier: standard
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md]
forbid: [.claude-plugin/types/**, .chassis-delegation.json, docs/**, hooks/register.ts, hooks/types/**, tests/**]
red_test: bump MOD_VERSION in hooks/lib/version.ts to 0.6.1 first and run the node suite: tests/node/version.node.mjs fails on the manifest, the README and the CHANGELOG still naming 0.6.0; save that run as the red evidence, then bring the other three into line; red first
gate: validate, node, test
budget: 2-attempts
spend: 5
---
## Why

Six entries sit under CHANGELOG "Unreleased" since v0.6.0 was tagged earlier today: /delegation debrief with scrubbed mod findings (MOD-6), /delegation debrief post with issueRepo and the three gh issue allowlist forms (MOD-7), the issueRepo key in this repo's config, delegateOnly resolving ~, $HOME, $PWD and same-command variables (MOD-8), delegateOnly following cd and judging git commit by repo and staged paths (MOD-9), and the window-bounded, validated debrief with host_findings (MOD-10, public #50). Sessions upgrade with /delegation update, which prints the CHANGELOG slice newer than their version, so the release must be named for that slice to exist. The version is named in four places and tests/node/version.node.mjs holds them equal.

## Done when

- hooks/lib/version.ts exports MOD_VERSION = '0.6.1', .claude-plugin/plugin.json says "version": "0.6.1" and nothing else in the manifest changes, README.md says "Version 0.6.1, MIT.", and the CHANGELOG's "## Unreleased" heading becomes "## 0.6.1 — 2026-10-10" with its entries unchanged and no empty Unreleased section left behind
- README.md gains "### From 0.6.0 to 0.6.1" directly above "### From 0.5.0 to 0.6.0", in the same voice and shape as that section: "What the brain will see:" then one bullet per Unreleased entry saying what changes for the brain in a session, bold lead naming the card and public issue, and a closing bullet saying the upgrade is /delegation update
- no other file changes; tests/node/version.node.mjs is green and the three gates pass
