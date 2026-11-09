---
id: MOD-350
title: An issue state read for the card match is remembered for ten minutes, so the card call, the dry run and the dispatch of one card read each issue once
domain: mod
tier: standard
status: merged
scope: [hooks/lib/issuematch.ts, hooks/register.ts, tests/node/issuematch.node.mjs, tests/issuematch.test.ts, tests/*.test.ts, tests/node/*.node.mjs, tests/harness.ts, docs/internals.md, CHANGELOG.md]
forbid: [hooks/lib/allow.ts, .claude-plugin/**, bin/**, docs/cards/**]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/issuematch.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 8
---
## Why

Since MOD-339 the card match reads the state of up to six candidate issues, one `gh issue view` each, every time a card is written and every time it is dispatched (dry run and real). One card therefore pays for the same reads three times within a few minutes, each a network call of up to 15 seconds. The state of an issue almost never changes in that window. This card remembers a state that was read, for ten minutes, so the second and third pass run no `gh` at all.

## Before you start

- `hooks/lib/issuematch.ts`, whole (it is short). `MATCH_POOL`, `matchPlanned` and `openCandidates` are what the lookup feeds.
- `hooks/register.ts`: `plannedFor` (search `async function plannedFor`), the `now($)` helper (search `async function now(`), and the `on('session.start', …)` hook (search `MOD-239: the brain key is read once here`).
- `tests/issuematch.test.ts`: the block `MOD-339: a closed planned task is never suggested` and its helpers `planned`, `stateOf`, `cardRun`; a test reads the commands the mod ran from `w.runs` (each has `argv`).
- `tests/node/issuematch.node.mjs`: how the pure tests import the library.
- `docs/internals.md`: the MOD-339 text on the issue view.

## Design (decided by the brain; build it, do not redesign it)

### 1. Two pure helpers in `hooks/lib/issuematch.ts`

```ts
/** MOD-350: how long a read issue state is trusted. */
export const STATE_TTL_MS = 10 * 60 * 1000
/** MOD-350: the most entries the cache holds; past it the cache is emptied. */
export const STATE_CACHE_MAX = 200
export type StateCache = Map<string, { state: string; at: number }>
export function cachedState(cache: StateCache, repo: string, n: number, now: number): string | undefined
export function rememberState(cache: StateCache, repo: string, n: number, state: string, now: number): void
```

- The key is `` `${repo.toLowerCase()}#${n}` `` (`repo` is `owner/name`).
- `cachedState` returns the entry's `state` when an entry exists and `now - at` is `0` or more and less than `STATE_TTL_MS`. Otherwise it returns `undefined`; an entry that is too old, or whose `at` is later than `now`, is deleted from the map before returning.
- `rememberState` sets the entry to `{ state, at: now }`. Before setting, when the map already holds `STATE_CACHE_MAX` entries and has no entry for this key, it clears the map.
- Neither helper reads a clock or touches `$`.

### 2. The cache in `hooks/register.ts`

- One module-level `const issueStates: StateCache = new Map()` beside the other module-level state.
- The `session.start` hook calls `issueStates.clear()` as one of its first statements, next to `drivePending = undefined`.
- In `plannedFor`, read the time once before the loop (`const at = await now($)`). For each candidate of the pool: first `cachedState(issueStates, ownerRepo, c.number, at)`; a hit goes straight into `states` and no command runs. On a miss the `gh issue view` runs exactly as it does today, and when it yields a string state, that state goes into `states` and into `rememberState(issueStates, ownerRepo, c.number, state, at)`.
- A read that fails (not ok, non-zero exit, not JSON, no string `state`) is **not** remembered: the next pass tries again, and the candidate is kept as today.
- The `gh` argv is unchanged, field list included. The allowlist pins that shape; `hooks/lib/allow.ts` is forbidden.
- `landRepo = ownerRepo` stays where it is, set whether or not any command runs.
- Both `OPEN` and `CLOSED` states are remembered alike. Nothing is written to the store or to disk: the cache lives in the module, so a reload or a new session starts empty.

### 3. Tests

Node tests, in `tests/node/issuematch.node.mjs` under one `MOD-350` describe:

- a remembered state is returned inside the window and at `now === at`;
- it is not returned at exactly `at + STATE_TTL_MS`, and the entry is gone from the map afterwards;
- an entry whose `at` is later than `now` is not returned;
- the key ignores the letter case of the repo and keeps two repos and two numbers apart;
- the map is cleared when a new key arrives at `STATE_CACHE_MAX` entries, and is not cleared when an existing key is set again.

Engine tests, in `tests/issuematch.test.ts` under one `MOD-350` describe, built on `cardRun`, `planned` and `stateOf`:

- two card tool calls in one session over the same two candidates run one `gh issue view` per candidate in total (count the `w.runs` entries whose `argv` starts `gh issue view`), and the second call's text still drops the closed candidate and names the open one;
- a candidate whose view fails on the first call is read again on the second call (two views for it in `w.runs`).

The second card call needs its own title so it writes a second card file; everything else about the call stays as in `given`.

### 4. Docs

- `docs/internals.md`: one MOD-350 sentence or bullet beside the MOD-339 text: a read state is kept in memory for ten minutes per session, a failed read is not kept, the cache is cleared at session start.
- `CHANGELOG.md`, under `## Unreleased` → `### Changed`: one bullet in the style of its neighbours, starting with the bold summary and ending `(MOD-350)`.

## Left to you (list each as a `choice:` line)

- Whether the engine tests also cover expiry by moving the test clock past ten minutes. The node tests already pin the window; add the engine case only if the harness clock makes it a few lines.
- The exact placement of `issueStates` among the module-level variables, and the wording of the comments and the docs sentence.

## Done when

- `cachedState`, `rememberState`, `STATE_TTL_MS`, `STATE_CACHE_MAX` and `StateCache` are exported from `hooks/lib/issuematch.ts` and behave as section 1 says; the node tests of section 3 pass.
- In one session, a second card call or dispatch over the same candidates inside ten minutes runs no `gh issue view` for a candidate whose state was read; a failed read is tried again; the engine tests of section 3 pass.
- The `gh issue view` argv in `plannedFor` is byte-for-byte what it was, and the allowlist is untouched.
- `session.start` empties the cache; every existing test of `tests/issuematch.test.ts` passes unchanged.
- `docs/internals.md` and `CHANGELOG.md` carry the lines of section 4.
- The gates `validate`, `node` and `test` pass.

## Review

Brain review: built to the Design. The two helpers are pure and match section 1; plannedFor reads the clock once, takes a hit without running gh, remembers only a string state, and the gh argv is unchanged; session.start empties the cache. Worker choices accepted: no engine expiry test (node tests pin the window); the failed-read engine test compares counts before and after because one card call runs the match more than once (the card write and its dry run), which is also why one call already saves reads; the internals line sits in Store and ledger since there was no MOD-339 text to sit beside.
