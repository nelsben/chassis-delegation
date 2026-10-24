---
id: MOD-134
title: 0.9.25: the version named in its four places, the CHANGELOG dated, and a "From 0.9.24 to 0.9.25" section in docs/upgrading.md
domain: mod
tier: economy
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, docs/upgrading.md]
forbid: [docs/cards/**, docs/install.md, docs/guide.md, docs/contracts.md, docs/review-and-merge.md, docs/configuration.md, docs/spend.md, docs/internals.md, docs/how-it-works.md, docs/evidence.md, docs/evidence/**, docs/chassis-delegation.png, hooks/register.ts, hooks/templates/**, bin/**, tests/**, .chassis-delegation.json]
red_test: bump MOD_VERSION in hooks/lib/version.ts to 0.9.25 first and run the node suite (node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs): tests/node/version.node.mjs fails on the manifest, the README and the CHANGELOG still naming 0.9.24, and tests/node/docs.node.mjs fails on docs/upgrading.md having no From … to 0.9.25 section; save that run as the red evidence, then bring the rest into line; red first
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

MOD-133 (the ration health bar in the band above the prompt, the footer label removed) sits under CHANGELOG "Unreleased" since v0.9.24. It ships as the next patch so sessions pick it up with /delegation update and a restart.

## Done when

- hooks/lib/version.ts exports MOD_VERSION = '0.9.25'. .claude-plugin/plugin.json says "version": "0.9.25", and nothing else in the manifest changes. README.md's last line says "Version 0.9.25, MIT." The CHANGELOG's "## Unreleased" heading becomes "## 0.9.25 — 2026-10-24"; its entry stays unchanged, and no empty Unreleased section is left behind.
- docs/upgrading.md gains "### From 0.9.24 to 0.9.25" directly above "### From 0.9.23 to 0.9.24", in the short shape the other sections use, with exactly three lines: "Nothing to do.", "Optional: the ration bar now sits in the band above the prompt whenever the window has a reading; `/delegation config ration off` hides it, `dashboardBand on` adds the worker line under it." and "Detail: [CHANGELOG 0.9.25](../CHANGELOG.md)."
- Nothing else changes. No machine paths, user names, or product names. tests/node/version.node.mjs and tests/node/docs.node.mjs are green, and the three gates pass.

## Review

Attempt 1 (haiku) accepted. Red is the node suite after the version bump alone. Version in its four places, CHANGELOG dated 0.9.25 — 2026-10-24 with the MOD-133 entry unchanged, From 0.9.24 to 0.9.25 section with the band line. Gates green: validate, node 1059/0, plugin 1566/0.
