---
id: MOD-342
title: Judged and merged ledger rows carry the brain's spend so far in the session
domain: mod
tier: standard
status: merged
scope: [hooks/lib/brain.ts, hooks/register.ts, tests/node/brainstamp.node.mjs, tests/brain.test.ts, tests/merge.test.ts, tests/harness.ts, docs/internals.md, CHANGELOG.md]
forbid: [hooks/lib/allow.ts, hooks/lib/cost.ts, hooks/lib/attempts.ts, hooks/lib/storeloss.ts, hooks/lib/version.ts, hooks/templates/**, .claude-plugin/**, docs/cards/**, bin/**]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/brainstamp.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 8
---
## Why

The ledger records what each worker attempt cost. What the brain spent to cut, dispatch, verify and merge those cards lives only in the store, one record per session, and is lost to any reader of the ledger. So nobody can say what share of a delegated card's cost is the brain, or whether that share is moving. This card stamps the brain's running total onto the rows the mod already writes, with no new row kind and no new hook.

## Before you start

- `hooks/lib/brain.ts` (pure): `BrainRecord` (`usd`, `turns`, `edits`, `tokens`, `byModel`), `brainTurn`, `emptyBrain`.
- `hooks/register.ts`: `brainKey($)` and its cache `brainKeyCache` (the key is `K.brain(since)`, `since` being `(await $.session.usage()).startedAt ?? 0`), `refreshBrainKey`, and `readBrain($)`, which returns the session's record.
- `hooks/register.ts`, the two append sites this card touches:
  - in `finalizeOnce`, the judged row: the `appendLedger` call that carries `noRepo: noRepo || undefined`;
  - in `finishRecord`, the merged row: `appendLedger($, { kind: 'merged', task: id, sha, … })`.
- `appendLedger` skips a row whose key is already written (`ledgerHas`). Read `ledgerHas` and confirm the new field is not part of a row's key; if it is, stop and hand back gate=fail with an amend block that says so.

## Design (decided by the brain; build it, do not redesign it)

### 1. One pure function in `hooks/lib/brain.ts`

```ts
export type BrainStamp = { since: number; usd: number; turns: number; edits: number }
/** MOD-342: the brain's running total for a ledger row; undefined before its first turn. */
export function brainStamp(rec: BrainRecord | undefined, since: number): BrainStamp | undefined
```

- Undefined when `rec` is undefined or `rec.turns` is 0.
- Otherwise `{ since, usd: round4(rec.usd), turns: rec.turns, edits: rec.edits }`. Tokens and `byModel` are left out: the row stays small.
- A `since` that is not a finite number is written as 0.

### 2. The two rows

- A helper in `hooks/register.ts`, `brainStampNow($): Promise<BrainStamp | undefined>`: reads the record with `readBrain($)` and the session start the same way `brainKey` does, keeping the number in a cache beside `brainKeyCache` (set and cleared in the same places) so no extra `session.usage()` call is made per row. Any throw gives undefined.
- The judged row and the merged row each gain `...(stamp ? { brain: stamp } : {})`.
- No other row kind gains it: not spawn, accept, amend, pause or review rows.
- The stamp is a running total for the session at the moment the row is written. A reader takes the largest `usd` per `since`. That is said in the docs, in those words.
- The attempt record in the store does not gain the field: only the ledger row does.

### 3. The cases

Pure (`tests/node/brainstamp.node.mjs`):

| Input | Result |
|---|---|
| `brainStamp(undefined, 5)` | undefined |
| `brainStamp(emptyBrain(), 5)` | undefined |
| a record after one `brainTurn` on a priced model, `since` 5 | `{ since: 5, usd: <the record's usd>, turns: 1, edits: 0 }` |
| a record with `usd` 1.234567, `turns` 3, `edits` 2, `since` 9 | `{ since: 9, usd: 1.2346, turns: 3, edits: 2 }` |
| `since` `NaN` | `since` is 0 |
| the result's keys | exactly `since`, `usd`, `turns`, `edits` |

Engine:

- `tests/brain.test.ts`: after a main-loop `turn.complete` that carries a usage, a briefed worker's hand-back gives a judged ledger row whose `brain.turns` is 1 and whose `brain.usd` equals the brain record's `usd`; with no brain turn before the hand-back, the judged row has no `brain` key.
- `tests/merge.test.ts`: after a brain turn, the merged row written by a finish has a `brain` object with the same `since`.

### 4. Left to you (list each as a `choice:` line in your hand-back, above the report)

- Local names, and the cache variable's name.
- How the engine tests fire the brain turn (follow the nearest existing test in `tests/brain.test.ts`).
- The wording of the docs sentences and the CHANGELOG bullet.

## Done when

- Every row of the pure table is a test in `tests/node/brainstamp.node.mjs`; they fail before the change and pass after.
- The three engine cases pass.
- `brainStamp` and `BrainStamp` are exported from `hooks/lib/brain.ts` as Design 1 signs them, with no `$` call.
- Only the judged row and the merged row in `finishRecord` gain `brain`; no existing assertion is removed.
- `docs/internals.md`, in Store and ledger, names the `brain` field, its four keys, the two row kinds that carry it, and how a reader totals it.
- `CHANGELOG.md` has one bullet under a `## Unreleased` heading at the top (add the heading if it is absent), under `### Added`, in the style of the bullets below it, ending `(MOD-342).`
- All three gates pass: validate, node, test.

## Review

Brain review: source diff read whole. brainStamp is pure and returns undefined before the first turn; brainStampNow reads the cached session start, so no extra session.usage call per row; only the judged row in finalizeOnce and the merged row in finishRecord carry brain; nothing goes to the store. Worker choices (4 listed): names, how the engine tests fire the brain turn, the merge test fixture, docs wording.
