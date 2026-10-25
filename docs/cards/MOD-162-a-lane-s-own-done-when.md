---
id: MOD-162
title: A lane's own done-when adds to the shared done-when instead of replacing it: every lane card carries the umbrella statements first, then its own
domain: mod
tier: standard
status: merged
scope: [hooks/lib/card.ts, tests/**, docs/guide.md, CHANGELOG.md]
forbid: [docs/cards/**, bin/**, hooks/templates/**, .chassis-delegation.json, .claude-plugin/**, README.md, docs/upgrading.md, hooks/register.ts, hooks/lib/verify-native.ts, hooks/lib/allow.ts, hooks/lib/gates.ts]
red_test: pure test in tests/node/: a lanes card with shared doneWhen [S1, S2] and a lane doneWhen [L1] writes that lane's card with Done when S1, S2, L1 in order; at base the card holds only L1. Red first
gate: validate, node, test
budget: 2-attempts
spend: 4
---
## Why

A five-lane research card gave the shared doneWhen the output layout and rules (file names, sections, own-words and hygiene rules) and each lane two sentences naming its pages. The briefs carried only the lane's two sentences, so five workers each invented a different output shape and all five had to be resumed. The tool text says a lane without its own doneWhen takes the shared one; nothing says a lane with one loses the umbrella, and the brain's natural reading is that both apply.

## Done when

- In hooks/lib/card.ts, when lanes are given, each lane card's Done when is the shared doneWhen statements in order, followed by that lane's own doneWhen statements (if any). A lane with no doneWhen gets the shared ones alone, as today. The shared doneWhen stays required at the top level.
- The card tool's schema text for `lanes` and for a lane's `doneWhen` says the lane's statements are added after the shared ones (replace 'Give the shared title/doneWhen as the umbrella; a lane without its own doneWhen takes the shared one' with wording that says every lane carries the shared doneWhen and a lane's own doneWhen is appended to it). docs/guide.md, where it describes lanes, says the same in one sentence.
- Tests: a pure test in tests/node/ (red first: at base the lane card holds only the lane's statements) builds a card with shared doneWhen [S1, S2] and two lanes, one with doneWhen [L1] and one without: the first lane's card reads S1, S2, L1 in that order and the second reads S1, S2. Existing lane tests are updated. CHANGELOG.md Unreleased gets one Fixed entry. Wording generic: no product, repo, person, path or session names.

## Review

Consistent on attempt 1. A lane's own `doneWhen` is now appended after the shared `doneWhen` in card.ts instead of replacing it; the card-tool schema text and docs/guide.md say so in one sentence each; tests/node/lanedone.node.mjs covers both the composed list and a lane with no own line; tests/resources.test.ts updated for the new order. Found by five research workers who got only their lane line and invented output shapes. The worker flagged docs/contracts.md line 349 ("done-when (else the shared list)") as stale, out of scope: a wording card follows. CHANGELOG rebase conflict with MOD-163 resolved by hand keeping both Unreleased bullets.
