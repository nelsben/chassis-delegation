---
id: MOD-113
title: 0.9.18: the version named in its four places, the CHANGELOG dated, and a "From 0.9.17 to 0.9.18" section in docs/upgrading.md
domain: mod
tier: economy
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, docs/upgrading.md]
forbid: [docs/cards/**, docs/install.md, docs/guide.md, docs/contracts.md, docs/review-and-merge.md, docs/configuration.md, docs/spend.md, docs/internals.md, docs/how-it-works.md, docs/evidence.md, docs/evidence/**, docs/chassis-delegation.png, hooks/register.ts, hooks/templates/**, bin/**, tests/**, .chassis-delegation.json]
red_test: bump MOD_VERSION in hooks/lib/version.ts to 0.9.18 first and run the node suite (node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs): tests/node/version.node.mjs fails on the manifest, the README and the CHANGELOG still naming 0.9.17, and tests/node/docs.node.mjs fails on docs/upgrading.md having no From … to 0.9.18 section; save that run as the red evidence, then bring the rest into line; red first
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

Three changes sit under CHANGELOG "Unreleased" since v0.9.17: the how-it-works diagrams, bin/evidence.mjs, and the docs overhaul with the evidence page and the new README. They ship together as the next patch so adopters get the shorter docs and can chart their own ledgers.

## Done when

- hooks/lib/version.ts exports MOD_VERSION = '0.9.18'. .claude-plugin/plugin.json says "version": "0.9.18", and nothing else in the manifest changes. README.md's last line says "Version 0.9.18, MIT." The CHANGELOG's "## Unreleased" heading becomes "## 0.9.18 — 2026-10-19". Its three entries stay unchanged and in the same order, and no empty Unreleased section is left behind.
- docs/upgrading.md gains "### From 0.9.17 to 0.9.18" directly above "### From 0.9.16 to 0.9.17", in the short shape the other sections use. It has exactly three lines: "Nothing to do."; "Optional: chart your own ledgers with `node bin/evidence.mjs <ledger.jsonl>... > summary.json`, then `node bin/evidence-charts.mjs summary.json <outdir>`."; and "Detail: [CHANGELOG 0.9.18](../CHANGELOG.md)."
- Nothing else changes. No machine paths, user names, or product names. tests/node/version.node.mjs and tests/node/docs.node.mjs are green, and the three gates pass.

## Review

Attempt 1 (haiku) accepted. The red run is the node suite after the version bump alone, failing on version.node.mjs (manifest, README and CHANGELOG still 0.9.17) and docs.node.mjs (no From 0.9.17 to 0.9.18 section). The diff sets the version in its four places, dates the CHANGELOG as 0.9.18 — 2026-10-19 with its three entries unchanged and in order, and adds the From 0.9.17 to 0.9.18 section in the new short shape: Nothing to do, the optional evidence commands, and the CHANGELOG link. Gates green in the worktree: validate, node 982/0, engine 1486/0. No names, no machine paths.
