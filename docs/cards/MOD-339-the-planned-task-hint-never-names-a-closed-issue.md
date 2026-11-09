---
id: MOD-339
title: The card tool's planned-task hint never names a closed issue: a plan item filed closed is skipped, and each remaining candidate's state is read before it is suggested
domain: mod
tier: standard
status: merged
scope: [hooks/lib/issuematch.ts, hooks/register.ts, tests/node/issuematch.node.mjs, tests/issuematch.test.ts, tests/harness.ts, docs/configuration.md, docs/guide.md, CHANGELOG.md]
forbid: [hooks/lib/allow.ts, hooks/lib/reconcile.ts, hooks/lib/landtree.ts, hooks/lib/card.ts, hooks/lib/version.ts, hooks/templates/**, .claude-plugin/**, docs/cards/**]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/issuematch.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 8
---
## Why

A card with no `issue:` is matched against the planned tasks the mod filed, and the card tool prints `planned task #n "<title>" overlaps this scope; pass issue: n`. In an adopting repo, 20 of the 22 hint lines printed over three days named an issue that was already closed, because a candidate read from a plan file is never checked for its state. Following the hint would link a card to a closed issue, so the hint was ignored and 11 cards stayed unlinked. Under `issueMatch require` the same stale candidate would refuse the card.

## Before you start

Read these. They are the whole mechanism.

- `hooks/lib/issuematch.ts` (pure): `plannedFromLanded` skips a landed file that has a `closed:` line; `plannedFromPlan` reads a plan file's items and keeps every item with an `issue`, with no closed check; `matchPlanned(scope, planned, named)` scores by path overlap and returns the first `MATCH_LIMIT` (3).
- `hooks/register.ts`, function `plannedFor($, root, scope, cardDirs)`: reads the landed folder and the plans folder, builds the set of issue numbers a card or a ledger row already names, and returns `matchPlanned(...)`. Its two callers (the dispatch dry run and the card tool) print the suggestion lines, or refuse under `issueMatch require`.
- `hooks/register.ts`, function `treeWith` and its neighbours: the existing read of one issue, by this exact argv: `['gh', 'issue', 'view', String(n), '--repo', ownerRepo, '--json', 'number,title,state,labels,body,subIssues']` through `run($, argv, { cwd: root, timeoutMs: … })`. `ownerRepo` comes from `ownerRepoOf(gitConfigValue(<.git/config text>, 'remote "origin"', 'url'))`, as the dry run already computes it for the `issue:` note.
- `hooks/lib/landtree.ts` (read only): a plan item may carry `close`, the evidence text for an item that was done before filing. `tree_import` files such an item and closes it at once.
- `tests/node/issuematch.node.mjs` and `tests/issuematch.test.ts`: the existing tests, and how the engine test stubs `gh`.

## Design (decided by the brain; build it, do not redesign it)

### 1. A plan item filed closed is never a candidate (no network)

In `plannedFromPlan`, an item whose `close` is a string with a non-blank character is not pushed. Its children are still walked, with this item's issue as their parent, exactly as now.

### 2. A wider pool, then a state check

- `matchPlanned` gains a fourth parameter, `limit: number = MATCH_LIMIT`. Behaviour with three arguments is unchanged.
- New constant `export const MATCH_POOL = 6`.
- New pure function in `hooks/lib/issuematch.ts`:

```ts
/** The candidates whose issue is not known to be closed, first `limit`; a number absent from `states` is kept. */
export function openCandidates<T extends { number: number }>(cands: readonly T[], states: ReadonlyMap<number, string>, limit: number = MATCH_LIMIT): T[]
```

  A candidate is dropped only when `states` holds its number with a value that is `closed` in any letter case. Order is kept.

- In `plannedFor`: ask `matchPlanned` for `MATCH_POOL` candidates. With none, return `[]` and run no `gh`. Otherwise read the origin's owner/repo; when it is known, run the issue view above once per pool candidate (at most 6), each with `timeoutMs: 15000`, and put `state` from the JSON into the map. A run that does not start, exits non-zero or prints something that is not JSON adds nothing to the map: the candidate is kept. Return `openCandidates(pool, states, MATCH_LIMIT)`.
- Use that argv exactly. Do not add a new `gh` shape and do not edit `hooks/lib/allow.ts` (forbidden). If the allowlist refuses the view in the card tool's context, stop and hand back gate=fail with an amend block that says so.
- Nothing is cached and nothing is written: the plan file is not changed.

### 3. The cases

Pure (node test):

| Input | Result |
|---|---|
| plan item `{ type: 'task', issue: 75, paths: ['a/x.ts'], close: 'done in OPS-1' }` | `plannedFromPlan` returns no item 75 |
| a parent `{ issue: 70, close: 'done', children: [{ type: 'task', issue: 71, paths: ['a/x.ts'] }] }` | item 71 is returned with parent 70; item 70 is not |
| `close: '   '` | the item is kept |
| `matchPlanned` with 5 overlapping tasks and `limit` 6 | 5 returned; with no fourth argument, 3 |
| `openCandidates([#1, #2, #3, #4], { 1: 'CLOSED', 3: 'closed' })` | `[#2, #4]` |
| `openCandidates([#1, #2], {})` | `[#1, #2]` (unknown is kept) |
| `openCandidates([#1..#5], { 1: 'OPEN' }, 3)` | `[#1, #2, #3]` |

Engine (`tests/issuematch.test.ts`), with `gh` stubbed:

- A card whose scope overlaps planned tasks #75 (the stub answers `state: CLOSED`) and #58 (`OPEN`) gets a hint line for #58 and none for #75.
- With four closed candidates ahead of an open fifth by overlap, the open one is suggested.
- With `gh` failing for every view, the hints are printed as before this card.
- Under `issueMatch require`, a card whose only candidate is closed is written, not refused.
- A card whose scope overlaps no planned task runs no `gh issue view`.

### 4. Left to you (list each as a `choice:` line in your hand-back, above the report)

- Local names, and whether the state read is a small helper inside `plannedFor` or beside it.
- The wording of the docs sentence and the CHANGELOG bullet.

## Done when

- `tests/node/issuematch.node.mjs` holds every row of the pure table as a test; the new ones fail before the change and pass after.
- `tests/issuematch.test.ts` holds the five engine cases and they pass.
- `plannedFromPlan`, `matchPlanned`, `MATCH_POOL` and `openCandidates` behave and are signed as Design 1 and 2 give them; `hooks/lib/issuematch.ts` still has no `$` call.
- `plannedFor` runs no `gh` when there is no candidate, at most 6 views otherwise, and keeps a candidate whose state it could not read.
- No file under `hooks/lib/` other than `issuematch.ts` is changed, and no plan or landed file is written.
- The docs that describe `issueMatch` (`docs/configuration.md`, and `docs/guide.md` where it describes the hint) say that a closed issue is never suggested and that an unreadable state keeps the hint.
- `CHANGELOG.md` has one bullet under a `## Unreleased` heading at the top (add the heading if it is absent), under `### Fixed`, in the style of the bullets below it, ending `(MOD-339).`
- All three gates pass: validate, node, test.

## Review

Brain review: diff read whole. Matches Design 1-3. Attempt 1 stopped as the card instructed when the allowlist refused the issue view from the card tool: the card's design missed that the view passes only once the land repo is set. The brain chose to set it in plannedFor the way the land and tree paths do; no allowlist change. Worker choices: state read inline; docs and changelog wording; the land repo stays set for the session.
