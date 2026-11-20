---
id: MOD-409
title: "A card's class sizes it by breadth (narrow, mid, wide: the count of source paths in scope) in place of small or large, and rows stamped with the old sizes are classed again from their card files"
domain: mod
tier: standard
status: merged
issue: 574
scope: [hooks/lib/explore.ts, hooks/lib/classof.ts, hooks/lib/choice.ts, hooks/register.ts, CHANGELOG.md, docs/guide.md, docs/internals.md, tests/node/classbreadth.node.mjs, tests/node/*.node.mjs, tests/*.test.ts]
forbid: [bin/**, docs/cards/**, docs/mockups/**, docs/spikes/**, hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, docs/upgrading.md, hooks/lib/workpane.tsx, hooks/lib/work.ts, hooks/lib/mergecmd.ts, hooks/lib/verify-native.ts, hooks/lib/gaterun.ts, hooks/lib/adaptive.ts, hooks/templates/**]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/classbreadth.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 12
---
## Why

A card's class is `<kind>/<size>`, and size is `small` only when the economy hint fires. In one repo 347 of 372 cards are `feature/large`. The history line and the cheaper-pair suggestion both work per class, so with one class holding nearly every card they cannot tell a one-file card from a ten-file one. Measured on 295 standard cards there: 1 to 2 source paths in scope passed first try 86% of the time, 3 to 4 84%, 5 or more 74%.

## Before you start

- `hooks/lib/explore.ts`: `CardSize`, `cardSize`, `cardClassName`, `cardKind`, `isDocsPath`, `isTestPath`, `cleanPath`.
- `hooks/lib/classof.ts`: `classOfCardText`.
- `hooks/lib/choice.ts`: `cardOutcomes` (the line `const own = typeof first.class === 'string' …`).
- `hooks/register.ts`: the two `cardClassName(… cardSize(tierHint(…) !== undefined))` call sites, and `classOfFor` (its `need` loop skips rows that carry a class).
- `hooks/lib/dispatch.ts` `tierHint` is read only; it keeps printing its hint as today.

## Design (decided by the brain; build it, do not redesign it)

1. **`CardSize` becomes `'narrow' | 'mid' | 'wide'`.** `cardSize(scope: readonly string[]): CardSize` in explore.ts. The source entries are the scope entries, cleaned with `cleanPath`, that are not empty, not a docs path, not a test path, and do not end in `.md`. `wide` when any source entry holds a glob character (`*?[]{}`) or there are 5 or more; `mid` for 3 or 4; `narrow` for 0, 1 or 2.
2. **Every caller passes the card's scope.** `classOfCardText` and both register.ts call sites call `cardSize(scope)` with the same scope they pass to `cardKind`. The economy hint no longer feeds the class.
3. **Old stamps are classed again.** `liveClass(cls: unknown): string | undefined` in explore.ts returns the string when it is a non-empty string that does not end in `/small` or `/large`, else undefined. `cardOutcomes` uses `liveClass(first.class) ?? classOf?.(task)`. `classOfFor`'s `need` loop treats a row as needing a class when `liveClass(r.class)` is undefined. A row whose card file is gone and whose stamp is an old one has no class, as a row with no stamp has today.
4. **Nothing else changes.** The exploration rate, the draw, the suggestion rule and the kinds stay as they are. hooks/lib/adaptive.ts is not edited (a comment there that says `feature/large` may stay).

## Tests

Node tests in the new file `tests/node/classbreadth.node.mjs` (write them first; they are the red test):
- `cardSize`: `[hooks/lib/a.ts, tests/a.test.ts, CHANGELOG.md, docs/guide.md]` is `narrow`; three source files is `mid`; five is `wide`; `[hooks/lib/*.ts]` is `wide`; `[tests/**, docs/**]` is `narrow`; a glob among only test paths does not make it wide.
- `classOfCardText` on a card with four source paths gives `feature/mid`.
- `liveClass`: `feature/large` and `bug/small` give undefined; `feature/mid` gives itself; `''`, undefined and a number give undefined.
- `cardOutcomes` with a row stamped `feature/large` and a `classOf` that says `feature/narrow`: the card counts under `feature/narrow` and not under `feature/large`.
- Existing tests that expect `feature/large` or `/small` from the class code are updated to the new names; no test is deleted.

## Left to you

- Which existing tests need their expected class changed.

## Done when

- A card's class is `<kind>/narrow`, `<kind>/mid` or `<kind>/wide` by the rule above, at dispatch, in the dry run and on new ledger rows.
- A ledger row stamped with an old size is classed from its card file, in the history line and in the suggestion.
- The tests listed above exist in tests/node/classbreadth.node.mjs and pass.
- docs/guide.md and docs/internals.md say the new size rule wherever they describe the class (search `feature/large` and `small`), with the three sizes named.
- CHANGELOG.md gains one bullet under `## Unreleased`.
- The gates validate, node and test are green.

## Review

Brain review (Fable 5.2): Built as designed. cardSize reads the scope's source entries (narrow 0 to 2, mid 3 or 4, wide 5 or more or a glob), every caller passes the scope, and liveClass makes rows stamped /small or /large take their class from the card file in both cardOutcomes and classOfFor. The suggestion rule, the draw and the kinds are untouched. One scope amend granted: a shared test fixture (tests/node/adaptivesim.mjs) named the old classes and my scope glob missed it. Ran as an exploration card on sonnet/low and held first try once the amend was granted.
