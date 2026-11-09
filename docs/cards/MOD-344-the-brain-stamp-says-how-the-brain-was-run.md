---
id: MOD-344
title: The brain stamp says how the brain was run: model and effort, context window, compactions
domain: mod
tier: standard
status: merged
scope: [hooks/lib/brain.ts, hooks/register.ts, tests/node/brainstamp.node.mjs, tests/brain.test.ts, tests/compaction.test.ts, tests/harness.ts, docs/internals.md, CHANGELOG.md]
forbid: [hooks/lib/allow.ts, hooks/lib/cost.ts, hooks/lib/attempts.ts, hooks/lib/storeloss.ts, hooks/lib/compact.ts, hooks/lib/version.ts, hooks/templates/**, .claude-plugin/**, docs/cards/**, bin/**]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/brainstamp.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 8
---
## Why

MOD-342 put the brain's running spend on judged and merged ledger rows. It does not say which model and effort level the brain ran at, how large its context window was, or how often the conversation was compacted. The person running the mod switches the brain between models and effort levels and has set a smaller compaction window, and has no data on what either does to cost or to the quality of the cards that session cut. This card records those facts on the same stamp. A later card (MOD-345) reads them.

## Before you start

- `hooks/lib/brain.ts` (pure): `BrainRecord`, `emptyBrain`, `brainTurn(acc, u)`, `brainFamily(model)` (`fable`, `opus`, `sonnet`, `haiku`, `other`), and MOD-342's `BrainStamp` and `brainStamp(rec, since)`.
- `hooks/register.ts`:
  - the `turn.step` hook: `e.agentId` is absent for a main-loop request; `e.effort` is `'low' | 'medium' | 'high' | 'xhigh' | 'max' | number | undefined`; `e.model` is the model of that request.
  - the `turn.complete` hook: the main-loop branch that calls `flushDrive($, u ? r => brainTurn(r, u) : undefined)`.
  - the `session.compact` hook: it returns `next(e)` early for a subagent (`e.agentId !== undefined`), and otherwise appends the delegation block to the instructions. `e.trigger` is `'manual' | 'auto' | 'plugin' | 'precompute'`. The result of `next` is either a compacted result or `{ skip: string }`.
  - `brainKey($)`: it already calls `$.session.usage()` for `startedAt`. The same result has `context.window` (the context window of the session's model, in tokens) and `context.tokens` (the input tokens the last response was answered over; may be absent).
  - `updateBrain($, fn)` and MOD-342's `brainStampNow($)`.
- `tests/compaction.test.ts`: how a test fires `session.compact`.

## Design (decided by the brain; build it, do not redesign it)

### 1. The record (`hooks/lib/brain.ts`, all pure)

`BrainRecord` gains four optional fields. They are optional so a record stored before this card still reads; `emptyBrain()` is unchanged.

```ts
/** MOD-344: dollars and turns by `<family>/<effort>` (`opus/medium`); the effort is `default` when the step named none. */
byPair?: Record<string, { usd: number; turns: number }>
/** MOD-344: compactions of the main conversation this session. */
compactions?: number
/** MOD-344: the context tokens just before the latest compaction: the window the session really ran at. */
compactTokens?: number
/** MOD-344: the context window of the session's model, in tokens, as the host reports it. */
window?: number
```

New functions:

```ts
export function brainPair(model: string | undefined, effort: string | number | undefined): string
export function brainTurn(acc: BrainRecord | undefined, u: UsageLike, effort?: string | number): BrainRecord   // third parameter is new
export function brainCompacted(acc: BrainRecord | undefined, tokens?: number): BrainRecord
export function brainWindow(acc: BrainRecord | undefined, window: number | undefined): BrainRecord
```

- `brainPair`: `` `${brainFamily(model)}/${e}` `` where `e` is the effort as a lower-case trimmed string, a number as its decimal text, and `default` when it is undefined or blank.
- `brainTurn` with a third argument also adds the turn's dollars (the same `usd` it adds to the total) and one turn to `byPair[brainPair(u.model, effort)]`, rounded with `round4`. Called with two arguments it adds to the pair with effort `default`. Every other field behaves as today.
- `brainCompacted`: `compactions` plus 1 (from 0 when absent); `compactTokens` set to `tokens` when it is a finite number above 0, else left as it was.
- `brainWindow`: sets `window` when the argument is a finite number above 0; otherwise returns the record unchanged (the same object when `acc` is defined).

### 2. The stamp

`BrainStamp` becomes `{ since, usd, turns, edits, pair?, window?, compactions, compactTokens? }`:

- `pair`: the key of `byPair` with the most dollars; a tie goes to more turns, then to the key that sorts first. Absent when the record has no `byPair`.
- `compactions`: the record's count, 0 when absent. Always written.
- `window`, `compactTokens`: copied when the record has them.

### 3. The hooks (`hooks/register.ts`)

- A module variable holds the effort of the latest main-loop step: set in the `turn.step` hook when `e.agentId` is absent, from `e.effort` (undefined clears it). A subagent's step never sets it.
- The main-loop `turn.complete` passes it: `brainTurn(r, u, <that effort>)`.
- Where `brainKey` reads `$.session.usage()`, keep `context.window` in a cache beside the key's (set and cleared in the same places). The main-loop `turn.complete` update applies `brainWindow(…, <cached window>)` to the record in the same write as `brainTurn`: no extra store write and no extra `session.usage()` call per turn.
- The `session.compact` hook, for the main conversation only (`e.agentId === undefined`) and a trigger other than `precompute`: read `(await $.session.usage()).context.tokens` before calling `next` (any throw gives undefined); after `next` returns, when the result has no string `skip`, call `updateBrain($, r => brainCompacted(r, tokens))`. This holds on both of the hook's paths (the block built, and the block not built). What the hook passes to `next` and returns is unchanged. A failure to record never fails the compaction: catch and `debug`.

### 4. The cases

Pure (`tests/node/brainstamp.node.mjs`, added to MOD-342's tests):

| Input | Result |
|---|---|
| `brainPair('claude-opus-5-5', 'medium')` | `opus/medium` |
| `brainPair('claude-fable-5-1', ' High ')` | `fable/high` |
| `brainPair('claude-sonnet-5-5', undefined)` | `sonnet/default` |
| `brainPair(undefined, 3)` | `other/3` |
| `brainTurn(undefined, <one opus usage>, 'medium')` | `byPair` is `{ 'opus/medium': { usd: <the record's usd>, turns: 1 } }` |
| then `brainTurn(<that>, <one opus usage>, 'high')` | two keys, one turn each; the record's `usd` equals the sum of the two pair dollars |
| `brainTurn(undefined, <one opus usage>)` | key `opus/default` |
| `brainCompacted(undefined, 240000)` | `compactions` 1, `compactTokens` 240000 |
| `brainCompacted(<that>, undefined)` | `compactions` 2, `compactTokens` 240000 |
| `brainWindow(<a record>, 1000000)` | `window` 1000000 |
| `brainWindow(r, 0)` and `brainWindow(r, NaN)` | `r` itself |
| `brainStamp` of a record with `byPair` `{ 'opus/medium': { usd: 2, turns: 5 }, 'fable/low': { usd: 3, turns: 1 } }`, `window` 1000000, `compactions` 2, `compactTokens` 240000 | has `pair: 'fable/low'`, `window: 1000000`, `compactions: 2`, `compactTokens: 240000` |
| `brainStamp` of a record with equal dollars in two pairs, 5 turns against 1 | `pair` is the one with 5 turns |
| `brainStamp` of a record from before this card (no new fields, `turns` 2) | no `pair`, no `window`, no `compactTokens`, `compactions: 0` |

MOD-342's row "the result's keys: exactly `since`, `usd`, `turns`, `edits`" is updated to the old-record row above (`since`, `usd`, `turns`, `edits`, `compactions`).

Engine:

- `tests/brain.test.ts`: a main-loop `turn.step` with `effort: 'medium'` on an opus model, then its `turn.complete` with a usage, gives a brain record whose `byPair` has `opus/medium` with 1 turn; a subagent's `turn.step` with another effort in between does not change the pair.
- `tests/compaction.test.ts`: a `session.compact` with trigger `auto` on the main conversation after a brain turn gives a record with `compactions` 1; with trigger `precompute`, or with an `agentId`, the count does not move; the instructions the hook passes on are the same as before this card (no existing assertion changes).

### 5. Left to you (list each as a `choice:` line in your hand-back, above the report)

- Local names and the names of the two cache variables.
- How the engine tests supply `context.window` and `context.tokens` from the test host (extend `tests/harness.ts` only if it cannot already do so).
- The wording of the docs sentences and the CHANGELOG bullet.

## Done when

- Every row of the pure table is a test; the new ones fail before the change and pass after.
- The engine cases pass, and no existing assertion is removed.
- The four functions are exported from `hooks/lib/brain.ts` as Design 1 signs them, with no `$` call.
- No extra `$.session.usage()` call is made per turn or per ledger row: only the one per compaction.
- `docs/internals.md`, in Store and ledger, lists the stamp's new keys and says what `pair`, `window` and `compactTokens` each measure, in one sentence each.
- `CHANGELOG.md` has one bullet under `## Unreleased` / `### Added`, in the style of the bullets below it, ending `(MOD-344).`
- All three gates pass: validate, node, test.

## Review

Brain review: source diff read whole. The record fields, brainPair, brainTurn's third parameter, brainCompacted, brainWindow and the stamp's pair rule are as Designs 1 and 2 give them. The hooks read the effort from main-loop steps only, read the window in the key's own session.usage call, and count a compaction only for the main conversation, a trigger other than precompute and a result that was not skipped; a recording failure is caught. One brain grant: tests/merge.test.ts, where MOD-342's merged-row assertion pins the whole stamp; the card's scope missed it. Worker choices (4 listed): cache names, the harness tokens field, docs wording, the default redraw on the compaction write.
