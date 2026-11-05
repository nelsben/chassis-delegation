---
id: MOD-303
title: tree reconcile marks a story done elsewhere only in a card that names it (issue: or parent:), never on a scope overlap; an overlap is shown on the no-match row
domain: mod
tier: standard
tier_reason: A clear rule change in one pure function plus one field read; the replay case is given
status: merged
scope: [hooks/lib/reconcile.ts, hooks/register.ts, tests/node/reconcilematch.node.mjs, tests/node/reconcile.node.mjs, tests/node/reconcileall.node.mjs, tests/reconcile.test.ts, tests/reconcileall.test.ts, tests/harness.ts, CHANGELOG.md]
forbid: [hooks/lib/allow.ts, hooks/lib/ghguard.ts, hooks/lib/scheduler.ts, hooks/lib/configeff.ts, docs/cards/**]
red_test: node --test tests/node/reconcilematch.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

On a real repo a reconcile all dry run reported 20 of 20 open stories under two epics as done in a merged card for an unrelated typo fix, because the fallback in doneIn marks a story done in the first merged card whose scope overlaps any one path of the story's scope block, and that card's scope held src/app/**. With --confirm it would have closed 20 open stories with a wrong comment. The overlap rule must stop closing anything.

## Done when

- hooks/lib/reconcile.ts: MergedCard gains `parent?: number`; register.ts reconcileWith fills it from the card's `parent:` field through issueRef exactly as it fills `issue` from `issue:`
- doneIn(sub, merged) marks a sub-issue done in a merged card only when (a) the card's issue equals sub.number, or (b) the card's parent equals sub.number, every entry of sub.subIssues is CLOSED (vacuously true when it has none) and no in-flight card names sub.number (reconcileOf already skips in-flight subs; pass what is needed); the scope-overlap fallback is removed as a reason to mark done
- A no-match sub-issue whose scope block overlaps a merged card's scope (scopeOverlap from ./brief, first match in merged order) gets `overlap: <card id>` on its noMatch entry and its row reads `#<n> <title> — no match (scope overlaps <card id>)`; its close line stays the commented `# gh issue close ... 'not planned'` line; the counts line is unchanged in shape
- A new node test tests/node/reconcilematch.node.mjs replays the case with neutral names: merged cards [{id:'X-1', issue:713, scope:['src/app/**']}] and a sub-issue 353 under another epic whose scope block lists src/app/feed.js: it lands in noMatch with overlap 'X-1', not in done; a card {id:'X-2', issue:353} lands it in done; a card {id:'X-3', parent:353} lands it in done only when its subIssues are all closed; an existing in-flight card for 353 keeps it out of every list. The test fails on main because the first case is reported done
- tests/node/reconcile.node.mjs and tests/node/reconcileall.node.mjs and the engine tests tests/reconcile.test.ts and tests/reconcileall.test.ts stay green, with any pinned overlap-based 'done in' expectation rewritten to the new rule
- CHANGELOG.md gains one bullet under `## Unreleased` / `### Fixed` (create the Unreleased heading above `## 0.9.50 — 2026-11-05` since the file has none now) naming the change and (MOD-303)
- The validate, node and test gates pass

## Review

Diff read at bd1275f. reconcile.ts doneIn now matches a merged card by issue, else by parent when every child of the story is closed; the scope-overlap fallback is gone and overlapOf only annotates the no-match row as "no match (scope overlaps <card>)". MergedCard and the no-match entry gain parent and overlap fields; register.ts reads the card's parent: through issueRef beside issue:. New node test with four neutral-name cases; two fixtures in the old tests now name their issue to keep their done-in expectations. The red file was taken through the repo's node runner because the bare node --test runs the file vacuously. First attempt, $0.36. Note: the in-flight check the card asked for was already covered by reconcileOf skipping in-flight subs.
