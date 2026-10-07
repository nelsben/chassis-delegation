---
id: GH-108
title: A card or header tier the mod does not know is named, never silently standard; model names are accepted as tiers
domain: mod
tier: standard
status: merged
scope: [hooks/lib/tier.ts, hooks/lib/dispatch.ts, hooks/register.ts, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/lib/scheduler.ts, hooks/lib/verify-native.ts, hooks/lib/cost.ts]
red_test: a pure test in tests/tier.test.ts for a new tierOf(value) that maps economy/standard/frontier/premium as themselves, haiku→economy, sonnet→standard, opus→frontier, fable→premium, and returns undefined for "deep"; and an engine test in tests/hooks.test.ts where /dispatch of a card with `tier: deep` prints `warning: tier "deep" is not economy, standard, frontier or premium; dispatched at standard` and one with `tier: opus` dispatches at frontier (red: today both dispatch at standard with no word)
gate: validate,node,test
budget: 2-attempts
---
## Why

Found auditing how the mod picks a model (2026-10-07). `runDispatch` does
`isTier(card.tier) ? card.tier : 'standard'`, and the spawn hook does the same for a header `tier=`. The
first adopter has 14 cards with `tier: deep` and one with `tier: opus`; every one of them dispatches at
standard with no warning, and `tier: opus` is a silent downgrade of what its author asked for. Same class
as the budget-grammar warning (GH-1 item 6).

## Done when

- `tierOf(value)` in hooks/lib/tier.ts: the four tiers as themselves; the model families (`haiku`,
  `sonnet`, `opus`, `fable`, and any full id containing them) as their tiers; anything else undefined.
  Case-insensitive; a trailing YAML comment is already stripped by `parseCard`.
- `/dispatch` and the tool use `tierOf(card.tier)`. When it is undefined and the card named a tier, the
  output prints `warning: tier "<value>" is not economy, standard, frontier or premium; dispatched at
  standard` once, and the header carries `tier=standard`. When a model name was mapped, no warning; the
  header carries the mapped tier.
- The spawn hook applies the same mapping to a header `tier=` and logs the same warning to debug.
- The tier notice under the spawn keeps its form.
- README (the card fields table's `tier:` row) and CHANGELOG (GH-108). Save red output to
  `.delegation/GH-108/red-1.txt`, name it `red=`. The gate map runs the three gates.
