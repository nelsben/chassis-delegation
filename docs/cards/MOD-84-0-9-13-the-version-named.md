---
id: MOD-84
title: 0.9.13: the version named in its four places, the CHANGELOG dated, and a "From 0.9.12 to 0.9.13" section in docs/upgrading.md
domain: mod
tier: economy
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, docs/upgrading.md]
forbid: [docs/cards/**, docs/install.md, docs/guide.md, docs/contracts.md, docs/review-and-merge.md, docs/configuration.md, docs/spend.md, docs/internals.md, docs/chassis-delegation.png, hooks/register.ts, hooks/lib/allow.ts, hooks/lib/update.ts, hooks/templates/**, bin/**, .chassis-delegation.json]
red_test: bump MOD_VERSION in hooks/lib/version.ts to 0.9.13 first and run the node suite: tests/node/version.node.mjs fails on the manifest, the README and the CHANGELOG still naming 0.9.12, and tests/node/docs.node.mjs fails on docs/upgrading.md having no From … to 0.9.13 section; save that run as the red evidence, then bring the rest into line; red first
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

One change sits under CHANGELOG "Unreleased" since v0.9.12: MOD-83 makes the README a short front door and moves the reference and the upgrade notes, text unchanged, into eight pages under docs/. It ships as the next patch, and it is the first release whose upgrade notes live in docs/upgrading.md.

## Done when

- hooks/lib/version.ts exports MOD_VERSION = '0.9.13'. .claude-plugin/plugin.json says "version": "0.9.13", and nothing else in the manifest changes. README.md's last line says "Version 0.9.13, MIT." The CHANGELOG's "## Unreleased" heading becomes "## 0.9.13 — 2026-10-16". Its one entry is unchanged, and no empty Unreleased section is left behind.
- docs/upgrading.md gains "### From 0.9.12 to 0.9.13" directly above "### From 0.9.11 to 0.9.12", in the same voice and shape: first "What the brain will see:"; then one bullet with the bold lead "The README is a front door (MOD-83)." and a body saying that README.md is now a short page (what the mod is, install in three lines, a list of pages), the reference moved with its text unchanged into eight pages under docs/, and `/delegation update` now ends its changelog lines with `docs/upgrading.md: From <old> to <new>` where it used to say `README: …`; a bookmark to an old README anchor now opens the README's top, and the section is on the docs page of the same heading; then "What to do:" the same paragraph as the 0.9.12 section's "What to do:" paragraph, verbatim.
- Nothing else changes. tests/node/version.node.mjs and tests/node/docs.node.mjs are green, and the three gates pass.

## Review

Attempt 1 (haiku, $0.02) was first judged refuted on gate: the verifier saw the gate red at b6fe40a while its node run sat for over six minutes. The three gates rerun by hand in the worktree at the same sha were green (node 885/0 in 9 s, validate passed, plugin test 1356/0), and `--verify b6fe40a` then judged it consistent on every claim. Read as a slow or flapping gate run, not a fault in the change. Accepted as handed back; no fixes.
