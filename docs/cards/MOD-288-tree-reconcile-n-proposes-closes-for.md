---
id: MOD-288
title: tree reconcile <n> proposes closes for planned tasks that merged cards already did and lists parents closed by hand with open children; --confirm runs the closes
domain: mod
tier: standard
status: merged
scope: [hooks/lib/reconcile.ts, hooks/lib/tree.ts, hooks/register.ts, tests/node/reconcile.node.mjs, tests/reconcile.test.ts, docs/guide.md, CHANGELOG.md]
forbid: [hooks/lib/ghguard.ts, hooks/lib/mergecmd.ts, hooks/lib/land.ts, hooks/lib/version.ts, .claude-plugin/plugin.json, docs/cards/**]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs (the new tests/node/reconcile.node.mjs) — the 'an open sub-issue overlapping a merged card is listed as done elsewhere' case fails on main (no reconcile exists) and passes after
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Imported backlogs drift: planned tasks stay open after an unlinked card shipped the work, and people close stories by hand with tasks still open underneath (one adopter repo: 60 of 147 stories closed that way, 0 of 103 tasks). Nothing reports either, so the tree view is wrong in both directions. A read-only pass that proposes the closes, and runs them only on confirm, is the cleanup tool for the two stale trees today and for every backlog the next repos import.

## Done when

- `/delegation tree reconcile <n> [--confirm]` and the `tree` tool with `reconcile: true` (and `confirm`) read the parent issue and its sub-issues with the existing `gh issue view ... --json number,title,state,labels,body,subIssues` shape, then one view per open sub-issue that has no in-flight card (to get its scope block), at most treeImportBatch of them per run (the rest listed as `not read: run again`).
- A pure half in hooks/lib/reconcile.ts matches each open sub-issue's scope block against the merged cards (ledger rows with a merged record, scope from the card file in the card folder, or the report's files list) and returns three lists: (a) `done elsewhere`: open sub-issues whose scope overlaps a merged card's, with the card id and PR number; (b) `closed with open children`: sub-issues that are CLOSED and whose own subIssues (as the view gives them) include an open one; (c) `no match`: open sub-issues with no in-flight card and no overlap.
- Without confirm the command prints the three lists, one row each (`#<n> <title> — done in <ID> (#<pr>)`, `#<n> <title> — closed, <k> children open (#a, #b)`, `#<n> <title> — no match`), then for (a) the `gh issue close <n> --repo <r> --comment 'done in <ID> (#<pr>)'` line per row and for (c) a commented `# gh issue close <n> --repo <r> --comment 'not planned'` line per row for the person to run by hand; it writes no file and runs no close.
- With confirm it runs the (a) closes itself, through the existing close shape, at most treeImportBatch per run and at least a second apart, reports `closed #<n>` or `close #<n> failed: <why>` per row, and never closes a (b) or (c) row. The landed file or plan item recording that issue, when one exists, gains a `closed: <ISO time>` line (landed) or is left alone (plan file).
- The gh guard is not touched; a worker still cannot run the close. The tree tool's existing read-only output without reconcile is unchanged, and its tool description names reconcile and says confirm runs closes only after the person says yes in their own words.
- tests/node/reconcile.node.mjs covers the three lists (overlap with a merged card; a closed sub-issue with an open child; no match) and that an in-flight card's issue is in no list. One engine test (harness test wrapper) with a stubbed gh asserts the dry run prints the close line and runs no close, and that confirm runs exactly the (a) closes.
- docs/guide.md's planning section gets a Reconcile paragraph. CHANGELOG.md Unreleased gains one line. No other file changes.

## Review

Brain review: pure reconcileOf in hooks/lib/reconcile.ts (done elsewhere by named issue or scope overlap, closed with open children, no match, not read), reconcileText with the close lines, parseReconcileArgs, landedFor; reconcileWith in register.ts reads the parent and one view per open unlinked sub-issue up to treeImportBatch, closes only the done-elsewhere rows on confirm with the existing close shape, a second apart, and writes closed: to the landed file. No amends. First attempt, $0.68. Design gap in the card, not the work: an overlap match considers every merged card regardless of when the issue was filed, so a planned task on a busy file (docs/guide.md, hooks/register.ts) will often be proposed as done elsewhere; confirm is gated on the person's yes, and a follow-up can bound the match to cards merged after the issue's createdAt once that field is in the view shape.
