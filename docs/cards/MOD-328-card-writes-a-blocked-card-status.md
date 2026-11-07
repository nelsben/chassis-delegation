---
id: MOD-328
title: card writes a blocked card (status: blocked, blocked_by) instead of refusing a scope that overlaps an open sibling, and takes blockedBy; dispatch names the blockers
domain: mod
tier: standard
status: merged
issue: 462
parent: 432
scope: [hooks/lib/blocked.ts, hooks/lib/card.ts, hooks/lib/dispatch.ts, hooks/register.ts, docs/contracts.md, docs/guide.md, tests/node/blocked.node.mjs, tests/**/*.test.ts, tests/node/*.node.mjs]
forbid: []
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/blocked.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Today card refuses a card whose scope overlaps an open sibling under the same parent, so a planned wave of dependent cards cannot be cut at planning time and the brain must remember to cut each one after every merge (#432). The worktree concern is real, so a blocked card is written now but gets no brief and no worktree until its blockers merge; this card is the cut-time half, a later card releases blocked cards at merge --finish.

## Done when

- A new pure module hooks/lib/blocked.ts exports `blockersOf(scope, siblings, explicit)`: given the card's scope globs, the open siblings under its parent (`{ id, scope }[]`, as card.ts receives them) and the explicit blocker ids, it returns `{ blockers: string[], overlapping: Set<string> }`: blockers are the explicit ids then the ids of every sibling whose scope overlaps (import the existing `scopeOverlap` from ./brief, as card.ts does; blocked.ts must not import card.ts, since card.ts imports blocked.ts), de-duplicated, in that order; `overlapping` holds the sibling ids that overlap. It also exports `blockedLine(id, blockers)` = `<id> is blocked by <a>, <b>; merge --finish of its last blocker releases it (or set status: queued to dispatch it now)`.
- The card tool takes `blockedBy`: a list whose entries are task ids (`MOD-12`) or issue numbers (`12` or `#12`). Its input-schema description says: task ids or issue numbers this card waits on; the card is written blocked, with no brief or worktree, until they merge. An issue number resolves to the id of the one board card whose `issue:` is that number; none, or more than one, refuses the card with `blockedBy #<n>: no card on the board names issue <n>` or `blockedBy #<n>: <k> cards name issue <n> (<ids>)`. A task id that is not a card on the board refuses with `blockedBy <id>: no card <id> on the board`. A blocker that is already done (in the ledger's done set or status merged) is dropped, and the output gains `note: blockedBy <id> already merged; not a blocker`. The register.ts card handler supplies the board cards (id, status, issue) and the done set it already reads to cardFromFields through new CardCtx fields.
- cardFromFields no longer refuses on sibling overlap: when `blockersOf` returns any blocker, the card is written with `status: blocked` in place of `status: queued` and a `blocked_by: [<ids>]` line directly after it; the scopes of the overlapping siblings are NOT added to its forbid (every other open sibling's scope still is, as today). With no blocker the card is byte-for-byte what it is today.
- For a blocked card the card tool writes the card file only: it runs no dry run (no brief is written) and no dispatch, even with `dispatch: true`; in place of the dry-run block its output for that card is one line `<id> · blocked by <ids> · no brief or worktree yet; merge --finish of its last blocker releases it`. Lanes: each lane is judged on its own.
- hooks/lib/dispatch.ts parseCard reads `blocked_by` into a new `blockedBy: string[]` field (asList), and `checkStatus` answers a `status: blocked` card with `blockedLine(card.id, card.blockedBy)` (when blocked_by is empty: `<id> is blocked; set status: queued to dispatch it`).
- docs/contracts.md: the `parent` row and the forbid paragraph near line 472 say an overlapping open sibling makes the card blocked (and is not added to its forbid) instead of refusing it, and a `blocked_by` row joins the card-field table in the same shape as its neighbours. docs/guide.md line ~208: `a card whose scope overlaps an open sibling is refused until that sibling merges` becomes that it is written blocked, with no brief or worktree, until that sibling merges.
- tests/node/blocked.node.mjs is the red test. It imports from ../../hooks/lib/blocked.ts, ../../hooks/lib/card.ts and ../../hooks/lib/dispatch.ts and checks: blockersOf with one overlapping and one disjoint sibling plus an explicit id; cardFromFields with an overlapping sibling returns a card (not an error) whose text has `status: blocked`, `blocked_by: [<sib>]` and no sibling scope in forbid while the disjoint sibling's scope is in forbid; cardFromFields with no overlap and no blockedBy gives the same text as before (status: queued, no blocked_by); blockedBy `#12` resolving through the board, a missing issue and a missing id refusing with the lines above, a done blocker dropped; parseCard plus checkStatus on a blocked card giving blockedLine. Model it on tests/node/blockedcount.node.mjs; fixture paths generic (/repo).
- Any existing test that expected the old `overlaps open sibling` refusal is changed to expect the blocked card, and only that expectation.
- The validate, node and test gates are green.

## Review

Brain review: diff read. blockersOf/resolveBlockedBy in a pure blocked.ts that imports brief.ts, not card.ts. An overlapping sibling makes the card blocked, and its scope stays out of forbid; a blocked card skips the dry run and dispatch; checkStatus names the blockers. The scope refute on tests/card.test.ts was the card's fault: the `tests/**/*.test.ts` glob did not match a top-level tests file, and the card itself said that expectation would change. Amend granted, re-verified consistent. Finding: `tests/**/x` does not match `tests/x` in the scope matcher; worth a lesson line.
