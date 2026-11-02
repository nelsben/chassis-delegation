---
id: MOD-274
title: Adaptive picks, part 1: cards get a class, and a small, recorded share of first attempts runs one step off the default so the ledger learns what effort and model each class needs
domain: mod
tier: standard
status: merged
scope: [hooks/**, tests/**, docs/**, .claude-plugin/plugin.json, CHANGELOG.md]
forbid: []
red_test: a new test in tests/node/: a card with attempt 1, no effort:, no reasons, tier standard and kind feature with fnv1a32 of its id mod 1000 below explore x 1000 gets an exploratory step one effort level down; fails today because no explore function exists
gate: validate, node, test
budget: 3-attempts
spend: 10
---
## Why

MOD-270 records the brain's pick and shows history, but every card runs at its tier's default, so the ledger can never show whether a cheaper pick would have passed the same kind of card (model and effort are confounded: haiku low, sonnet medium, opus high). Evidence from this repo's ledger: 299 attempt-1 cards in 30 days, sonnet/medium confirms 96% at about $0.85 a card, haiku/low 100%; half of all attempt-1 refutes are brief defects (scope), not capability; 267 of 275 cards have only 2 attempts. So exploration must be downward only (upward steps hit a ceiling and always cost more), must not eat a card's attempts or trigger the tier escalation ladder, and the class scheme must not put 92% of cards in one class.

## Done when

- A pure function in hooks/lib/ gives each card a class: kind (release, docs, bug, test, feature) from a new optional kind: card field, else inferred: scope only CHANGELOG, docs/** or version files is release when the title starts 'Release' or names a version, else docs; a title starting 'Bug' or 'Fix' is bug; scope only tests/** is test; else feature. Size is small when the existing economy hint (economyHint, hooks/lib/dispatch.ts) would fire for the card, else large. The class is written on the attempt record and reaches spawn and verdict rows.
- A new repo option explore (0 to 0.5, default 0.2). A card is eligible when it is attempt 1 of a spawn, has no effort: field, no tier_reason: and no effort_reason: (MOD-270; the tool always writes tier:, so a tier alone is not 'hand-set'), its tier is standard or frontier, and its kind is not release or docs. For an eligible card, draw = (fnv1a32(task id) mod 1000) / 1000; it explores when draw < explore. The step is one axis, downward only: effort one level down (medium to low, high to medium) or, on standard only, the tier one down at the same effort; frontier never changes tier but may step effort down (opus/medium). Never upward, never on economy. Among the allowed steps the class's least-tried pair in the ledger is chosen, ties to effort-down. A step that maxEffort (MOD-271) would change is skipped, not clamped.
- An exploratory attempt carries explore: true and the pair it moved from on the attempt record (effortSource gains 'explore'), the spawn row ('effort low · explore from medium') and the verdict row.
- A refuted or no-report exploratory attempt does not set the escalation source (attempt 2 runs at the card's own tier and the tier's default effort) and is not counted against budget= (attemptsFor treats it like a review attempt for the budget count only; it still numbers the ladder). Its usd is credited to the explored pair in history. A test shows a 2-attempts card whose exploratory attempt 1 is refuted on gate running attempt 2 at sonnet/medium with 2 attempts still available.
- MOD-270's pairHistory(rows) takes an optional class and is the only history function; the dry-run history line names the card's class first ('history feature/large: ...') and falls back to all classes when the class has no rows.
- The option is in configtable.ts, /config, plugin.json userConfig and docs/configuration.md; the pinned option count (tests/node/configtable.node.mjs and tests/configcmd.test.ts) goes up by one.
- Tests: class inference on sample cards; fnv1a draw stable per task id; each excluded case (attempt 2, effort: set, a reason set, economy, release or docs kind) never explores; downward-only steps and the least-tried choice; skip-not-clamp under maxEffort; the refuted exploratory attempt running attempt 2 at the default with budget intact; explore 0 never explores.
- CHANGELOG.md Unreleased has one entry; docs note that on a repo with few cards a day only the largest class gathers enough cards to learn from.
