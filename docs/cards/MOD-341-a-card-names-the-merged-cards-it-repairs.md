---
id: MOD-341
title: A card names the merged cards it repairs (fixes:), and each spawn row records that and whether the card has an issue link
domain: mod
tier: standard
status: merged
scope: [hooks/lib/card.ts, hooks/lib/storeloss.ts, hooks/register.ts, tests/node/fixes.node.mjs, tests/card.test.ts, tests/storeloss.test.ts, tests/dispatch.test.ts, tests/spawn.test.ts, tests/harness.ts, docs/contracts.md, docs/internals.md, docs/guide.md, CHANGELOG.md]
forbid: [hooks/lib/allow.ts, hooks/lib/dispatch.ts, hooks/lib/explore.ts, hooks/lib/brief.ts, hooks/lib/version.ts, hooks/templates/**, .claude-plugin/**, docs/cards/**, bin/**]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/fixes.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 8
---
## Why

The verifier says a hand-back is consistent with its card. Nothing records the cases where a merged card was later found wrong and a second card had to repair it, so the mod cannot report how often a "consistent" verdict let a defect through. Nor does the ledger say whether a card was cut with an issue link, so the share of linked cards can only be counted by reading card files. This card adds both facts to the spawn row, where a ledger-only reader can count them.

## Before you start

- `hooks/lib/card.ts`: `CARD_TOOL.inputSchema` (see `blockedBy` for a list input), `cardsFromFields(input, ctx)` (pure; it returns the cards or `{ error }`), the frontmatter template near the line that writes `issue:` and `parent:`, `NewCard.notes` (MOD-328: lines the tool prints under the card), and the lanes branch that refuses `issue` (`issue belongs to one card`).
- `hooks/lib/explore.ts` (read only): `cardKind({ kind, title, scope })` returns `bug` for a title that starts `Bug` or `Fix`.
- `hooks/register.ts`: the type `CardClassRecord` and the dispatch code that builds `cardClassRecord` and stores it at `K.cardClass(...)` (comment `MOD-274: the class, and whether the card hand-set its choice`); the spawn hook that reads it back as `cardCls` and passes `class: cardCls.name` into `spawnRow(...)`.
- `hooks/lib/storeloss.ts`: `SpawnRow`, `SpawnFields`, `spawnRow(s, sessionId)`. Each optional field is copied by its own spread line.
- `hooks/lib/card.ts`, `issueRef(v)`: a card's `issue:` value as a number, or undefined.

## Design (decided by the brain; build it, do not redesign it)

### 1. The card tool takes `fixes`

- `CARD_TOOL.inputSchema.properties` gains `fixes: { type: 'array', items: { type: 'string' }, description: "Task ids of merged cards this card repairs (work a verdict passed that later proved wrong). [] says you checked and it repairs none. Not with lanes" }`.
- In `cardsFromFields`: `fixes` absent is allowed. When given it must be an array of at most 5 strings; each is trimmed and must match `/^[A-Za-z][A-Za-z0-9]*-\d+$/`; a repeat is dropped; the card's own id is refused. Errors, word for word: `fixes must be a list of task ids (like MOD-12), at most 5` and `fixes cannot name the card itself`.
- With lanes, `fixes` is refused the way `issue` is: `fixes belongs to one card; drop it when lanes are given`.
- The frontmatter gains one line straight after the `parent:` line's place (after `issue:` when there is no parent, after `status`/`blocked_by` lines when neither): `fixes: [MOD-12, MOD-15]`, or `fixes: []` when an empty list was given. Absent input writes no line.
- `NewCard` gains `fixes?: string[]` (present when the input gave it, possibly empty).
- One note, pushed onto `notes`, when `fixes` is absent and `cardKind({ kind: undefined, title, scope })` is `bug`. Word for word: `note: this reads as a fix; if it repairs a card that already merged, pass fixes: ["<that card's id>"], or fixes: [] when it does not`.
- The tool does not check that a named id exists or is merged: other repos keep cards the board cannot see.

### 2. The dispatch records it

- `CardClassRecord` gains `fixes?: string[]` and `linked?: boolean`.
- Where `cardClassRecord` is built: `linked` is `issueRef(card.fields.issue) !== undefined`. `fixes` is the card's `fixes:` list read from `card.fields.fixes` (a YAML list, or a string in the `[A, B]` form the tool writes; use the same list reader `parseCard` uses for `blocked_by` if it is exported, else split on commas after stripping brackets), trimmed, kept only where it matches the id pattern above; set only when at least one id remains.

### 3. The spawn row carries it

- `SpawnRow` gains `fixes?: string[]` and `linked?: boolean`, with a doc comment: `MOD-341: the merged cards this card repairs, and whether the card has an issue link.`
- `spawnRow` copies `fixes` when it is a non-empty array, and `linked` whenever it is a boolean (so `false` is written).
- The spawn hook passes both from `cardCls` beside `class`. An ad hoc spawn and a replay lane pass neither, as for `class`.
- Nothing else reads these fields. No verdict, tier, budget or gate changes.

### 4. The cases

Pure (`tests/node/fixes.node.mjs`; if `hooks/lib/card.ts` cannot be imported in a node test, put the card-tool rows in `tests/card.test.ts` instead and say so in a choice line):

| Input | Result |
|---|---|
| `fixes: ['MOD-12', ' MOD-15 ']` | card text holds the line `fixes: [MOD-12, MOD-15]`; `NewCard.fixes` is `['MOD-12', 'MOD-15']` |
| `fixes: []` | card text holds `fixes: []`; no note |
| no `fixes`, title `Fix the stale hint` | no `fixes:` line; `notes` holds the note |
| no `fixes`, title `A worker lists choices` | no `fixes:` line; no note |
| `fixes: ['MOD-12', 'MOD-12']` | `fixes: [MOD-12]` |
| `fixes: ['not an id']` | error `fixes must be a list of task ids (like MOD-12), at most 5` |
| six ids | the same error |
| `fixes: 'MOD-12'` (not an array) | the same error |
| `fixes` naming the id the card is about to get | error `fixes cannot name the card itself` |
| `fixes: ['MOD-12']` with lanes | error `fixes belongs to one card; drop it when lanes are given` |
| `spawnRow({ …, fixes: ['MOD-12'], linked: true })` | row has `fixes: ['MOD-12']`, `linked: true` |
| `spawnRow({ …, linked: false })` | row has `linked: false` and no `fixes` key |
| `spawnRow({ …, fixes: [] })` | no `fixes` key, no `linked` key |

Engine (`tests/dispatch.test.ts` or `tests/spawn.test.ts`, whichever already walks a card from dispatch to its spawn row): a card with `issue: 12` and `fixes: [MOD-12]` gives a spawn row with `linked: true` and `fixes: ['MOD-12']`; a card with neither gives `linked: false` and no `fixes`.

### 5. Left to you (list each as a `choice:` line in your hand-back, above the report)

- Local names, and where in `cardsFromFields` the check sits.
- How the `fixes:` value is read from `card.fields` (see Design 2).
- The wording of the docs sentences and the CHANGELOG bullet.

## Done when

- Every row of the table in Design 4 is a test; the new ones fail before the change and pass after.
- The engine case passes.
- `CARD_TOOL.inputSchema` has `fixes` with the description in Design 1, and `tests/card.test.ts` asserts the schema names it.
- No existing assertion is removed. A test that pins a whole spawn row with `toEqual` is updated to carry `linked`.
- `docs/contracts.md` names `fixes:` where it lists a card's frontmatter fields; `docs/internals.md`, in Store and ledger, names the spawn row's `fixes` and `linked`; `docs/guide.md` says in one or two sentences when to pass `fixes`.
- `CHANGELOG.md` has one bullet under a `## Unreleased` heading at the top (add the heading if it is absent), under `### Added`, in the style of the bullets below it, ending `(MOD-341).`
- All three gates pass: validate, node, test.

## Review

Brain review: source diff read whole. The card tool input, the three refusals, the note for a fix-titled card, the frontmatter line, the class record and the spawn row are as Designs 1-3 give them. Worker choices (5 listed): names and where the checks sit, a new pure fixesOf reader in card.ts, the line's place, where the engine test went, docs wording.
