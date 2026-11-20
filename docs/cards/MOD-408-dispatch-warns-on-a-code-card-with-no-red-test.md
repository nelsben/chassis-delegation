---
id: MOD-408
title: "dispatch warns when a card that changes code has red_test none; it never refuses"
domain: mod
tier: standard
status: merged
issue: 573
scope: [hooks/lib/dispatch.ts, hooks/lib/explore.ts, hooks/register.ts, CHANGELOG.md, docs/guide.md, tests/node/redwarn.node.mjs, tests/node/*.node.mjs, tests/*.test.ts]
forbid: [bin/**, docs/cards/**, docs/mockups/**, docs/spikes/**, hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, docs/upgrading.md, hooks/lib/workpane.tsx, hooks/lib/work.ts, hooks/lib/mergecmd.ts, hooks/lib/verify-native.ts, hooks/lib/gaterun.ts, hooks/templates/**]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/redwarn.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 8
---
## Why

31 of the last 102 merged cards in one repo had `red_test: none` while changing source files. Nothing said so at dispatch. A red test is the only proof that a card's test fails without the change.

## Before you start

- `hooks/lib/dispatch.ts`: `scopeSizeWarning`, `tierHint`, `hedgeHints` (the shape to follow: a pure function that returns a line or undefined).
- `hooks/register.ts`: where the dispatch result prints those lines (search `hedgeHints(doneWhenOf(card.body))`) and the dry run prints them.
- `hooks/lib/explore.ts`: `cardKind` and its `isDocsPath`, `isTestPath` helpers.

## Design (decided by the brain; build it, do not redesign it)

1. **`redTestWarning(input)` in dispatch.ts, pure.** Input `{ redTest: string; purpose?: string; kind: string; scope: readonly string[] }`. It returns `warning: red_test is none on a card that changes code (<n> source paths in scope): name a test that fails before the change`, or undefined.
2. **When it fires.** All of: `redTest`, trimmed and lower-cased, is `''` or starts with `none`; `purpose` is not `spike`; `kind` is none of `docs`, `release`, `test`, `spike`; and `n > 0`, where `n` counts the scope entries that are not a docs path, not a test path, and do not end in `.md`, `.json`, `.yml`, `.yaml` or `.toml`. Export the two path helpers from explore.ts when they are not exported; do not copy them.
3. **Where it prints.** In the dispatch result and in the dry run, on its own line directly before the hedge hints, indented as they are. It changes nothing else: the brief is written and the dispatch goes ahead.

## Tests

Node tests in the new file `tests/node/redwarn.node.mjs` (write them first; they are the red test):
- Fires for `red_test: none`, kind `feature`, scope `[hooks/lib/a.ts, tests/a.test.ts, CHANGELOG.md]`, and the line says `1 source paths`.
- Fires for `none (test-only)` and for an empty value on the same card.
- Does not fire: with a red test command; for kind `docs`, `release`, `test` or `spike`; for purpose `spike`; for a scope of only `docs/**`, `CHANGELOG.md` and `.claude-plugin/plugin.json`.

## Left to you

- How the register.ts call gets the card's kind (the class code beside it already computes one).

## Done when

- `redTestWarning` is exported from hooks/lib/dispatch.ts and behaves as the Design says.
- A dispatch and a dry run of a code card with `red_test: none` print the warning line and still go ahead; a card with a red test prints nothing new.
- The tests listed above exist in tests/node/redwarn.node.mjs and pass.
- docs/guide.md names the warning in one sentence where it describes the dispatch hints.
- CHANGELOG.md gains one bullet under `## Unreleased`.
- The gates validate, node and test are green.

## Review

Brain review (Fable 5.2): Built as designed. redTestWarning is pure, fires only for a none or empty red test on a card whose kind is not docs, release, test or spike and whose scope holds source paths, and prints before the hedge hints without stopping the dispatch. The path helpers are exported from explore.ts, not copied. The first verify was red on engine-test timeouts with the machine at load 44; a second verify at the same sha with the load lower was green.
