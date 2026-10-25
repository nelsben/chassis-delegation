---
id: MOD-156
title: 0.9.28: the version named in its four places, the CHANGELOG dated, and a "From 0.9.27 to 0.9.28" section in docs/upgrading.md
domain: mod
tier: economy
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, docs/upgrading.md]
forbid: [docs/cards/**, docs/install.md, docs/guide.md, docs/contracts.md, docs/review-and-merge.md, docs/configuration.md, docs/spend.md, docs/internals.md, docs/how-it-works.md, docs/evidence.md, docs/evidence/**, docs/chassis-delegation.png, hooks/register.ts, hooks/templates/**, bin/**, tests/**, .chassis-delegation.json]
red_test: bump MOD_VERSION in hooks/lib/version.ts to 0.9.28 first and run the node suite (node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs): tests/node/version.node.mjs fails on the manifest, the README and the CHANGELOG still naming 0.9.27, and tests/node/docs.node.mjs fails on docs/upgrading.md having no From … to 0.9.28 section; save that run as the red evidence, then bring the rest into line; red first
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

MOD-152 to MOD-155 (the worktree lock during a verify, the hand-back row's "land after the verdict", the ad hoc owed-row hint and the gateTimeoutMinutes option, all for #246) sit under CHANGELOG "Unreleased" since v0.9.27. They ship as the next patch so sessions pick them up with /delegation update and a restart.

## Done when

- hooks/lib/version.ts exports MOD_VERSION = '0.9.28'. .claude-plugin/plugin.json says "version": "0.9.28", and nothing else in the manifest changes. README.md's last line says "Version 0.9.28, MIT." The CHANGELOG's "## Unreleased" heading becomes "## 0.9.28 — 2026-10-25"; its entries stay unchanged, and no empty Unreleased section is left behind.
- docs/upgrading.md gains "### From 0.9.27 to 0.9.28" directly above "### From 0.9.26 to 0.9.27", in the short shape the other sections use, with exactly four lines: "Nothing to do.", "Changed: while the verifier judges a hand-back the worker's worktree is locked, so `git worktree remove --force` refuses it; land after the verdict (`git worktree unlock <path>` frees one left behind).", "Optional: a repo can set `gateTimeoutMinutes` (whole minutes 1 to 10, default 9) for a long gate." and "Detail: [CHANGELOG 0.9.28](../CHANGELOG.md)."
- Nothing else changes. No machine paths, user names, or product names. tests/node/version.node.mjs and tests/node/docs.node.mjs are green, and the three gates pass.

## Review

Attempt 1 (haiku) accepted. Red is the node suite after the version bump alone (version.node.mjs and docs.node.mjs failing). Version in its four places, CHANGELOG dated 0.9.28 — 2026-10-25 with the MOD-152..MOD-155 entries unchanged, and the From 0.9.27 to 0.9.28 section with the four lines from the card. The worker's first engine run had three 5 s timeouts in untouched tests; its rerun and the verifier's were green.
