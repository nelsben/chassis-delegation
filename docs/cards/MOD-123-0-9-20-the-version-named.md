---
id: MOD-123
title: 0.9.20: the version named in its four places, the CHANGELOG dated, and a "From 0.9.19 to 0.9.20" section in docs/upgrading.md
domain: mod
tier: economy
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, docs/upgrading.md]
forbid: [docs/cards/**, docs/install.md, docs/guide.md, docs/contracts.md, docs/review-and-merge.md, docs/configuration.md, docs/spend.md, docs/internals.md, docs/how-it-works.md, docs/evidence.md, docs/evidence/**, docs/chassis-delegation.png, hooks/register.ts, hooks/templates/**, bin/**, tests/**, .chassis-delegation.json]
red_test: bump MOD_VERSION in hooks/lib/version.ts to 0.9.20 first and run the node suite (node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs): tests/node/version.node.mjs fails on the manifest, the README and the CHANGELOG still naming 0.9.19, and tests/node/docs.node.mjs fails on docs/upgrading.md having no From … to 0.9.20 section; save that run as the red evidence, then bring the rest into line; red first
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

Six fixes (MOD-117 to MOD-122: per-repo store keys, merge targeting the base branch, the gate line and scratch red logs, gateMap _empty, the polling-row key, and the nudge default) sit under CHANGELOG "Unreleased" since v0.9.19. They ship as the next patch so sessions pick them up with /delegation update and a restart.

## Done when

- hooks/lib/version.ts exports MOD_VERSION = '0.9.20'. .claude-plugin/plugin.json says "version": "0.9.20", and nothing else in the manifest changes. README.md's last line says "Version 0.9.20, MIT." The CHANGELOG's "## Unreleased" heading becomes "## 0.9.20 — 2026-10-23"; its entries stay unchanged, and no empty Unreleased section is left behind.
- docs/upgrading.md gains "### From 0.9.19 to 0.9.20" directly above "### From 0.9.18 to 0.9.19", in the short shape the other sections use, with exactly four lines: "Nothing to do, unless two repos on this machine reuse card ids: the store splits per-task keys by repo on the first session start; check that `/delegation` shows attempt 1/N on a fresh card."; "Optional: the effort nudge now reads your card folder by default, so an `effortNudge.cards` set only to match `cardDir` can go."; "Optional: `gateMap._empty` names a gate id to run when a hand-back changes no files."; and "Detail: [CHANGELOG 0.9.20](../CHANGELOG.md)."
- Nothing else changes. No machine paths, user names, or product names. tests/node/version.node.mjs and tests/node/docs.node.mjs are green, and the three gates pass.

## Review

Attempt 1 (haiku) accepted. The red run is the node suite after the version bump alone, failing on version.node.mjs (manifest, README and CHANGELOG still 0.9.19) and docs.node.mjs (no From 0.9.19 to 0.9.20 section). The diff sets the version in its four places, dates the CHANGELOG as 0.9.20 — 2026-10-23 with its entries unchanged, and adds the From 0.9.19 to 0.9.20 section: the per-repo store split on first start, the nudge default following the card folder, gateMap._empty, and the CHANGELOG link. Gates green: validate, node 1012/0, plugin 1526/0. No names, no machine paths.
