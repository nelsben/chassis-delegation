---
id: MOD-189
title: "A card with issue: gets \"Refs #n\" in its PR body and a printed gh issue close line at merge finish, with a parent pointer when it has parent:"
domain: mod
tier: standard
status: merged
scope: [hooks/lib/mergecmd.ts, hooks/register.ts, tests/merge.test.ts, tests/node/finishkeep.node.mjs, tests/node/finishissue.node.mjs, docs/review-and-merge.md, CHANGELOG.md]
forbid: [hooks/lib/allow.ts, hooks/lib/card.ts, hooks/lib/scopetree.ts, hooks/lib/brief.ts, hooks/lib/verify.ts, .claude-plugin/**, hooks/lib/version.ts]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs (the new finishLines-with-issue test fails before mergecmd.ts prints the close line)
gate: validate, node
budget: 2-attempts
spend: 10
---
## Why

Feature management closes the task issue when its card merges. Closing keywords only fire on the default branch, and some adopting repos merge into long-lived integration branches, so the mod prints the close line itself at finish and the PR body only links. Parents are never closed by the mod: a feature whose current tasks are done is often not finished, so the finish points at the parent's progress and a human closes it.

## Done when

- The card's issue number is read from its frontmatter `issue:` line and the parent from `parent:` (both written by the card tool since MOD-188; see docs/contracts.md 'Parent scope'). A card with neither behaves byte for byte as today: pr.md, the push block and the finish block are unchanged, and the existing merge tests pass unchanged.
- prBody in hooks/lib/mergecmd.ts takes an optional `issue?: number`; when given, pr.md gains a line `Refs #<n>` directly above the GENERATED line, separated by a blank line. pr.md never contains the words Closes, Fixes or Resolves followed by an issue reference, with or without issue.
- finishLines in hooks/lib/mergecmd.ts takes optional `issue?: number`, `parent?: number`, `ownerRepo?: string`, `pr?: number` and `sha?: string`. When issue and ownerRepo are given, the first line of the block is `gh issue close <issue> --repo <ownerRepo> --comment <word>` where the comment, passed through the existing shellWord helper, is `merged in #<pr>` when pr is known, else `merged at <first 7 of sha>`. The branch delete and any release lines follow it as today.
- When parent and ownerRepo are also given, the block's last line is the shell comment `# parent #<parent>: gh issue view <parent> --repo <ownerRepo> --json subIssuesSummary; close it by hand when every task is done`. The mod never runs gh itself: no new gh shape is added anywhere, and hooks/lib/allow.ts is not touched.
- hooks/register.ts passes the card's issue, parent, the repo's owner/name (the same value the push block's gh pr create line uses), the PR number the finish already looks up, and the merged sha into finishLines, and the card's issue into prBody.
- Tests: tests/node/finishkeep.node.mjs (or a new tests/node/finishissue.node.mjs) covers finishLines with issue and pr, with issue and no pr (sha comment), with issue and parent, and with neither (unchanged). tests/merge.test.ts covers pr.md carrying `Refs #12` for a card with `issue: 12` and no Closes word.
- docs/review-and-merge.md gains a short paragraph saying what a card with issue: and parent: adds to pr.md and the finish block, and why the close is printed rather than left to a closing keyword. CHANGELOG.md gains an Added entry under ## Unreleased. No absolute path and no repo name other than this one in any changed file, fixtures included (use owner/name placeholders such as acme/widgets).

## Review

Attempt 1 consistent (sonnet, $0.27). Diff read: prBody and finishLines take the issue fields, finish reads the card before removing it and looks up owner/name with the same `git remote get-url origin` the merge allowlist already passes; cards without issue: are unchanged. The worker also ran the engine suite (1720 pass).
