---
id: MOD-329
title: merge --finish releases the blocked cards whose last blocker it lands (status queued, a dispatch line), and tree shows blocked cards with their blockers
domain: mod
tier: standard
status: merged
issue: 463
parent: 432
scope: [hooks/lib/blocked.ts, hooks/lib/tree.ts, hooks/register.ts, docs/review-and-merge.md, tests/node/release.node.mjs, tests/*.test.ts, tests/**/*.test.ts, tests/node/*.node.mjs]
forbid: []
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/release.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

MOD-328 (0.9.54 pending) writes a card whose scope overlaps an open sibling as `status: blocked` with `blocked_by: [ids]`, with no brief or worktree. Nothing releases it yet, so the brain still has to flip each one by hand after every merge (#432, #463). This card makes merge --finish release them and makes tree show them.

## Done when

- hooks/lib/blocked.ts (pure, it must not import card.ts) exports `releasePlan(mergedId, cards, done)`. `cards` is every board card as `{ id, status?, parent?: number, scope: string[], blockedBy: string[] }`; `done` the ledger's done set. For each card with `status === 'blocked'` whose blockedBy includes mergedId, in id order (natural numeric order of the id's number, so MOD-9 before MOD-10): remaining = its blockedBy minus mergedId, minus ids in `done`, minus ids whose card is status merged. Remaining non-empty: `{ id, action: 'still', blockers: remaining }`. Remaining empty: its scope is checked with `scopeOverlap` (imported from ./brief) against the open siblings under the same parent: cards with the same parent, not itself, not mergedId, not done, not merged, and not status blocked, plus the cards already released earlier in this same pass. Any overlap gives `{ id, action: 'still', blockers: <those sibling ids> }`, else `{ id, action: 'release' }`. A card without a parent gets no sibling check.
- hooks/lib/blocked.ts exports `rewriteBlocked(cardText, blockers?)`. With no blockers it turns the frontmatter's `status: blocked` line into `status: queued` and drops the `blocked_by:` line. With blockers it keeps `status: blocked` and rewrites the line to `blocked_by: [<ids>]`. Nothing else in the text changes. A text with no `status: blocked` line comes back unchanged.
- In hooks/register.ts, finishRecord (which both finish paths reach) runs the release after it appends the merged ledger row. It reads the board cards through `indexedCards` on the session's card folder (as the card tool does), builds the releasePlan input from each card's parsed fields (`parent` through the existing issueRef/issueNumber reading, `blockedBy` from MOD-328's parseCard field), and writes each changed card back with `rewriteBlocked`. After a rewrite the card index/cache must not serve the old text; read hooks/lib/cardcache.ts and do what it needs. The finish output gains one line per planned card, after the existing lines and before the remote block: `released: <id> (its last blocker <mergedId> merged): dispatch task=<id>` or `still blocked: <id> by <ids>`. A card file that cannot be read or written gives `note: <id>: blocked card not updated: <why>`; finish itself never fails because of the release.
- hooks/lib/tree.ts: `TreeCard` gains `blockedBy?: string[]`. A sub-issue row whose card is status blocked (and not done) gets a new kind `blocked`, printed as `blocked #<n> <title> <card> (by <ids>)`. `counts` gains `blocked`, and the counts line adds ` · <n> blocked` only when n > 0, so a tree with no blocked card prints exactly as today. The register.ts tree handler passes each card's blockedBy. Blocked rows are not counted in the tier mix.
- docs/review-and-merge.md gains a short paragraph, where it describes `merge --finish`, on the release lines: a blocked card whose last blocker lands becomes queued (dispatch it), and one that still overlaps an open sibling under its parent stays blocked by that sibling.
- tests/node/release.node.mjs is the red test. It imports from ../../hooks/lib/blocked.ts and ../../hooks/lib/tree.ts and checks: a card blocked only by the merged id is released; one also blocked by an open id stays blocked by that id; a blocker already in done counts as gone; two cards blocked by the same id whose scopes overlap each other, where the lower id is released and the higher stays blocked by the lower; a released card overlapping an open queued sibling under its parent stays blocked by that sibling; rewriteBlocked both ways and on a queued card; treeOf with a blocked card giving the `blocked` row text and ` · 1 blocked`, and with none giving the old counts line. Model it on tests/node/blocked.node.mjs; fixture paths generic.
- No home-folder paths in any test.
- The validate, node and test gates are green.
