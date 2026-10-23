---
id: MOD-116
title: 0.9.19: the version named in its four places, the CHANGELOG dated, and a "From 0.9.18 to 0.9.19" section in docs/upgrading.md
domain: mod
tier: economy
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, docs/upgrading.md]
forbid: [docs/cards/**, docs/install.md, docs/guide.md, docs/contracts.md, docs/review-and-merge.md, docs/configuration.md, docs/spend.md, docs/internals.md, docs/how-it-works.md, docs/evidence.md, docs/evidence/**, docs/chassis-delegation.png, hooks/register.ts, hooks/templates/**, bin/**, tests/**, .chassis-delegation.json]
red_test: bump MOD_VERSION in hooks/lib/version.ts to 0.9.19 first and run the node suite (node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs): tests/node/version.node.mjs fails on the manifest, the README and the CHANGELOG still naming 0.9.18, and tests/node/docs.node.mjs fails on docs/upgrading.md having no From … to 0.9.19 section; save that run as the red evidence, then bring the rest into line; red first
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

MOD-114 (the effort nudge on the rows, issue #201) sits under CHANGELOG "Unreleased" since v0.9.18. It ships as the next patch so sessions pick it up with /delegation update and a restart.

## Done when

- hooks/lib/version.ts exports MOD_VERSION = '0.9.19'. .claude-plugin/plugin.json says "version": "0.9.19", and nothing else in the manifest changes. README.md's last line says "Version 0.9.19, MIT." The CHANGELOG's "## Unreleased" heading becomes "## 0.9.19 — 2026-10-23"; its entry stays unchanged, and no empty Unreleased section is left behind.
- docs/upgrading.md gains "### From 0.9.18 to 0.9.19" directly above "### From 0.9.17 to 0.9.18", in the short shape the other sections use, with exactly three lines: "Nothing to do."; "Optional: the effort nudge reads `cards/**` by default; if your cards live elsewhere (the default `cardDir` is `agents/tasks`), set `effortNudge` in `.chassis-delegation.json`, e.g. `{\"effortNudge\": {\"cards\": \"agents/tasks/**\"}}`; `\"cards\": \"\"` turns it off."; and "Detail: [CHANGELOG 0.9.19](../CHANGELOG.md)."
- Nothing else changes. No machine paths, user names, or product names. tests/node/version.node.mjs and tests/node/docs.node.mjs are green, and the three gates pass.

## Review

Attempt 1 (haiku) accepted. The red run is the node suite after the version bump alone, failing on version.node.mjs (manifest, README and CHANGELOG still 0.9.18) and docs.node.mjs (no From 0.9.18 to 0.9.19 section). The diff sets the version in its four places, dates the CHANGELOG as 0.9.19 — 2026-10-23 with its entry unchanged, and adds the From 0.9.18 to 0.9.19 section: Nothing to do, the optional effortNudge cards glob for a card folder outside cards/, and the CHANGELOG link. Gates green: validate, node 987/0, plugin 1496/0. No names, no machine paths.
