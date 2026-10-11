---
id: MOD-36
title: 0.8.2: the version named in its four places, the CHANGELOG dated, and a README "From 0.8.1 to 0.8.2" section that tells the brain what changed
domain: mod
tier: economy
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, tests/**]
forbid: [.claude-plugin/types/**, .chassis-delegation.json, docs/**, hooks/register.ts, hooks/types/**, bin/**]
red_test: bump MOD_VERSION in hooks/lib/version.ts to 0.8.2 first and run the node suite: tests/node/version.node.mjs fails on the manifest, the README and the CHANGELOG still naming 0.8.1; save that run as the red evidence, then bring the other three into line; red first
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

Five changes sit under CHANGELOG "Unreleased" since v0.8.1: the mod asks whether to post a debrief's findings (postFindings ask | auto | off, MOD-31); after a clean debrief check the mod tells the debrief agent to mark its watermark, and a refute later re-judged consistent at the same sha reads as a false refute (MOD-32); /delegation debrief apply turns the agent's proposals into actions the person approves (MOD-33); per-domain lessons files appended to briefs (MOD-34, public #65); a stale verdict wake is skipped, merges are recorded as accept rows, each ledger row is written once (MOD-35, public #84). Every session that upgrades sees the stale-wake spam stop only once this is tagged and the window reloaded. A test may pin the version string, so tests/** stays in scope.

## Done when

- hooks/lib/version.ts exports MOD_VERSION = '0.8.2', .claude-plugin/plugin.json says "version": "0.8.2" and nothing else in the manifest changes, README.md says "Version 0.8.2, MIT.", and the CHANGELOG's "## Unreleased" heading becomes "## 0.8.2 — 2026-10-11" with its entries unchanged and no empty Unreleased section left behind
- README.md gains "### From 0.8.1 to 0.8.2" directly above "### From 0.8.0 to 0.8.1", in the same voice and shape: "What the brain will see:" then one bullet per Unreleased entry with a bold lead naming the card and public issue, the first bullet being that a verdict wake no longer arrives for a task already merged, and a "What to do" note: set redact in /config before any session posts, and postFindings to auto only after that
- any test that pins the version string derives it from MOD_VERSION; no other change; tests/node/version.node.mjs is green and the three gates pass
