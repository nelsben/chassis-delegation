---
id: MOD-138
title: 0.9.26: the version named in its four places, the CHANGELOG dated, and a "From 0.9.25 to 0.9.26" section in docs/upgrading.md
domain: mod
tier: economy
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, docs/upgrading.md]
forbid: [docs/cards/**, docs/install.md, docs/guide.md, docs/contracts.md, docs/review-and-merge.md, docs/configuration.md, docs/spend.md, docs/internals.md, docs/how-it-works.md, docs/evidence.md, docs/evidence/**, docs/chassis-delegation.png, hooks/register.ts, hooks/templates/**, bin/**, tests/**, .chassis-delegation.json]
red_test: bump MOD_VERSION in hooks/lib/version.ts to 0.9.26 first and run the node suite (node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs): tests/node/version.node.mjs fails on the manifest, the README and the CHANGELOG still naming 0.9.25, and tests/node/docs.node.mjs fails on docs/upgrading.md having no From … to 0.9.26 section; save that run as the red evidence, then bring the rest into line; red first
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

MOD-135, MOD-136 and MOD-137 (the brief found on the manual route, merged tasks staying closed, and the review-note debrief with debriefMode) sit under CHANGELOG "Unreleased" since v0.9.25. They ship as the next patch so sessions pick them up with /delegation update and a restart.

## Done when

- hooks/lib/version.ts exports MOD_VERSION = '0.9.26'. .claude-plugin/plugin.json says "version": "0.9.26", and nothing else in the manifest changes. README.md's last line says "Version 0.9.26, MIT." The CHANGELOG's "## Unreleased" heading becomes "## 0.9.26 — 2026-10-24"; its entries stay unchanged, and no empty Unreleased section is left behind.
- docs/upgrading.md gains "### From 0.9.25 to 0.9.26" directly above "### From 0.9.24 to 0.9.25", in the short shape the other sections use, with exactly three lines: "Nothing to do.", "Optional: the clean-stop debrief now defaults to `debriefMode notes` (a one-line prompt to write a review note, then `/delegation debrief ingest <note.md>`); `/delegation config debriefMode transcript` keeps the background transcript pass." and "Detail: [CHANGELOG 0.9.26](../CHANGELOG.md)."
- Nothing else changes. No machine paths, user names, or product names. tests/node/version.node.mjs and tests/node/docs.node.mjs are green, and the three gates pass.

## Review

Attempt 1 (haiku) accepted. Red is the node suite after the version bump alone. Version in its four places, CHANGELOG dated 0.9.26 — 2026-10-24 with the MOD-135/136/137 entries unchanged, From 0.9.25 to 0.9.26 section with the debriefMode line. Gates green: validate, node 1070/0, plugin 1585/0.
