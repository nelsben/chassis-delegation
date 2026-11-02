---
id: MOD-276
title: Push back on top-tier cards: frontier and premium need a tier_reason, dispatch and tree show the plan's tier mix, and an optional maxFrontierShare warns
domain: mod
tier: standard
status: merged
scope: [hooks/**, tests/**, docs/**, .claude-plugin/plugin.json, CHANGELOG.md]
forbid: []
red_test: a new test: dispatching a frontier card with no tier_reason: is refused with a message naming tier_reason; fails today because dispatch applies the tier as written
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

A card's tier: is applied as written, and nothing asks why a card is frontier or shows how a plan's tiers split. In one adopter's plan, 16 of 22 cards were frontier, including docs and scaffolding, against their own rule that Sonnet is the default, and four Opus workers ran before anyone noticed. Escalation on a refute already exists, so the gap is at the start: a frontier pick should be deliberate and visible.

## Done when

- dispatch refuses a card whose tier is frontier or premium and whose tier_reason: is missing or empty after cleanReason (MOD-270). The refusal names the card and says to add a one-line tier_reason: or drop to standard. A dry run shows the same message. Economy and standard cards need no reason. The card tool refuses tier frontier or premium without tierReason in the same words.
- A card with no tier: still means standard (unchanged); the docs say so in one line.
- dispatch, both the dry run and the real one, prints one line with the tier mix of the open cards in the card's card folder (status queued, dispatched or held; merged and dropped left out), counting the card being dispatched: 'plan tiers: standard 5 · frontier 16 · economy 1 (frontier 16/22)'. Tiers with zero cards are left out. With one open card the line is left out.
- The tree tool's output carries the same tier-mix line for the cards it lists.
- A new repo option maxFrontierShare (0 to 1, default 0 = off). When it is above 0 and the share of frontier and premium among the open cards counted above is greater than it, dispatch adds a warning line: 'frontier share 0.73 is above maxFrontierShare 0.3'. It warns only and never refuses. The option is in configtable.ts, repoconfig.ts (REPO_KEYS, mergeConfig), plugin.json userConfig and docs/configuration.md; the pinned option count in tests/configcmd.test.ts goes up by one.
- Escalation on a refute is unchanged; docs/configuration.md says in one sentence that the tier is raised only after a refuted attempt, so Opus runs where Sonnet failed.
- Tests: frontier without tier_reason is refused and with one is dispatched; premium likewise; standard without a reason is dispatched; the tier-mix line counts and formats as above, leaves out merged cards and zero tiers, and is absent with one open card; maxFrontierShare 0 never warns, 0.3 warns at 16/22 and not at 6/22; the tree line.
- CHANGELOG.md Unreleased has one entry; docs/upgrading.md notes that an existing frontier or premium card without tier_reason: is now refused at dispatch until one is added.
