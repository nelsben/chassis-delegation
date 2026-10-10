---
id: GH-114
title: /delegation names what each alias resolves to and when it moved; the card dry run shows what the classifier would pick beside the card's tier
domain: mod
tier: standard
status: merged
scope: [hooks/lib/watch.ts, hooks/lib/tier.ts, hooks/lib/card.ts, hooks/register.ts, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/lib/allow.ts, hooks/lib/verify-native.ts, hooks/lib/gitguard.ts, hooks/lib/scheduler.ts]
red_test: a pure test in tests/watch.test.ts for aliasLines(store) rendering "haiku → claude-haiku-5-5 (since 10-08; was claude-haiku-4-5-… until 10-07)" from stored sightings, and an engine test in tests/hooks.test.ts where the card tool's dry run prints "card says standard · classifier says economy" when the classifier is asked and answers economy; red first
gate: validate,node,test
budget: 2-attempts
spend: 8
---
## Why

Public issue #34, asks 1 and 2. The first adopter's ledger shows `haiku` resolving to
`claude-haiku-4-5-20251001` through 2026-10-07 while `sonnet` and `opus` were on 5.5. The alias is the
engine's: Claude Code 2.1.294 (2026-10-08) is the first build that resolves `haiku` to Haiku 5.5 on the
Anthropic API, and earlier builds gave 4.5. The mod cannot change what an alias means, but it can say what
it saw. The drift toast exists and fires once; it is gone the next minute. And a carded spawn never reaches
the classifier, so the picker's own judgment is invisible on real work.

## What to build

- **Alias sightings.** The store already keeps the last resolved id per alias (`delegation.alias.<alias>`).
  Extend the record to `{ id, since, previous?: { id, until } }` (keep reading the old plain-string form).
  `/delegation` prints one line per alias seen:
  `aliases: haiku → claude-haiku-5-5 (since 10-08; was claude-haiku-4-5-20251001 until 10-07) · sonnet → … · opus → …`,
  and, when any alias moved within the last 7 days, a second line: `haiku moved on 10-08: economy cards
  now run on Haiku 5.5; re-run the economy cases of tests/eval/classifier-cases.jsonl`.
- **The classifier in the dry run.** The card tool's dry run (not `dispatch: true`) asks the classifier
  (`$.model.classify`, the same text and labels the spawn hook uses) and prints, under the summary line,
  `card says <tier> · classifier says <tier>` (or `· classifier agrees`). One call per card written, never
  on dispatch. A config boolean `classifierSecondOpinion` (default true) turns it off. Record both on the
  card's first attempt record (`classifierTier`), so the ledger carries the comparison.
- README (the `/delegation` output, the card tool paragraph, the config row) and CHANGELOG (GH-114).

Save red output to `.delegation/GH-114/red-1.txt`, name it `red=`. The gate map runs the three gates.
