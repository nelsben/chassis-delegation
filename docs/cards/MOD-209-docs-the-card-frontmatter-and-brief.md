---
id: MOD-209
title: Docs: the card frontmatter and brief header fields the GitHub sync reads, for hand-written cards
domain: mod
tier: standard
status: merged
issue: 303
scope: [docs/contracts.md, CHANGELOG.md]
forbid: [hooks/**, tests/**, docs/cards/**, .claude-plugin/**]
red_test: none (docs only)
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Issue #303: repos that write cards and briefs with their own tooling cannot tell from the docs whether hand-written issue:, parent: and parentScope: frontmatter (and parent_scope= in a brief header) are read the same way by dispatch status comments, merge-finish closes and scopeAmends within-parent.

## Done when

- docs/contracts.md gains a section `Fields the GitHub sync reads` that lists, from reading hooks/register.ts and hooks/lib/*.ts (not from memory), each card frontmatter key (issue, parent, parentScope, status and any other the sync reads) and brief header key (parent_scope and any other), its exact syntax, which step reads it (dispatch status comment, verdict comment, merge finish close of the task and of the parent, scopeAmends within-parent, land --supersedes), and whether a hand-written line is read the same as one the card tool writes; any case where it is not is stated plainly.
- It includes one minimal hand-written card frontmatter example and one brief header example that get the full sync, using placeholder ids only (no real repo, product or person names, no /Users/ paths).
- CHANGELOG.md gains a Documentation entry under the existing `## Unreleased` heading naming MOD-209 and #303. No code changes. validate, the node tests and the engine suite pass.

## Review

Consistent on attempt 1 (sonnet, $0.32). docs/contracts.md gains "Fields the GitHub sync reads", written from the code: hand-written cards are parsed the same; issue:/parent: must be bare numbers (#12 is ignored by comments and closes); hand-written cards skip the card tool's write-time checks; the PR body line is Refs, not Closes. CHANGELOG conflict with MOD-208 resolved by hand, both entries kept.
