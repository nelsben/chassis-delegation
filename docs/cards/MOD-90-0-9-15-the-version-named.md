---
id: MOD-90
title: 0.9.15: the version named in its four places, the CHANGELOG dated, and a "From 0.9.14 to 0.9.15" section in docs/upgrading.md
domain: mod
tier: economy
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, docs/upgrading.md]
forbid: [docs/cards/**, docs/install.md, docs/guide.md, docs/contracts.md, docs/review-and-merge.md, docs/configuration.md, docs/spend.md, docs/internals.md, docs/chassis-delegation.png, hooks/register.ts, hooks/lib/allow.ts, hooks/lib/update.ts, hooks/lib/retention.ts, hooks/templates/**, bin/**, .chassis-delegation.json]
red_test: bump MOD_VERSION in hooks/lib/version.ts to 0.9.15 first and run the node suite: tests/node/version.node.mjs fails on the manifest, the README and the CHANGELOG still naming 0.9.14, and tests/node/docs.node.mjs fails on docs/upgrading.md having no From … to 0.9.15 section; save that run as the red evidence, then bring the rest into line; red first
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

One change sits under CHANGELOG "Unreleased" since v0.9.14: MOD-89 keeps the store under the host's 4 MiB cap. Every session on the machine is losing new worker records until it ships, so it goes out on its own as the next patch.

## Done when

- hooks/lib/version.ts exports MOD_VERSION = '0.9.15'. .claude-plugin/plugin.json says "version": "0.9.15", and nothing else in the manifest changes. README.md's last line says "Version 0.9.15, MIT." The CHANGELOG's "## Unreleased" heading becomes "## 0.9.15 — 2026-10-18". Its one entry is unchanged, and no empty Unreleased section is left behind.
- docs/upgrading.md gains "### From 0.9.14 to 0.9.15" directly above "### From 0.9.13 to 0.9.14", in the same voice and shape, with no blank line between bullets: first the line "What the brain will see:"; then one bullet with the bold lead "The store stays under the host's cap (MOD-89)." and a body saying that the host refuses a write once a mod's store passes 4 MiB, which left new workers with no verdict; the mod now deletes the records of tasks closed more than 7 days (and, over 3.5 MiB, older closed records until under 3 MiB), never an open task's; the first session after the upgrade says `store: pruned <n> records (<x> MiB to <y> MiB of 4 MiB)`; a refused write now says `store write failed: …` once; and `/delegation` shows `store: <x> MiB of 4 MiB`. Then the "What to do:" paragraph, copied verbatim from the 0.9.14 section's "What to do:" paragraph.
- Nothing else changes. tests/node/version.node.mjs and tests/node/docs.node.mjs are green, and the three gates pass.

## Review

Attempt 1 (haiku) accepted by hand. The store was still at the host's cap (MOD-89 not yet loaded), so the spawn record was refused and there was no verdict. Verified by hand at 69ad27e: red is the node run after the version bump alone, failing on version.node.mjs and docs.node.mjs; validate passed; node 904/0; the diff is the version in its four places, the CHANGELOG dated with its one entry unchanged, and the From 0.9.14 to 0.9.15 section as asked, with the What to do paragraph verbatim. The worker's two engine runs failed only on 5 s timeouts in untouched tests (4, then 2, a different set each time); a version bump touches no engine test.
