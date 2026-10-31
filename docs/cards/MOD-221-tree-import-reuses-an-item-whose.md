---
id: MOD-221
title: Tree import reuses an item whose recorded issue is CLOSED with no close:, instead of filing it again
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/landtree.ts, tests/landtree.test.ts, tests/node/landtree.node.mjs, docs/guide.md, CHANGELOG.md]
forbid: [hooks/lib/allow.ts, hooks/lib/version.ts, .claude-plugin/plugin.json, docs/cards/**]
red_test: claude plugin test . (the new tests/landtree.test.ts case fails now: a CLOSED recorded issue with no close is filed again)
gate: validate, node, test
budget: 2-attempts
spend: 6
---
## Why

MOD-215's tree import reads an item's recorded `issue` and reuses it when it is OPEN, or CLOSED with `close`. An item whose recorded issue is CLOSED and that has no `close` falls through and is filed again, a duplicate of work already done and closed on GitHub (someone closed it by hand, or the work finished between runs).

## Done when

- In the tree import's confirm run (hooks/register.ts, the `visit` function), an item with a recorded `issue` whose `gh issue view` state is CLOSED and that has no `close` is reused, not filed: no `gh issue create` runs for it, it counts in the `already filed` total, and its line reads `already filed #<n> (closed) <title>`.
- Such an item counts as closed for its parent's close rule: a parent with `close` whose children are all closed or reused-closed is closed as today.
- Its children are still visited under its number, as for an OPEN reused item.
- The preview (no confirm, or dry run) is unchanged and still runs no gh.
- An OPEN recorded issue, a CLOSED one with `close`, and an unreadable one behave exactly as before (the unreadable one still stops the run with the remove-the-issue-key line).
- tests/landtree.test.ts gains an engine case with a fake gh: a plan item with `"issue": 7` whose view reports CLOSED and no `close` makes no create call and the result contains `already filed #7 (closed)`; and a parent with `close` over such a child is closed.
- docs/guide.md's Tree import section says a recorded issue that is closed is reused, with or without `close`.
- CHANGELOG.md gains a Fixed entry under `## Unreleased` naming MOD-221. validate, the node tests and the engine suite pass.

## Review

Read the visit change: a CLOSED recorded issue is reused whether or not the item has close, its line is marked (closed), and it counts as closed for its parent. Preview, OPEN and unreadable paths unchanged. Accepted.
