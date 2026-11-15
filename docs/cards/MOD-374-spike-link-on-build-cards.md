---
id: MOD-374
title: a build card's `spike: <ID>` names the spike it was planned from, and its spawn rows carry it, so first-try pass rate can be compared for cards with and without one
domain: mod
tier: standard
status: merged
issue: 512
scope: [hooks/lib/storeloss.ts, hooks/register.ts, hooks/lib/card.ts, docs/guide.md, CHANGELOG.md, tests/node/spikelink.node.mjs, tests/*.test.ts, tests/node/*.node.mjs, tests/harness.ts]
forbid: [bin/**, docs/cards/**, docs/mockups/**, hooks/lib/spike.ts, hooks/lib/verify-native.ts, hooks/lib/explore.ts, hooks/lib/dispatch.ts, hooks/templates/**, hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, docs/upgrading.md]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/spikelink.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Spike cards (MOD-372, MOD-373) exist to make the build cards after them pass on the first try. To know whether they do, a build card has to say which spike it came from, and the ledger has to keep it next to the attempt's outcome. This card adds the field and the record; the comparison itself is read from the ledger later, by hand or by a report.

## Before you start

- `hooks/lib/storeloss.ts`: `SpawnRow`, `SpawnFields`, `spawnRow` (the MOD-341 `fixes` and `linked` fields are the pattern).
- `hooks/register.ts`: `CardClassRecord` (search `type CardClassRecord`), where the dispatch path builds `cardClassRecord` (search `const cardClassRecord: CardClassRecord`), and the one `appendLedger` of a spawn row that copies `cardCls.fixes` and `cardCls.linked` (search `cardCls?.linked`).
- `hooks/lib/card.ts`: `fixesOf`, the `fixes` input of `CARD_TOOL`, and how `cardFromFields` writes `fixes:`.
- `docs/guide.md` `### Spike cards` (MOD-373).

## Design (decided by the brain; build it, do not redesign it)

- A card's `spike:` field holds one task id, matching `^[A-Z][A-Z0-9]*-\d+$` after trim. Read it with a new pure `spikeLinkOf(v: unknown): string | undefined` in `hooks/lib/card.ts` beside `fixesOf` (a string that matches: the id; anything else: undefined).
- `CardClassRecord` gains `spike?: string`, set in `cardClassRecord` when `spikeLinkOf(card.fields.spike)` is defined.
- When the card has a `spike:` field that `spikeLinkOf` refuses, the dispatch prints one line with the other warnings, `warning: spike: <value as written, cut to 40 characters> is not a task id; not recorded`, and dispatches as usual.
- `SpawnRow` gains `/** MOD-374 (#512): the spike this card was planned from. */ spike?: string`; `spawnRow` copies it when set, after `linked`. The spawn-row `appendLedger` that copies `cardCls.fixes` adds `...(cardCls?.spike ? { spike: cardCls.spike } : {})`.
- A card whose own `purpose` is `spike` and that names `spike:` gets the same record; nothing refuses it.
- `CARD_TOOL` input gains `spike: { type: 'string', description: 'A build card: the id of the spike card whose findings it was planned from (e.g. MOD-372); recorded on its ledger rows' }`. `cardFromFields`: a value that `spikeLinkOf` refuses is the error `spike must be one task id, e.g. MOD-372`; else `spike: <id>` is written after the `fixes:` line (or where `fixes:` would go). A card without it is byte-identical to today's.
- `docs/guide.md`, at the end of `### Spike cards`: two sentences on `spike:` on a build card and that its spawn rows carry it.
- `CHANGELOG.md`, `## Unreleased`, `### Added`: one bullet `(MOD-374)`.

## Tests

- `tests/node/spikelink.node.mjs` (new, the red test): `spikeLinkOf` (an id, an id with spaces round it, a lowercase id, a number, a list, empty); `spawnRow` with and without `spike`; `cardFromFields` with `spike` (the line, its place) and the error.
- An engine test that a dispatched card with `spike: MOD-1` writes a spawn row with `spike: 'MOD-1'`, and one with `spike: nope` prints the warning and writes none.

## Left to you

- Fixture texts and test names.

## Done when

- A card with a valid `spike:` dispatches and its spawn rows carry `spike`; a bad value warns and records nothing; a card without it is unchanged everywhere.
- The card tool takes `spike`; the guide and changelog name it; gate validate, node and test are green.

## Review

Brain review (Opus 5.5): Built as designed. spikeLinkOf sits beside fixesOf. CardClassRecord.spike is set at dispatch, and the spawn row's appendLedger copies it beside fixes and linked. spawnRow copies it after linked, and SpawnFields picks it up through the Omit. A bad value warns with the 40-character cut and records nothing. The card tool writes spike: after fixes:, refuses a bad value, and refuses it with lanes like fixes. Both choices are sound: an empty string is refused, and the warning goes with the other warnings.
