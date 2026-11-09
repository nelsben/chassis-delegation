---
id: MOD-348
title: The brain record prices the main loop's cache writes at the 1-hour rate, prices Fable 5.2, names the model version in its pair, counts requests and context, and the stamp goes on spawn rows too
domain: mod
tier: standard
status: merged
scope: [hooks/lib/brain.ts, hooks/lib/cost.ts, hooks/lib/storeloss.ts, hooks/register.ts, tests/*.test.ts, tests/node/*.node.mjs, tests/harness.ts, docs/internals.md, docs/spend.md, CHANGELOG.md]
forbid: [bin/**, .claude-plugin/**, hooks/lib/version.ts, hooks/lib/allow.ts, hooks/templates/**, tests/fixtures/**, docs/cards/**]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/brainstamp.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

A review of 0.9.55 against a long session's own transcript found four things wrong with what the mod records about the brain:

1. **Brain dollars are about 30% low.** The host's turn usage carries no split of cache writes by TTL, so `tokensOf` sees no 1-hour tokens and every cache write is priced at 1.25x input. The main loop of the host writes 1-hour cache entries (2x input); workers write 5-minute entries. Worker dollars are right, brain dollars are not.
2. **Fable 5.2 has no price row**, so a brain turn on it sets `unpriced` and adds no dollars.
3. **The pair says only the family** (`fable/medium`), so two versions of one family with different prices read as one setup.
4. **A reader of the ledger cannot say what the brain spent on one card.** The stamp carries one running total and one winning pair, only on judged and merged rows. A session that changes model or effort part way, or cuts thirty cards, reads as one setup and one total.

This card fixes the record and the stamp. A later card (the scorecard) reads the differences between stamps.

## Before you start

- `hooks/lib/brain.ts`, the top 115 lines: `BrainRecord`, `brainPair`, `brainTurn`, `BrainStamp`, `brainStamp`, `brainFamily`.
- `hooks/lib/cost.ts`: `TABLE`, `priceFor`, `UsageLike`, `tokensOf`, `usdOf`, `addTurn`.
- `hooks/register.ts`: the module variable `brainEffort` and its comment; `brainStampNow`; the main-loop `turn.complete` line that calls `flushDrive($, u ? r => brainWindow(brainTurn(r, u, brainEffort), brainWindowCache) : undefined)`; the `turn.step` hook; the one `appendLedger($, spawnRow({ ...spawn, …` call.
- `hooks/lib/storeloss.ts`: `SpawnRow`, `SpawnFields`, `spawnRow`.
- `tests/node/brainstamp.node.mjs`, whole.

## Design (decided by the brain; build it, do not redesign it)

### 1. Two price rows (`hooks/lib/cost.ts`)

Add to `TABLE`, beside the 5.1 rows:

```ts
['fable-5-2', { in: 8, out: 40, cacheRead: 0.2 }],
['mythos-5-2', { in: 8, out: 40, cacheRead: 0.2 }],
```

The 5.1 rows stay as they are. In the comment above the table, change the date the prices were checked to 2026-11-09, and replace the words `(Claude Code writes 1-hour entries)` with: `(the host's main loop writes 1-hour entries and its subagents 5-minute ones; a turn's usage carries no split, so brainTurn prices the main loop's writes at the 1-hour rate)`. `tokensOf`, `usdOf`, `addTurn` and `priceFor` do not change, so no worker's dollars change.

### 2. The main loop's cache writes are 1-hour writes (`brainTurn`)

At the top of `brainTurn`, before anything reads `u`:

```ts
// MOD-348: the host's turn usage has no TTL split; the main loop writes 1-hour entries
const u1: UsageLike = u.cache_creation ? u : { ...u, cache_creation: { ephemeral_1h_input_tokens: u.cache_creation_input_tokens || 0 } }
```

and use `u1` everywhere `u` was used below it (`tokensOf`, `addTurn`; `priceFor(u.model)` may stay). A usage that carries its own `cache_creation` object is priced by that split, as today. The record's `tokens` therefore gains `cacheWrite1h` (through `addTurn`), which is wanted.

### 3. The pair names the model version (`brainLabel`, `brainPair`)

New export in `hooks/lib/brain.ts`:

```ts
/** MOD-348: `<family>-<major>[.<minor>]` of a model id (`fable-5.2`); the bare family for an alias; `other` when no family is named. */
export function brainLabel(model: string | undefined): string
```

Rule: lowercase the id; take the first match of `/(fable|opus|sonnet|haiku)-(\d{1,2})(?:-(\d{1,2}))?(?!\d)/`; with a match the label is `` `${family}-${major}` `` plus `` `.${minor}` `` when the minor matched; with no match the label is `brainFamily(model)`.

| Model | Label |
|---|---|
| `claude-fable-5-2` | `fable-5.2` |
| `claude-opus-5-5[1m]` | `opus-5.5` |
| `claude-haiku-4-5-20251001` | `haiku-4.5` |
| `us.anthropic.claude-haiku-4-5-v1:0` | `haiku-4.5` |
| `claude-sonnet-5` | `sonnet-5` |
| `claude-opus-5-20260101` | `opus-5` |
| `claude-3-5-sonnet-20241022` | `sonnet` |
| `opus` | `opus` |
| `sonnet[1m]` | `sonnet` |
| `gpt-x`, `undefined` | `other` |

`brainPair(model, effort)` becomes `` `${brainLabel(model)}/${effort or 'default'}` `` (the effort rule is unchanged: trimmed, lowercased, `default` when empty). `brainFamily` does not change, and nothing that calls `brainFamily` today (the delegateOnly guard, the `/delegation` line, the dashboard) moves to `brainLabel`.

### 4. A pair counts requests and context (`BrainRecord.byPair`, `brainTurn`)

`byPair` entries become `{ usd: number; turns: number; steps?: number; ctx?: number }`.

- `steps`: model requests. `brainTurn` gains a fourth parameter, `brainTurn(acc, u, effort?, steps?)`. The turn adds `steps` to its pair when `steps` is a finite number of 1 or more (floored), else it adds 1: a turn that reported usage made at least one request.
- `ctx`: prompt tokens. The turn adds `t.in + t.cacheRead + t.cacheWrite` to its pair.
- An entry stored before this card has neither key; read each as 0.

So `ctx / steps` over any span is the average context per request, and `steps` is the request count.

In `hooks/register.ts`:

- A new module variable beside `brainEffort`: `let brainSteps = 0`, with a one-line comment (`MOD-348: main-loop steps since the last main-loop turn.complete`).
- In the `turn.step` hook, where `brainEffort` is set: `if (!e.agentId) brainSteps++`.
- At the main-loop `turn.complete` line, read the count into a local, reset `brainSteps = 0` whether or not the turn has a `usage`, and pass the local as the fourth argument of `brainTurn`.

### 5. The stamp carries every pair (`BrainStamp`, `brainStamp`)

`BrainStamp` gains `pairs?: Record<string, { usd: number; turns: number; steps: number; ctx: number }>`: a copy of the record's `byPair`, each entry with all four keys (`steps` and `ctx` 0 when the stored entry lacks them), `usd` rounded with `round4`. The key is left out when `byPair` is empty or absent. Every existing key of the stamp keeps its meaning; `pair` is still the pair with the most dollars.

### 6. Spawn rows carry the stamp

- `hooks/lib/storeloss.ts`: `SpawnRow` gains `brain?: BrainStamp` (a type-only import from `./brain`); `spawnRow` copies it through with the same conditional-spread shape as its neighbours (`...(s.brain ? { brain: s.brain } : {})`).
- `hooks/register.ts`: at the one place a spawn row is appended, read `await brainStampNow($)` and pass it as `brain` in the fields given to `spawnRow` (left out when undefined). Nothing else that builds or reads a spawn record changes; the stamp is on the ledger row only, not on the spawn record kept in the store.

### 7. Tests, with their expected numbers

In `tests/node/brainstamp.node.mjs` (pure, no engine):

- `brainLabel` gives every row of the table in Design 3; `brainPair('claude-fable-5-2', ' High ')` is `'fable-5.2/high'`; `brainPair('opus', undefined)` is `'opus/default'`.
- `priceFor('claude-fable-5-2')` and `priceFor('claude-mythos-5-2')` are `{ in: 8, out: 40, cacheRead: 0.2 }`; `priceFor('claude-fable-5-1')` is still `{ in: 10, out: 50, cacheRead: 0.25 }`.
- Turn A: `brainTurn(undefined, { model: 'claude-opus-5-5', input_tokens: 1000, output_tokens: 1000, cache_read_input_tokens: 100000, cache_creation_input_tokens: 10000 }, 'medium', 3)` gives `usd` 0.124, `tokens` `{ in: 1000, out: 1000, cacheRead: 100000, cacheWrite: 10000, cacheWrite1h: 10000 }`, and `byPair` `{ 'opus-5.5/medium': { usd: 0.124, turns: 1, steps: 3, ctx: 111000 } }`. (4000 + 20000 + 20000 + 80000 micro-dollars.)
- The same usage with `cache_creation: { ephemeral_5m_input_tokens: 10000 }` gives `usd` 0.094 and no `cacheWrite1h` in `tokens`.
- Turn B on Turn A's record: `{ model: 'claude-fable-5-2', input_tokens: 100, output_tokens: 2000, cache_read_input_tokens: 200000, cache_creation_input_tokens: 5000 }`, effort `'high'`, no `steps` argument, gives record `usd` 0.3248, `unpriced` false, and `byPair['fable-5.2/high']` `{ usd: 0.2008, turns: 1, steps: 1, ctx: 205100 }`. (800 + 80000 + 40000 + 80000 micro-dollars.)
- `brainStamp` of that record with `since` 7 has `pair: 'fable-5.2/high'` and `pairs` equal to `{ 'opus-5.5/medium': { usd: 0.124, turns: 1, steps: 3, ctx: 111000 }, 'fable-5.2/high': { usd: 0.2008, turns: 1, steps: 1, ctx: 205100 } }`.
- A record whose `byPair` is `{ 'fable/medium': { usd: 2, turns: 3 } }` (as 0.9.55 stored it) stamps `pairs` `{ 'fable/medium': { usd: 2, turns: 3, steps: 0, ctx: 0 } }`; a record with no `byPair` stamps no `pairs` key.
- `spawnRow` with a `brain` stamp in its fields returns a row whose `brain` equals it; without one the row has no `brain` key.

In the engine tests (each costs about 600 ms; add no more than these two, in whichever existing file fits):

- Two main-loop `turn.step` events, one `turn.step` with an `agentId`, then a main-loop `turn.complete` with a usage: the brain record's pair has `steps: 2`. A second main-loop turn with one step adds 1, not 3.
- A briefed spawn after one main-loop turn writes a spawn row to the ledger whose `brain.turns` is 1 and whose `brain.pairs` has one key.

### 8. Existing assertions

This design changes values that existing tests pin: the pair string (`fable/default` becomes the versioned label of whatever model that test uses), the shape of `byPair` entries (two more keys), the stamp (a `pairs` key), the dollars and `tokens` of a brain turn that has cache-write tokens and no `cache_creation`, and the list of price prefixes in `tests/cost.test.ts`. Every test file is in scope for that reason. Change an existing assertion only where this design changes its value, and to the value this design gives; remove none. Known places: `tests/node/brainstamp.node.mjs`, `tests/brain.test.ts`, `tests/merge.test.ts`, `tests/compaction.test.ts`, `tests/options.test.ts`, `tests/cost.test.ts`. Run the whole `test` gate to find any other.

### 9. Left to you (list each as a `choice:` line in your hand-back, above the report)

- Local names and helpers.
- Which engine test file each of the two engine tests goes in.
- Each existing assertion you changed: one `choice:` line per file, saying how many and why.
- The wording of the docs sentences and the CHANGELOG bullets.

## Done when

- The tests of Design 7 exist, fail before the change and pass after; all three gates pass: validate, node, test.
- `docs/internals.md`, Store and ledger, gains one bullet after the MOD-344 bullet: the pair is now `<family>-<major>[.<minor>]/<effort>`; a pair entry carries `steps` (model requests) and `ctx` (prompt tokens); the stamp carries `pairs`, the running totals of every pair, so the difference between two stamps of one `since` is what the brain spent between the two rows; a spawn row carries the stamp too.
- `docs/spend.md`, in "The dollars" bullet of the brain's spend: the brain's cache writes are priced at the 1-hour rate (2x input) because the host's main loop writes 1-hour entries and the turn usage carries no split; where a session's main loop writes 5-minute entries the brain's figure is a ceiling; workers are priced as before.
- `CHANGELOG.md` gains a `## Unreleased` section above `## 0.9.55 — 2026-11-08` with `### Added` (one bullet: `pairs`, `steps`, `ctx`, the versioned pair, the stamp on spawn rows; one bullet: the Fable 5.2 and Mythos 5.2 price rows) and `### Fixed` (one bullet: the brain's cache writes were priced at the 5-minute rate, which understated brain dollars; say that records already stored are not repriced). Each bullet is bold like its neighbours and ends `(MOD-348).`
- No file under `bin/` changes; `node bin/evidence.mjs` output over the fixtures is unchanged.

## Review

Brain review: the diff matches the card's Design 1 to 9. cost.ts gains the two 5.2 rows and nothing else changes there; brainTurn prices a usage with no split at the 1-hour rate and leaves a usage that has a split alone; brainLabel is the regex the card gave and brainFamily is untouched; byPair gains steps and ctx, the stamp gains pairs, the spawn row carries the stamp, and the step counter resets at every main-loop turn.complete. The node test holds the card's numbers (0.124, 0.094, 0.3248, 0.2008, ctx 111000 and 205100). Existing assertions changed only where the 1-hour rate or the versioned label moves the value (brain, hooks3, merge, cost tests). No file under bin/ changed. Nit, not blocking: the type import in storeloss.ts sits below the first export.
