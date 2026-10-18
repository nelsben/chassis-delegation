---
id: MOD-103
title: 0.9.17: the version named in its four places, the CHANGELOG dated, and a "From 0.9.16 to 0.9.17" section in docs/upgrading.md
domain: mod
tier: economy
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, docs/upgrading.md]
forbid: [docs/cards/**, docs/install.md, docs/guide.md, docs/contracts.md, docs/review-and-merge.md, docs/configuration.md, docs/spend.md, docs/internals.md, docs/chassis-delegation.png, hooks/register.ts, hooks/lib/allow.ts, hooks/lib/update.ts, hooks/lib/retention.ts, hooks/lib/serial.ts, hooks/lib/attempts.ts, hooks/lib/verify-native.ts, hooks/lib/verify.ts, hooks/lib/waitstate.ts, hooks/templates/**, bin/**, .chassis-delegation.json]
red_test: bump MOD_VERSION in hooks/lib/version.ts to 0.9.17 first and run the node suite: tests/node/version.node.mjs fails on the manifest, the README and the CHANGELOG still naming 0.9.16, and tests/node/docs.node.mjs fails on docs/upgrading.md having no From … to 0.9.17 section; save that run as the red evidence, then bring the rest into line; red first
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

Nine changes sit under CHANGELOG "Unreleased" since v0.9.16: the store-loss fallback, the gate time-limit advice, stale cross-repo briefs, the card tool's gate and forbid fixes, waiting workers, the by-hand verdict docs, cross-repo keys and resumes, cherry-pick retire with multi-id accept, and the marker-less red check. They fix real dogfooding faults (#147, #154, #155, #157-#166), so they ship together as the next patch.

## Done when

- hooks/lib/version.ts exports MOD_VERSION = '0.9.17'. .claude-plugin/plugin.json says "version": "0.9.17", and nothing else in the manifest changes. README.md's last line says "Version 0.9.17, MIT." The CHANGELOG's "## Unreleased" heading becomes "## 0.9.17 — 2026-10-18". Its nine entries are unchanged and in the same order, and no empty Unreleased section is left behind.
- docs/upgrading.md gains "### From 0.9.16 to 0.9.17" directly above "### From 0.9.15 to 0.9.16", in the same voice and shape as that section, with no blank line between bullets. First comes the line "What the brain will see:", then one bullet per CHANGELOG entry in the CHANGELOG's order. Each bullet has a bold lead naming the change and its card id (e.g. "**A card for another repo is counted, resumed and verified as a local one (MOD-97).**"; the docs-only #162 entry has no card id, so its lead names MOD-100), and a body of one to three sentences saying what the brain now sees or can do. Write each body from that CHANGELOG entry; quote a row or command text in backticks only when it appears verbatim in the CHANGELOG entry.
- The section ends with the "What to do:" paragraph copied verbatim from the From 0.9.15 to 0.9.16 section.
- Nothing else changes. No machine paths, user names, repo names other than nelsben/chassis-delegation, or product names appear in the new text. tests/node/version.node.mjs and tests/node/docs.node.mjs are green, and the three gates pass.

## Review

Attempt 1 (haiku) accepted. The red run is the node suite after the version bump alone, failing on version.node.mjs and docs.node.mjs. The diff sets the version in its four places and dates the CHANGELOG with all nine entries unchanged and in order. It adds the From 0.9.16 to 0.9.17 section with one bullet per entry in CHANGELOG order, and its What to do paragraph is identical to the 0.9.16 one; `~/.claude/dev-mods` there is a generic home path already in earlier sections. Gates green: validate, node 966/0, engine 1486/0.
