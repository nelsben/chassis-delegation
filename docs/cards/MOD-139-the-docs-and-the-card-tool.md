---
id: MOD-139
title: The docs and the card tool say that the card is the worker's whole instruction: a "What the worker sees" section in docs/guide.md, one clause in docs/how-it-works.md, and the card tool's doneWhen description naming the rule
domain: mod
tier: economy
status: merged
scope: [docs/guide.md, docs/how-it-works.md, hooks/lib/card.ts, tests/**, CHANGELOG.md]
forbid: [docs/cards/**, bin/**, hooks/register.ts, hooks/templates/**, .chassis-delegation.json, .claude-plugin/**, README.md, docs/upgrading.md, docs/contracts.md, docs/review-and-merge.md, docs/configuration.md, docs/spend.md]
red_test: node test tests/node/docs.node.mjs: docs/guide.md has a `### What the worker sees` heading between `## The card` and `### Dry-run warnings`; at base the heading does not exist. Red first
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

The docs say the brain writes the card, but nowhere say that the brief (the card's header, Why and Done when, plus the domain's lessons file) is everything the worker sees: none of the conversation reaches it, so every decision a Done when line leaves open is one the worker makes alone. Two cards of the same tier on the same day showed the cost: the one that named its fallbacks got zero judgment calls, the one that said "the existing one" got four the brain had to read and accept after the fact.

## Done when

- docs/guide.md gains a subsection `### What the worker sees` directly under `## The card` (before `### Dry-run warnings`), of four to eight lines: the worker reads the brief alone, which is the card's header, Why and Done when plus the domain's lessons file, and nothing of the conversation that produced the card; so the card carries every decision the brain does not want the worker to make; a Done when line that says `sensible`, `appropriate`, `as needed` or `the existing one` is a judgment call the brain reads about in the hand-back; a detailed card costs the same to dispatch as a thin one, and the hand-back of a thin one costs the brain a review. One concrete before/after pair of a Done when line (generic wording, no product, repo, person or path names).
- docs/how-it-works.md step 2 (`The brain calls the card tool, which writes the card and prints the dry run.`) gains the clause `; the card's title, Why and Done when are the worker's whole instruction` before the full stop, and nothing else in the file changes.
- hooks/lib/card.ts: the `doneWhen` description (the top-level one at the card tool's input schema, not the lane one) becomes `Checkable statements: what is true when it is done. The worker sees only this card and the domain's lessons, never the conversation, so name every decision you do not want it to make`. The lane description is unchanged. Any test that pins the old description text is updated.
- tests/node/docs.node.mjs gains one check: docs/guide.md has a `### What the worker sees` heading under `## The card`. CHANGELOG.md Unreleased gets one Changed entry (a new Unreleased section above `## 0.9.26`). Wording generic: no product, repo, person, path or session names.

## Review

Attempt 1 (haiku) consistent at 0208c9e (validate, node 1071, engine 1585). guide.md "What the worker sees" sits after the glob rules and before Dry-run warnings, with a before/after Done when pair; how-it-works step 2 gains the clause; the card tool's top-level doneWhen description names the rule (lane one unchanged); docs.node.mjs pins the heading. Classifier said standard; economy held.
