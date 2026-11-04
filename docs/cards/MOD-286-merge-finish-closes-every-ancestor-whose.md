---
id: MOD-286
title: Merge finish closes every ancestor whose sub-issues are all closed, up to four levels, not only the task's direct parent
domain: mod
tier: standard
status: merged
scope: [hooks/lib/mergecmd.ts, hooks/register.ts, hooks/lib/landnudge.ts, tests/node/finishissue.node.mjs, tests/finishissue.test.ts, docs/guide.md, CHANGELOG.md]
forbid: [hooks/lib/ghguard.ts, hooks/lib/land.ts, hooks/lib/version.ts, .claude-plugin/plugin.json, docs/cards/**]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs (tests/node/finishissue.node.mjs) — the new 'chain of three all closed yields three closes' case fails on main (closesOf returns two) and passes after
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

closesOf in hooks/lib/mergecmd.ts closes the task and, when its siblings are all closed, the direct parent with 'all k tasks done', and stops there. In a three or four level tree (epic, feature, story, task) the story closes and the feature and epic above it stay open forever: across two adopter repos zero epics and four of ninety-six features have ever closed. Finish should walk up the tree.

## Done when

- After finish closes the task's parent, it reads that parent's own parent and, when every sub-issue of that ancestor is CLOSED (the just-closed one counted as closed even though the read may predate the close), closes it with the comment `all <k> sub-issues done`, and repeats up to four levels above the task. The walk stops at the first ancestor that still has an open sub-issue, and prints `# parent #<n>: <open> of <total> still open (#a, #b)` for it (the direct parent keeps its current `tasks still open` wording). Reads use the existing `gh issue view <n> --repo <r> --json number,title,state,labels,body,subIssues` shape; the ancestor's parent number comes from a field the view JSON gives (add `parent` to the --json list if gh exposes it there, else one GraphQL read through `gh api graphql` with a fixed query for `parent { number }`; either way one read-only shape, documented in the card's pr.md). Closes use the existing `gh issue close <n> --repo <r> --comment <t>` shape.
- closesOf (pure) takes the chain: an array of ancestors from the direct parent upward, each with its number and its sub-issues' states, and returns the ordered list of closes (task, then each ancestor in order while all closed); finishLines prints a close line for each that failed, `(close failed: <why>)` as today, and reports `closed #<n>` for each that succeeded. A chain of one behaves exactly as today (same wording `all <k> tasks done` for the direct parent).
- The land nudge after finish (`lead: parent #<n> has <k> open tasks`) names the first ancestor left open, not the direct parent when that one was closed.
- A failed read of an ancestor stops the walk at that level with one line `# parent #<n>: read failed: <stderr first line>`; nothing above it is closed.
- tests/node/finishissue.node.mjs gains: chain of three all closed → three closes with the right comments; chain where the grandparent has one open sub-issue → task and parent closed, the grandparent's still-open line, nothing above; chain of one unchanged. One engine test in tests/ (harness test wrapper) runs a finish with a stubbed gh that answers the two views and asserts the two close commands were run in order.
- docs/guide.md's finish paragraph says finish closes each ancestor whose sub-issues are all closed, up to four levels, and prints the first one left open. CHANGELOG.md Unreleased gains one line. No other file changes.

## Review

Brain review: closesOf takes a chain of ancestors and walkAncestors (pure) closes each level while all its sub-issues are closed, the just-closed ones counted; finish reads each level with the view shape plus `parent` (allow.ts accepts the old and the new field list, nothing else) and stops at the first open ancestor, failed read or four levels; parentNudge names the first ancestor left open. Both amends approved: the allowlist field list and the merge test's stubbed argv. First attempt, $0.74.
