---
id: MOD-151
title: 0.9.27: the version named in its four places, the CHANGELOG dated, and a "From 0.9.26 to 0.9.27" section in docs/upgrading.md
domain: mod
tier: economy
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, docs/upgrading.md]
forbid: [docs/cards/**, docs/install.md, docs/guide.md, docs/contracts.md, docs/review-and-merge.md, docs/configuration.md, docs/spend.md, docs/internals.md, docs/how-it-works.md, docs/evidence.md, docs/evidence/**, docs/chassis-delegation.png, hooks/register.ts, hooks/templates/**, bin/**, tests/**, .chassis-delegation.json]
red_test: bump MOD_VERSION in hooks/lib/version.ts to 0.9.27 first and run the node suite (node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs): tests/node/version.node.mjs fails on the manifest, the README and the CHANGELOG still naming 0.9.26, and tests/node/docs.node.mjs fails on docs/upgrading.md having no From … to 0.9.27 section; save that run as the red evidence, then bring the rest into line; red first
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

MOD-139 to MOD-150 (the worker-sees docs, hedge hints, briefs that follow their card, finish stopping on leftovers, merge checks, dispatch reading the session's own card, the limit source on queued lines, placeholder red-test warnings, verify= reading the newest red, and the three verifier fixes for the manual route) sit under CHANGELOG "Unreleased" since v0.9.26. They ship as the next patch so sessions pick them up with /delegation update and a restart.

## Done when

- hooks/lib/version.ts exports MOD_VERSION = '0.9.27'. .claude-plugin/plugin.json says "version": "0.9.27", and nothing else in the manifest changes. README.md's last line says "Version 0.9.27, MIT." The CHANGELOG's "## Unreleased" heading becomes "## 0.9.27 — 2026-10-25"; its entries stay unchanged, and no empty Unreleased section is left behind.
- docs/upgrading.md gains "### From 0.9.26 to 0.9.27" directly above "### From 0.9.25 to 0.9.26", in the short shape the other sections use, with exactly four lines: "Nothing to do.", "Changed: `/delegation merge --finish` stops when the worktree holds untracked or ignored files the merge does not carry; copy what you need, or pass `--discard`. Dispatch now rewrites a brief the card or `--scope`/`--forbid` changed, so a stale brief no longer needs deleting by hand.", "Optional: a card can name a `merge_check:` command (or a repo `mergeCheckMap` entry per gate id) that merge runs before it rebases." and "Detail: [CHANGELOG 0.9.27](../CHANGELOG.md)."
- Nothing else changes. No machine paths, user names, or product names. tests/node/version.node.mjs and tests/node/docs.node.mjs are green, and the three gates pass.

## Review

Attempt 1 (haiku) accepted. Red is the node suite after the version bump alone (version.node.mjs and docs.node.mjs failing). Version in its four places, CHANGELOG dated 0.9.27 — 2026-10-25 with the MOD-139..MOD-150 entries unchanged, and the From 0.9.26 to 0.9.27 section with the four lines from the card. Gates green in the worktree: validate, node 1116/0, plugin 1637/0.
