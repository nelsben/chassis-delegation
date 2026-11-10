---
id: MOD-361
title: A new repo option statusMap maps a repo's own card status words onto queued, merged or parked; a status is read by its first word; the Work view says how many cards carry a word the mod does not know
domain: mod
tier: standard
status: merged
issue: 493
parent: 492
scope: [hooks/lib/statusmap.ts, hooks/lib/repoconfig.ts, hooks/lib/configeff.ts, hooks/lib/configtable.ts, hooks/register.ts, .claude-plugin/plugin.json, tests/node/statusmap.node.mjs, tests/*.test.ts, tests/node/*.node.mjs, tests/harness.ts, docs/configuration.md, docs/contracts.md, docs/guide.md, CHANGELOG.md]
forbid: [bin/**, docs/cards/**, docs/mockups/**, hooks/lib/allow.ts, hooks/lib/version.ts, hooks/lib/dispatch.ts, hooks/lib/cardcache.ts, hooks/lib/work.ts, hooks/lib/workpane.tsx, hooks/lib/reconcile.ts, hooks/lib/attempts.ts, README.md, docs/upgrading.md]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/statusmap.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

The mod writes seven card status words (queued, claimed, blocked, merged, landed, parked, template) and compares a card's `status:` to them exactly. A study of adopter repos found cards whose status is the repo's own word: `done`, `held`, `open`, `todo`, `superseded`, `closed`, and values with text after the word such as `merged (PR 27, 2026-10-13)`. Every one of those reads as "some other word": the Work view lists a finished card as Queued, reconcile never counts it as merged, and its scope still counts against a new sibling card. In one repo that was 545 finished cards. This card lets a repo say what its words mean, reads a status by its first word, and makes the Work view say when cards carry a word it does not know.

## Before you start

- `hooks/lib/dispatch.ts`: `parseCard` (the `status` field, line `status: asText(f.status).trim() || undefined`) and `checkStatus`. Both are read-only for you.
- `hooks/register.ts`: `indexedCards` (search `async function indexedCards`), the one place every card-folder listing goes through; the dispatch status check (search `const refusal = checkStatus(card)`); `workData` (search `async function workData`), which builds the Work view's cards and its `notes`.
- Every place `mergeCheckMap` is declared: `statusMap` is declared beside each, the same way. `hooks/lib/repoconfig.ts` (the `RepoConfig` type, `REPO_KEYS`, the effective type, the parse `case`, the list of map keys that are JSON text in the options, the effective merge `{ ...repo.mergeCheckMap, ...user.mergeCheckMap, ...settings.mergeCheckMap }`), `hooks/lib/configeff.ts` (`MAP_FIELDS`), `hooks/lib/configtable.ts` (its row), `.claude-plugin/plugin.json` (its `userConfig` entry), `hooks/register.ts` (the `cfg` type and where `mergeCheckMap: eff.mergeCheckMap` is set).
- `tests/options.test.ts` (the `mergeCheckMap` lines), `tests/work.test.ts` (`describe('MOD-353: /delegation work'`), `tests/reconcile.test.ts` (`describe('MOD-340: a merged card with no ledger row'`), `tests/configcmd.test.ts` (the option count, 73 today).

## Design (decided by the brain; build it, do not redesign it)

### 1. Pure, a new file `hooks/lib/statusmap.ts` (header comment `// MOD-361`)

```ts
export const MOD_STATUS_WORDS = ['queued', 'claimed', 'blocked', 'merged', 'landed', 'parked', 'template'] as const
export const STATUS_TARGETS = ['queued', 'merged', 'parked'] as const
export type StatusMap = Readonly<Record<string, string>>
export function firstWord(raw: string): string | undefined
export function statusMapOf(v: unknown, errors: string[], where: string): Record<string, string> | undefined
export function statusRead(raw: string | undefined, map: StatusMap): string | undefined
export function unknownStatusNote(statuses: readonly (string | undefined)[]): string | undefined
```

- `firstWord(raw)`: the match of `/^[a-z][a-z0-9_-]*/` on `raw.trim().toLowerCase()`, or undefined when there is none.
- `statusMapOf(v, errors, where)`:
  - `v` is not a plain object (an array counts as not one): push `statusMap<where>: not an object (ignored)` and return undefined.
  - A key that starts with `_` is skipped without a word (a comment key, as in the other maps).
  - Each other entry: the key is trimmed and lower-cased, the value (when a string) trimmed and lower-cased. The entry is kept when the key matches `/^[a-z][a-z0-9_-]*$/`, is not one of `MOD_STATUS_WORDS`, and the value is one of `STATUS_TARGETS`. Otherwise it is dropped with one error: `statusMap.<key as written><where>: needs a word of the repo's own mapped onto queued, merged or parked (ignored)`.
  - Returns the kept entries (an empty object when none is kept).
- `statusRead(raw, map)`, first match wins:
  1. `raw` is undefined or has no first word: `raw` unchanged.
  2. the first word is a key of `map`: the mapped word.
  3. the first word is one of `MOD_STATUS_WORDS`: that word (so `Merged` and `merged (PR 27)` read as `merged`).
  4. otherwise `raw` unchanged.
  Rule 3 holds with an empty map too.
- `unknownStatusNote(statuses)`: takes statuses **as read** (after `statusRead`). A status counts when it is a non-empty string that is not one of `MOD_STATUS_WORDS`. With none counted: undefined. Otherwise one line. The words are each counted status's `firstWord`, or `(other)` when it has none, with a count each, ordered by count descending then word ascending; the first four are listed as `<word> <count>` joined by `, `, and when more remain the list ends `, +<k> more` (k is the number of further distinct words). The line, for one card: `1 card carries a status word the mod does not know (<list>): it reads as queued; map it onto queued, merged or parked with statusMap in .chassis-delegation.json`. For N > 1: `<N> cards carry a status word the mod does not know (<list>): they read as queued; map each onto queued, merged or parked with statusMap in .chassis-delegation.json`.

### 2. The option

`statusMap`, a map option of the repo, default `{}`, declared beside `mergeCheckMap` in each place listed above and merged key by key the same way (repo, then user, then settings).

- `repoconfig.ts`: the parse `case 'statusMap'` calls `statusMapOf(v, errors, where)` and keeps the result when it is not undefined. Add `statusMap` to the list of map keys read from JSON text.
- `configeff.ts`: add `statusMap` to `MAP_FIELDS`.
- `configtable.ts`: a row directly after `cardDir`'s: group `Where things go`, summary `What the repo's own card status words mean: each maps onto queued, merged or parked`, kind `map`, level `repo`, default `''`.
- `.claude-plugin/plugin.json`: an entry directly after `mergeCheckMap`'s, in the same shape: title `Status words (JSON)`; description: `A card status word of the repo's own mapped onto one of the mod's: queued, merged or parked, for example {"done":"merged","held":"parked","todo":"queued"}. The mod reads a card's status by its first word, lower-cased, so "merged (PR 27)" reads as merged; a first word in this map reads as the word it maps onto, wherever the mod lists the card folder (the Work view, the tree, reconcile, the sibling and blocker rules) and at /dispatch. A key may not be one of the mod's own words (queued, claimed, blocked, merged, landed, parked, template). The card file is never rewritten. Empty or 0 = the repo file (.chassis-delegation.json), else none; a value here is merged over it key by key`. Nothing else in the file changes.

### 3. Wiring in `hooks/register.ts`

- **`indexedCards`**: every card it returns has its status read through `statusRead(card.status, cfg.statusMap)`. A card whose status does not change is returned as the same object; one whose status changes is returned as a copy (`{ ...card, status }`): the cached card in the index is never mutated. This is the only change to listings: every caller of `indexedCards` then sees the read word, with no change at any call site.
- **Dispatch**: the line `const refusal = checkStatus(card) ?? …` checks the card with its status read the same way (`checkStatus({ ...card, status: statusRead(card.status, cfg.statusMap) })`). So a card `status: todo` under `{"todo":"queued"}` dispatches, and one `status: done` under `{"done":"merged"}` is refused as `<ID> is status merged; /dispatch takes a queued or claimed card`. Nothing else in dispatch changes.
- The session's own map (`cfg.statusMap`) is used for every folder, a card folder of another repo included. Do not look for another repo's config.
- **`workData`**: after the cards loop, `const statusNote = unknownStatusNote(cards.map(c => c.status))`. Every `notes` array the function returns gains `statusNote` as its last entry when it is not undefined (one small local helper; do not repeat the test at each return).
- No card file is ever rewritten by this card, and nothing that writes a status line changes.
- Not in this card (leave them as they are): `cardReadsMerged` in `hooks/lib/attempts.ts` (the owed-row retire check still reads the raw word), the merge tool's own read of the one card it merges, and `parseCard`.

### 4. Tests

- `tests/node/statusmap.node.mjs` (new, one `MOD-361` describe), with `toEqual`/`toBe`:
  - `firstWord`: `done`, ` Done `, `merged (PR 27)`, `closed-superseded`, `(none)` and `` (the last two give undefined).
  - `statusMapOf`: a good map; a key in capitals is lower-cased; a `_note` key is skipped with no error; a non-object and an array give the one error and undefined; a key that is a mod word (`merged`), a key with a space, a value outside the three targets (`blocked`) and a value that is not a string are each dropped with the entry error while the good entries beside them are kept.
  - `statusRead`: every rule of section 1, among them `Merged` and `merged (PR 27)` with an empty map, `done` with and without `{ done: 'merged' }`, `Held for review` under `{ held: 'parked' }`, and undefined.
  - `unknownStatusNote`: no unknown word (undefined, with mod words and undefined in the list); one card (the singular line); several words in count order with a tie broken by word; six distinct words (four listed, `+2 more`); a status with no first word counted under `(other)`.
- `tests/options.test.ts`, beside the `mergeCheckMap` lines: the repo file's `statusMap` is read; a bad entry gives its error line and the good entry beside it is kept.
- `tests/configcmd.test.ts`: the option count moves from 73 to 74.
- An engine describe `MOD-361` in `tests/work.test.ts`, built as its neighbours: three cards `status: done`, `status: held`, `status: open` and one `status: Merged (PR 27)`.
  - With no `statusMap`: `/delegation work text` counts 1 done (the `Merged (PR 27)` card), and carries the note for 3 cards (`done 1, held 1, open 1`).
  - With the repo file `{"statusMap":{"done":"merged","held":"parked"}}`: 2 done, the held card is not listed, and the note is the singular line for `open 1`.
- `tests/reconcile.test.ts`, one case beside the MOD-340 describe: a card `status: done` with `issue: <n>` and no ledger row. Without the map the sub-issue `<n>` is in no list (it has an in-flight card); with `{"statusMap":{"done":"merged"}}` it is listed as done elsewhere in that card.
- One engine case for dispatch, in the test file that already drives `/dispatch` refusals for a status (your pick): a card `status: todo` is refused as `is status todo` with no map and is not refused for its status under `{"statusMap":{"todo":"queued"}}`.
- An existing test that pins the whole text of a Work listing whose fixture cards carry a word outside the mod's seven now sees the note line: update the expectation; never change a fixture to dodge the line.

### 5. Docs

- `docs/configuration.md`: add `statusMap` to the sentence that lists the maps, and a row after `mergeCheckMap`'s in the table's style: the three targets, the first-word rule, where it applies, that a key may not be a mod word, the two error lines, that the card file is never rewritten.
- `docs/contracts.md`, the paragraph beginning `**Card status.**`: replace `` `status:` is one word `` with the rule that a status is read by its first word, lower-cased, and through `statusMap` when the repo sets one; keep the dispatch refusal sentence. One sentence after the status table: the owed-row retire check reads the raw word.
- `docs/guide.md`, the `## Work` section: one or two sentences: a card whose status word the mod does not know reads as Queued, the view's note counts them, and `statusMap` in the repo file maps them (with the example `{"done":"merged","held":"parked"}`).
- `CHANGELOG.md`: when the file has no `## Unreleased` heading, add `## Unreleased` above the newest version heading; under `### Added` (add the heading when absent) one bullet in the style of its neighbours, ending `(MOD-361)`; under `### Changed` (add it after `### Added` when absent) one bullet that a status is now read by its first word, lower-cased, so `Merged` and `merged (PR 27)` read as merged, ending `(MOD-361)`.

## Left to you (list each as a `choice:` line)

- The fixtures of the engine tests, and which file takes the dispatch case.
- The wording of the docs row and sentences and of the two changelog bullets.
- The name and shape of the small helper in `workData`.

## Done when

- `hooks/lib/statusmap.ts` has the exports of section 1 and they behave as written; the node tests pass.
- `statusMap` parses from the repo file and from the options as JSON text, merges key by key, defaults to `{}`, and is listed in the config table and the manifest.
- Every listing through `indexedCards` and the dispatch status check read a status through `statusRead`; the cached card objects are not mutated; no card file is rewritten.
- The Work view (pane and text) carries the note when a card's read status is not one of the mod's seven words, and no note otherwise.
- The docs and the changelog carry the lines of section 5.
- The gates `validate`, `node` and `test` pass.

## Review

Brain review: read the whole diff. statusmap.ts carries the seven mod words, the three targets, firstWord, statusMapOf (a non-object gives one error; a bad entry is dropped with its own error and the good ones stay; a key that is a mod word is refused), statusRead (map first, then a mod word by first word, else the raw value) and unknownStatusNote (singular and plural lines, four words then +k more). The option is declared beside mergeCheckMap in repoconfig.ts (type, keys, parse, the JSON-text list, the key-by-key merge), configeff.ts, configtable.ts, the manifest and the config read in register.ts. Wiring is three small changes: indexedCards returns each card with its status read, as a copy when it changes, so the cached card is never mutated and every listing sees the read word; the dispatch status check reads the same way; workData appends the note as the last note at each of its six returns. No card file is rewritten, and parseCard, cardReadsMerged and the merge tool's own read are untouched, as the card says. Tests: twelve node cases over the pure functions; engine cases for the Work text (with and without the map), reconcile (a done card counts as merged once mapped), dispatch (todo refused, then taken under the map), the parse, and the option count 73 to 74. Decisions the owner may overrule: a status is read by its first word, lower-cased, for every repo, map or not; the targets are queued, merged and parked only (blocked needs blocked_by, which a foreign word cannot feed); the session's map is used for every card folder it reads, a folder of another repo included. Known limits: the owed-row retire check reads the raw word; the reconcile engine test without a map checks only that no done-elsewhere line prints. Ran on haiku at medium effort as an explore attempt, consistent first time. Approved by the owner on 2026-11-09 as a harness logic change.
