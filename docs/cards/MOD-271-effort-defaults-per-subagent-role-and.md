---
id: MOD-271
title: Effort defaults per subagent role and a maxEffort cap (default high): reviewers get a configurable effort, xhigh and max are clamped unless the cap is raised
domain: mod
tier: standard
status: merged
scope: [hooks/**, tests/**, docs/**, .claude-plugin/plugin.json, CHANGELOG.md]
forbid: []
red_test: a new test: a reviewer's step with reviewEffort medium is rewritten to medium; fails today because stepEffort returns undefined for a reviewer
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Workers get effort from effortByTier, but reviewers always step at the engine's default (MOD-21) and nothing stops a card or config from asking for xhigh or max, which cost far more for little gain on carded, gated work. Pre-built defaults per role plus one cap make effort predictable and cheap by default while keeping the heavy levels one deliberate setting away.

## Done when

- A new repo-scope option reviewEffort (low, medium, high, xhigh, max, or empty for the engine default) defaults to medium; stepEffort applies it to a reviewer's steps (today a reviewer returns undefined), and the reviewer's spawn row shows it.
- A new user-scope option maxEffort (low, medium, high, xhigh, max) defaults to high; every effort the mod applies (card effort:, the card tool's effort, effortByTier, reviewEffort) is clamped to it, and a clamp is disclosed once on the spawn row as 'effort high (capped from max)'. An exploratory or adaptive step (MOD-274, MOD-275) that would cross the cap is skipped, not clamped, so a row never records a pair that did not run.
- effortByTier keeps its defaults (economy low, standard medium, frontier high); its help text says levels above maxEffort are clamped.
- The /delegation effort line shows the reviewer level and the cap: 'effort: economy low · standard medium · frontier high · review medium · cap high'.
- Both options are in configtable.ts, /config, plugin.json userConfig and docs/configuration.md; the pinned option count (tests/node/configtable.node.mjs and tests/configcmd.test.ts) goes up by two.
- Tests cover: reviewer steps at reviewEffort; empty reviewEffort keeps the engine default; a card effort: max is clamped to high with the disclosure; raising maxEffort to max lets it through; the /delegation line.
- CHANGELOG.md Unreleased has one entry; docs/upgrading.md notes that a config already asking for xhigh or max is now clamped to high unless maxEffort is raised.
