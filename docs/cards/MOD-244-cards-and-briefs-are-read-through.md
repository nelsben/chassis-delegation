---
id: MOD-244
title: Cards and briefs are read through an mtime-keyed index, so land, tree, plan and the card tool stop reading all 265 cards per call
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/cardcache.ts, hooks/lib/cards.ts, tests/cards.test.ts, tests/land.test.ts, tests/harness.ts, tests/node/**, tests/node/cardcache.node.mjs, CHANGELOG.md]
forbid: []
red_test: tests/land.test.ts: a second land_plan call with no card changed makes zero fs.read calls of docs/cards/*.md (fails today: every card is read again); the harness fs.list reports mtimeMs from w.mtimes and the test sets w.mtimes
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

landWith, treeWith and planWith (hooks/register.ts near 3804/3921/4016), the card tool with parent (near 7546) and the MOD-227 sibling-clash branch (near 6870) each list docs/cards and fs.read + parseCard every .md (~932 KB) with no cache; localBriefTexts (near 2833) reads all 261 briefs (2.2 MB) at each debrief ingest; the card tool parses the whole ledger twice (near 7519 and 7536).

## Done when

- A new module hooks/lib/cardcache.ts holds a parsed front-matter index keyed by card path, each entry carrying the (mtimeMs, size) pair from one $.fs.list of docs/cards; no per-file stat is made. A card whose mtime or size changed is re-read; a card no longer listed is dropped; a new card is read. It reuses MOD-241's stat-keyed helper where that fits.
- land_plan, tree, the brain pane's card list and card-with-parent go through the index; a card's body is read only when a caller needs it (card display, brief making).
- tests/harness.ts: fs.list entries carry mtimeMs and size from w.mtimes and the file text; a test that rewrites a card's text with no w.mtimes change still sees the change through the size, or sets w.mtimes.
- Node tests of the index: unchanged list reads nothing; mtime change re-reads; size change re-reads; removed file dropped.
- CHANGELOG.md gets an Unreleased line.
- Gates validate, node and test are green.
