---
id: MOD-129
title: 0.9.23: the version named in its four places, the CHANGELOG dated, a "From 0.9.22 to 0.9.23" section in docs/upgrading.md, and the stale dashboardBand line in its Optional row corrected
domain: mod
tier: economy
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, docs/upgrading.md]
forbid: [docs/cards/**, docs/install.md, docs/guide.md, docs/contracts.md, docs/review-and-merge.md, docs/configuration.md, docs/spend.md, docs/internals.md, docs/how-it-works.md, docs/evidence.md, docs/evidence/**, docs/chassis-delegation.png, hooks/register.ts, hooks/templates/**, bin/**, tests/**, .chassis-delegation.json]
red_test: bump MOD_VERSION in hooks/lib/version.ts to 0.9.23 first and run the node suite (node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs): tests/node/version.node.mjs fails on the manifest, the README and the CHANGELOG still naming 0.9.22, and tests/node/docs.node.mjs fails on docs/upgrading.md having no From … to 0.9.23 section; save that run as the red evidence, then bring the rest into line; red first
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

MOD-128 (the rationing meter in the prompt footer, the retired status line, dashboardBand off by default) sits under CHANGELOG "Unreleased" since v0.9.22. It ships as the next patch so sessions pick it up with /delegation update and a restart. The band now defaults off, so the upgrading guide's line saying dashboardBand "turns the band off" is stale.

## Done when

- hooks/lib/version.ts exports MOD_VERSION = '0.9.23'. .claude-plugin/plugin.json says "version": "0.9.23", and nothing else in the manifest changes. README.md's last line says "Version 0.9.23, MIT." The CHANGELOG's "## Unreleased" heading becomes "## 0.9.23 — 2026-10-23"; its two entries stay unchanged, and no empty Unreleased section is left behind.
- docs/upgrading.md gains "### From 0.9.22 to 0.9.23" directly above "### From 0.9.21 to 0.9.22", in the short shape the other sections use, with exactly three lines: "Nothing to do.", "Optional: the footer meter reads the seven-day window by default; `/delegation config ration off` hides it, `ration five_hour` reads the five-hour window, `rationDaily <points>` fixes the daily share. The status line above the prompt is gone and the band is off; `/delegation config dashboardBand on` brings the band back." and "Detail: [CHANGELOG 0.9.23](../CHANGELOG.md)."
- In docs/upgrading.md the existing line that reads "Optional: `dashboardBand` turns the band off, …" says "`dashboardBand` turns the band on (off by default since 0.9.23)" in place of "`dashboardBand` turns the band off"; the rest of that line is unchanged.
- Nothing else changes. No machine paths, user names, or product names. tests/node/version.node.mjs and tests/node/docs.node.mjs are green, and the three gates pass.

## Review

Attempt 1 (haiku) accepted. Red is the node suite after the version bump alone (version.node.mjs, docs.node.mjs). Version in its four places, CHANGELOG dated 0.9.23 — 2026-10-23 with both MOD-128 entries unchanged, From 0.9.22 to 0.9.23 section with the ration and band lines, and the stale dashboardBand Optional line corrected. Gates green: validate, node 1046/0, plugin 1545/0.
