---
id: MOD-88
title: 0.9.14: the version named in its four places, the CHANGELOG dated, and a "From 0.9.13 to 0.9.14" section in docs/upgrading.md
domain: mod
tier: economy
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, docs/upgrading.md]
forbid: [docs/cards/**, docs/install.md, docs/guide.md, docs/contracts.md, docs/review-and-merge.md, docs/configuration.md, docs/spend.md, docs/internals.md, docs/chassis-delegation.png, hooks/register.ts, hooks/lib/allow.ts, hooks/lib/update.ts, hooks/lib/norepo.ts, hooks/lib/mergecmd.ts, hooks/lib/init.ts, hooks/templates/**, bin/**, .chassis-delegation.json]
red_test: bump MOD_VERSION in hooks/lib/version.ts to 0.9.14 first and run the node suite: tests/node/version.node.mjs fails on the manifest, the README and the CHANGELOG still naming 0.9.13, and tests/node/docs.node.mjs fails on docs/upgrading.md having no From … to 0.9.14 section; save that run as the red evidence, then bring the rest into line; red first
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

Three changes sit under CHANGELOG "Unreleased" since v0.9.13: MOD-87 (the card tool never reuses an id that owns a brief or a ledger row), MOD-85 (scope is checked under an outside folder too big to list, by modification time) and MOD-86 (/delegation merge works with a git-ignored card folder). They ship as the next patch.

## Done when

- hooks/lib/version.ts exports MOD_VERSION = '0.9.14'. .claude-plugin/plugin.json says "version": "0.9.14", and nothing else in the manifest changes. README.md's last line says "Version 0.9.14, MIT." The CHANGELOG's "## Unreleased" heading becomes "## 0.9.14 — 2026-10-16". Its three entries are unchanged and in the same order, and no empty Unreleased section is left behind.
- docs/upgrading.md gains "### From 0.9.13 to 0.9.14" directly above "### From 0.9.12 to 0.9.13", in the same voice and shape: first the line "What the brain will see:"; then three bullets, in this order. (1) Bold lead "The card tool never reuses a task id (MOD-87)." with a body saying the next id now also skips every id that has a brief in the brief folder or a row in .delegation/ledger.jsonl, so a card deleted after its run no longer hands its id, old brief and attempts to a new card. (2) Bold lead "Scope is checked under an outside folder too big to list (MOD-85)." with a body saying a forbid or scope root outside the repo that holds more than 10000 files used to come back unchecked; the dispatch now says `<root> holds more than 10000 files, so changes there will be found by modification time`, and the hand-back judges every file and folder there modified since the dispatch; anything else that writes under that root during the run (an app, Finder's .DS_Store) counts too, so a card should forbid the narrowest folder that matters. (3) Bold lead "`/delegation merge` works with a git-ignored card folder (MOD-86)." with a body saying that when the card folder is git-ignored the merge marks the root card merged in place and commits no card, its first line says `card kept local (git-ignored): <path> marked merged`, `--finish` keeps that card, and setup and init print a `cards: <cardDir> is git-ignored, …` line; a tracked card behaves as before. Then the "What to do:" paragraph, copied verbatim from the 0.9.13 section's "What to do:" paragraph.
- Nothing else changes. tests/node/version.node.mjs and tests/node/docs.node.mjs are green, and the three gates pass.

## Review

Attempt 1 (haiku, $0.02) accepted as handed back. The version is named in its four places, the three Unreleased entries are under ## 0.9.14 — 2026-10-16 unchanged and in order, and docs/upgrading.md has the From 0.9.13 to 0.9.14 section above 0.9.12 to 0.9.13 with the three bullets as asked and the What to do paragraph verbatim. The bullets are separated by blank lines where the older sections run them together; it renders the same, left as is.
