---
id: MOD-353
title: The Work view's data: one read of the repo's issues joined to the cards, the ledger and the live workers gives a tree with a state per item, and /delegation work prints it as text
domain: mod
tier: standard
status: merged
scope: [hooks/lib/work.ts, hooks/lib/allow.ts, hooks/register.ts, tests/node/work.node.mjs, tests/work.test.ts, tests/allow.test.ts, tests/*.test.ts, tests/node/*.node.mjs, tests/harness.ts, docs/guide.md, docs/internals.md, docs/install.md, CHANGELOG.md]
forbid: [.claude-plugin/**, bin/**, docs/cards/**, docs/mockups/**, hooks/lib/pane.tsx, hooks/lib/band.tsx]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/work.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

The person approved a tracker-style Work pane (the prototype is `docs/mockups/work-panel.html`, its design is in the merged card MOD-347): epics, features and leaf issues joined to this mod's cards, each leaf with one state. This card builds everything the pane will read, with no drawing: the pure model, the view model (which rows are visible for a given set of filters), one cached read of the issues, and a text form that `/delegation work` prints. The text form stays afterwards as what a screen with no panes gets. The pane itself is the next card and must not be started here.

## Before you start

- `hooks/lib/tree.ts` (short): the existing pure reader of one issue's sub-issues. The new file is its bigger sibling; do not change `tree.ts`.
- `hooks/register.ts`: `treeWith` (search `async function treeWith`): how a command finds `root`, `ownerRepo`, sets `landRepo` and `sessionRoot`, reads the cards with `indexedCards` and `issueRef`, reads `doneTasks((await ledgerAt($, root)).rows)` and runs `gh`. `liveModel` (search `async function liveModel`): its `view.rows` are the live rows. The command router (search `if (arg === 'dashboard')`), the usage line just under it, and the `argumentHint` of the `delegation` command (search `name: 'delegation', description`). The `session.start` hook (search `issueStates.clear()`). `now($)` (search `async function now(`).
- `hooks/lib/live.ts`: `WorktreeRow` and `worktreeRows` (what `kind` and `state` mean).
- `hooks/lib/allow.ts`: `epicListOk` and the line in `checkGhIssue` that uses it. `tests/allow.test.ts`: the block `MOD-299: the epic list for tree reconcile all`.
- `hooks/lib/issuematch.ts`: `cachedState` (the shape of a small cache with pure helpers), and `tests/issuematch.test.ts` for an engine test that scripts `gh` output and counts `w.runs`.
- `tests/reconcileall.test.ts`: an engine test that runs a `/delegation …` command over scripted `gh` output and cards on disk.

## Design (decided by the brain; build it, do not redesign it)

### 1. `hooks/lib/work.ts`, new, pure (no `$`, no clock, no I/O)

```ts
import type { Tier } from './tier'

export type WorkState = 'working' | 'review' | 'queued' | 'blocked' | 'backlog' | 'done'
/** The order of the summary: Working, To review, Queued, Blocked, Backlog, Done. */
export const WORK_STATES: readonly WorkState[] = ['working', 'review', 'queued', 'blocked', 'backlog', 'done']
export const STATE_LABEL: Record<WorkState, string> = { working: 'Working', review: 'To review', queued: 'Queued', blocked: 'Blocked', backlog: 'Backlog', done: 'Done' }
export type WorkType = 'epic' | 'feature' | 'story' | 'task' | 'bug' | 'spike' | 'issue'
export type WorkIssue = { number: number; title: string; closed: boolean; type: WorkType; parent?: number }
export type WorkCard = { id: string; title: string; status?: string; tier?: Tier; issue?: number; parent?: number; blockedBy?: string[] }
/** A live row; structurally a subset of live.ts WorktreeRow, so `view.rows` is passed as it is. */
export type WorkLive = { task: string; kind: 'live' | 'queued' | 'verdict' | 'owed' | 'disk'; model?: string; state?: string; attempt?: string; usd?: number }
export type WorkItem = {
  /** `#<number>` for an issue, the card id for a card drawn by itself, `none` for the No epic group. */
  key: string
  number?: number
  title: string
  type: WorkType
  state: WorkState
  group?: true
  card?: string
  tier?: Tier
  model?: string
  attempt?: string
  /** Working only: the row's `state` without its leading `live `, e.g. `6m`. */
  running?: string
  usd?: number
  /** Queued, and its spawn waits in the queue. */
  slot?: true
  /** Queued, and a worktree for it is on disk from an earlier session. */
  onDisk?: true
  /** Blocked: the ids it waits on. */
  by?: string[]
  children: WorkItem[]
  /** Leaf descendants, and how many are done. A leaf has leaves 1 and done 0 or 1. */
  leaves: number
  done: number
}
export type WorkModel = { roots: WorkItem[]; counts: Record<WorkState, number>; total: number }
export type WorkUi = { closed: ReadonlySet<string>; shown: ReadonlySet<string>; query: string; states: ReadonlySet<WorkState>; root?: string; showDone: boolean }
export type WorkRow =
  | { kind: 'item'; item: WorkItem; depth: number; /** present on a parent */ open?: boolean }
  | { kind: 'hidden'; parent: string; depth: number; n: number }
  | { kind: 'older'; parent: string; depth: number; n: number }
  | { kind: 'more'; n: number }
export const DONE_CAP = 20
export const ROW_CAP = 200
export const WORK_TTL_MS = 5 * 60 * 1000
export const WORK_LIST_LIMIT = 300
export const DEFAULT_UI: WorkUi

export function parseWorkIssues(json: unknown): WorkIssue[]
export function workModel(i: { issues: readonly WorkIssue[]; cards: readonly WorkCard[]; done: ReadonlySet<string>; live: readonly WorkLive[] }): WorkModel
export function workRows(m: WorkModel, ui: WorkUi): WorkRow[]
export function updatedText(at: number, now: number): string
export function workText(m: WorkModel, o?: { updated?: string; notes?: readonly string[] }): string
```

`DEFAULT_UI` is `{ closed: empty set, shown: empty set, query: '', states: empty set, showDone: false }`.

**`parseWorkIssues`**: anything that is not an array gives `[]`. An entry counts when its `number` is a number. `title` is the string or `''`. `closed` is true when `state`, upper-cased, is `CLOSED`. `type` is the first label whose name is `type:` followed by one of `epic`, `feature`, `story`, `task`, `bug`, `spike`; with none, `issue`. `parent` is `parent.number` when that is a number. The result is sorted by number ascending; a number seen twice keeps the first.

**`workModel`**, in this order:

1. Cards with status `parked` or `template` are dropped. A card is *done* when its status is `merged` or `landed`, or `done` holds its id.
2. An issue's parent is its `parent` when that number is in `issues` and walking parent to parent from there (at most 16 steps) never comes back to the issue itself; otherwise it has none.
3. Each remaining card is placed once:
   - (a) its `issue` is in `issues` and that issue has no child issue: it is *bound* to the issue. When several cards name one issue, a card that is not done wins over a done one, and between equals the greater id wins (`a.localeCompare(b, undefined, { numeric: true })`); the others are left out of the model.
   - (b) its `issue` is in `issues` and that issue has child issues: it becomes a *card leaf* under that issue.
   - (c) otherwise its `parent` is in `issues`: a card leaf under that parent.
   - (d) otherwise: a card leaf in the No epic group.
   A card leaf has `key` the card id, no `number`, `title` the card's title, `type` `task`.
4. The live row of a card is the first entry of `live` whose `task`, cut at its first space or `/`, equals the card id.
5. A leaf's state, first match wins: `done` (its issue is closed, or its card is done) · `working` (live row `kind` `live`) · `review` (live row `kind` `owed` or `verdict`) · `blocked` (card status `blocked`) · `queued` (it has a card) · `backlog`.
   Fields: `card` and `tier` whenever it has a card; `by` (the card's `blockedBy`) when blocked; `model`, `attempt` and `usd` from the live row when working or in review; `running` when working (the row's `state` with a leading `live ` removed); `slot: true` when queued and the row's `kind` is `queued`; `onDisk: true` when queued and the row's `kind` is `disk`.
6. An issue with child issues or card leaves is a parent. Its `leaves` and `done` count its leaf descendants; its `state` is `done` when `leaves > 0` and `done === leaves`, otherwise `backlog` (a parent's state is never drawn; it only decides hiding). An issue with no children is a leaf, whatever its type.
7. Children order: issue items by number ascending, then card leaves by id ascending (the numeric compare above).
8. `roots`: every issue with no parent that is of type `epic` or is a parent, by number ascending; then, when it would have children, one group item `{ key: 'none', title: 'No epic', type: 'issue', group: true }` whose children are the other parentless issues and the card leaves of 3(d), ordered as rule 7.
9. `counts` is the number of leaves in each state over all roots; `total` is their sum.

**`workRows`**. Let `q` be `ui.query` trimmed and lower-cased; the view is *filtered* when `q` is not empty or `ui.states` is not empty. The roots walked are all of `m.roots`, or only the one whose `key` is `ui.root` when it is set and exists.

- Not filtered. An item whose `state` is `done` is a *done child* of its parent (so a parent whose leaves are all done is one too). A root that is done is listed only when `ui.showDone`. For a listed parent, push `{ kind: 'item', item, depth, open }` with `open = !ui.closed.has(item.key)`. When open, walk its children in order: a child that is not done is listed (a parent recursively at `depth + 1`). Done children are listed in place only when `ui.showDone` or `ui.shown.has(parent key)`, and then only the last `DONE_CAP` of them; when some were left out, end the parent's rows with `{ kind: 'older', parent, depth: depth + 1, n }`. When done children are not listed and there is at least one, end the parent's rows with `{ kind: 'hidden', parent, depth: depth + 1, n }`.
- Filtered. A leaf matches when (`ui.states` is empty or holds its state) and (`q` is empty or the lower-cased text `` `${title} #${number ?? ''} ${card ?? ''}` `` contains `q`), and, when it is done, only if `ui.showDone` or `ui.states.has('done')`. A parent is listed, always with `open: true`, only when a leaf under it matches; `ui.closed` and `ui.shown` are ignored and no `hidden` or `older` row is pushed.
- Both: when more than `ROW_CAP` rows result, keep the first `ROW_CAP` and append `{ kind: 'more', n: <the number left out> }`.

**`updatedText(at, now)`**: under 60 s `Updated just now`; under 60 min `Updated N min ago`; else `Updated N h ago` (whole numbers, rounded down; a negative difference reads as 0).

**`workText`**: lines joined by `\n`.

- Line 1: `**Work** · 2 working · 1 to review · 3 queued · 1 blocked · 7 backlog · 6 done` (every state, in `WORK_STATES` order, label lower-cased), then `` ` · ${o.updated}` `` when given.
- Then each of `o.notes`, one per line.
- When `m.total === 0`: one more line, `No work breakdown yet. Import one with /delegation tree import <file>, or start one with /delegation land epic <title>.`, and nothing else.
- Otherwise a blank line and one line per row of `workRows(m, DEFAULT_UI)`, indented two spaces per depth:
  - a parent: `- **#10 Checkout rework** 3/9` (the group: `- **No epic** 0/2`);
  - a leaf: `- WORKING #13 Restore a saved cart`: the label upper-cased, then `#<number>` (a card leaf has no number and prints `—` in its place), then the title, then ` (bug)`, ` (task)` or ` (spike)` when an issue leaf has that type (nothing for the other types and nothing for a card leaf). After that, each of these that applies, in this order, each preceded by ` · `: the card id (a card leaf prints it here too), `sonnet 1/2` (model and attempt), `6m` (running), `$0.31` (usd, two decimals), `by MOD-901` (ids joined by `, `), `waiting for a slot`, `worktree on disk`. Whole lines from the worked case: `    - WORKING #13 Restore a saved cart · MOD-900 · sonnet 1/2 · 6m · $0.31`, `    - BLOCKED #24 … · MOD-903 · by MOD-901`, `    - QUEUED #33 … · MOD-905 · waiting for a slot`, `    - BACKLOG #15 … (bug)`, `  - QUEUED — Bump the lint config · MOD-906`;
  - `hidden`: `- 2 done hidden`; `older`: `- 4 older done not shown`; `more`: `… 12 more rows`.

Worked case (the node tests use it; it is the prototype's sample data). Issues: `#10` epic; `#11` feature under 10 with `#12` closed story, `#13`, `#14` stories, `#15` bug; `#20` feature under 10 with `#21`, `#22` closed stories, `#23`, `#24` stories, `#25` task; `#30` epic; `#31` feature under 30 with `#32`, `#33`, `#34` stories and `#35` spike; `#40` feature under 30 with `#41` closed, `#42`, `#43`; `#60` epic, `#61` feature under 60 with `#62`, `#63` closed; `#70` bug with no parent. Cards: MOD-900 issue 13; MOD-901 issue 23; MOD-902 issue 14; MOD-903 issue 24, status `blocked`, blockedBy `[MOD-901]`; MOD-904 issue 32, tier economy; MOD-905 issue 33; MOD-906 with no issue. Live rows: MOD-900 `live`, state `live 6m`, sonnet, `1/2`, 0.31; MOD-904 `live`, haiku, `2/2`, 0.02; MOD-901 `verdict`, sonnet, `1/2`, 0.52; MOD-905 `queued`. Expected: counts working 2, review 1, queued 3, blocked 1, backlog 7, done 6; `#10` is `3/9`, `#11` `1/4`, `#20` `2/5`, `#30` `1/7`, `#60` `2/2`; `workRows(m, DEFAULT_UI)` is 24 rows: `#10`, `#11`, `#13`, `#14`, `#15`, hidden 1, `#20`, `#23`, `#24`, `#25`, hidden 2, `#30`, `#31`, `#32`, `#33`, `#34`, `#35`, `#40`, `#42`, `#43`, hidden 1, `none`, `#70`, `MOD-906`; `#60` is absent and appears with `showDone`.

### 2. The allowlist, `hooks/lib/allow.ts`

One more exact read-only shape beside `epicListOk`, the landRepo only, named `workListOk`:

`gh issue list --repo <landRepo> --state all --limit 300 --json number,title,state,labels,parent`

`checkGhIssue` passes it on the same line that passes `setupIssueListOk` and `epicListOk`. Nothing else in the file changes. `tests/allow.test.ts` gains a `MOD-353` block in the shape of the MOD-299 one: the exact shape passes; another state, limit, field list or repo is refused; with no landRepo it is refused.

### 3. `hooks/register.ts`

- Module level, beside `issueStates`: `let workCache: { repo: string; at: number; issues: WorkIssue[]; capped: boolean } | undefined`. `session.start` sets it to `undefined` where it clears `issueStates`.
- `async function workData($: Host, force: boolean): Promise<{ model: WorkModel; at?: number; notes: string[] }>`:
  - Find `root`, `origin`, `ownerRepo` and set `landRepo` and `sessionRoot` exactly as `treeWith` does (after `loadRepoConfig($)`).
  - Cards: every card of `indexedCards` (no card folder: none) as a `WorkCard`: `id`, `title`, `status`, `tier: tierOf(c.tier) ?? 'standard'`, `issue` and `parent` through `issueRef(…, ownerRepo)`, `blockedBy` when not empty.
  - `done` as `treeWith` reads it; `live` is `(await liveModel($)).view.rows`.
  - Issues. With no `ownerRepo`: none, and the note `origin is not a GitHub remote: cards only`. Otherwise, when `workCache` is for this `ownerRepo`, `force` is false and `now - at` is 0 or more and under `WORK_TTL_MS`: the cache. Otherwise run the argv of section 2 (`cwd: root`, `timeoutMs: 60000`); on success (`ok`, exit 0, JSON) parse it, and set `workCache` with `at` the time now and `capped` true when the raw array held `WORK_LIST_LIMIT` entries. On any failure keep the old cache: with a cache for this repo, use its issues and add the note `could not read the issues (<why, at most 200 characters>): showing the list read earlier`; with none, no issues and the note `could not read the issues (<why>): cards only`.
  - When the issues used are `capped`, add the note `the newest 300 issues only`.
  - `at` is the cache's `at` when a cache was used or written.
- The command router gains, beside `dashboard`: `work` → `{ text }` of `workText(model, { updated: at === undefined ? undefined : updatedText(at, now), notes })` from `workData($, false)`; `work refresh` → the same from `workData($, true)`. The usage line and the `argumentHint` gain `work [refresh]` after `dashboard`.
- No pane, no `ui.render` hook, no tool and no config option in this card.

### 4. Tests

- `tests/node/work.node.mjs` (new), one `MOD-353` describe: `parseWorkIssues` (not an array; type from labels; `CLOSED`; parent; sort and duplicate); the worked case end to end (counts, the five progress pairs, the 24 default rows by key and kind, `#60` with `showDone`); the card rules 3(a) to 3(d), including two cards on one issue; each of the six states, with `slot` and `onDisk`; a parent loop (`#1` under `#2` under `#1`) does not hang and both are listed; `workRows` with a closed parent, with `shown`, with a query (`mod-902`, `#14`, a title word), with `states`, with `root`, with done leaves under `DONE_CAP` plus one, and past `ROW_CAP`; `updatedText`; `workText` for the worked case (assert the first line and five representative lines exactly) and for an empty model.
- `tests/work.test.ts` (new), one `MOD-353` describe: `/delegation work` over scripted `gh` output and two cards on disk prints the summary line and a parent line; a second `/delegation work` runs no second `gh issue list` (count `w.runs`), and `/delegation work refresh` runs one; a failing `gh` gives the `cards only` note and still lists the card; an origin that is not GitHub gives its note and runs no `gh`.
- Any existing test that pins the usage line or the `argumentHint` is updated to the new text.

### 5. Docs

- `docs/guide.md`: a row `/delegation work [refresh]` in the commands table after the `/delegation dashboard` row, and a short `## Work` section after `## Dashboard`: what the listing is, the six states in one line each, that it is one read-only `gh issue list` kept five minutes (`refresh` reads again), the 300-issue limit, and that a card with no issue sits under `No epic`.
- `docs/install.md`: where the read-only `gh` reads are listed (search `gh issue list`), name this one and the command that runs it.
- `docs/internals.md`: a table row for `hooks/lib/work.ts` and one line on `workCache`.
- `CHANGELOG.md`: add a `## Unreleased` heading with `### Added` above `## 0.9.56 — 2026-11-09` (the file has no Unreleased section now) and one bullet in the style of the 0.9.56 bullets, ending `(MOD-353)`.

## Left to you (list each as a `choice:` line)

- The private helpers inside `work.ts` and how the walk is written.
- The wording of doc comments and of the docs lines.
- How the engine tests script `gh` and lay the cards down, following the tests named above.

## Done when

- `hooks/lib/work.ts` exports the names of section 1 and behaves as it says; it imports nothing that does I/O; the node tests of section 4 pass, the worked case included.
- The allowlist passes exactly the one new shape for the landRepo and refuses its near misses; the allow tests pass.
- `/delegation work` prints the text form; inside five minutes a second call runs no `gh`; `/delegation work refresh` reads again; a failed read and a non-GitHub origin give their notes and still list the cards; the engine tests pass.
- No pane is opened and no `ui.render` hook is added; the dashboard pane and band files are untouched.
- The guide, install notes, internals and changelog carry the lines of section 5.
- The gates `validate`, `node` and `test` pass.

## Review

Brain review: built to the Design; diff read whole. work.ts is pure and matches section 1 (parse, the placement rules, the state order, hidden and older rows, the row cap, the text form); the allowlist gains exactly the one read-only list shape on the landRepo with its near misses refused; workData follows the tree read's preamble, keeps the list five minutes, keeps the earlier list on a failed read and notes it. Worker choices accepted: a leaf issue that gains card leaves through a card's parent field becomes a parent and keeps its own bound card as a card leaf; an issue inside a parent loop longer than 16 steps is left out of the tree rather than looping. Carried to MOD-354: the guide's Queued line reads as if every queued leaf waits for a slot.
