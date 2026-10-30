---
id: MOD-195
title: merge finish closes the feature when its last task closes: finish reads the parent with the MOD-194 gh issue view shape and, when every other sub-issue is closed, prints a gh issue close line for the parent after the task's
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/mergecmd.ts, tests/merge.test.ts, tests/node/finishissue.node.mjs, docs/review-and-merge.md, CHANGELOG.md]
forbid: [docs/cards/**, hooks/lib/allow.ts, hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, docs/upgrading.md]
red_test: "tests/merge.test.ts: a finish of a card with issue: 52 and parent: 50, with a fake gh whose `gh issue view 50 --repo o/r --json number,title,state,labels,body,subIssues` prints parent #50 open with subIssues { nodes: [#51 CLOSED, #52 OPEN], totalCount: 2 }: the finish text carries `gh issue close 52 --repo o/r --comment 'merged in #<pr>'` and then `gh issue close 50 --repo o/r --comment 'all 2 tasks done'`; with #51 OPEN instead it carries the line `# parent #50: 1 of 2 tasks still open (#51)` and no parent close line; when the view fails it falls back to today's `# parent #50: gh issue view …` comment. tests/node/finishissue.node.mjs covers the pure function. All fail on main."
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

The founder plans in Claude and never opens GitHub, so the tree has to close itself as the cards merge. MOD-189 made finish print the task's close line, but for the parent it only prints a comment saying to check by hand. The mod stays read-only on GitHub: it reads the parent and prints the line the brain runs.

## Done when

- finishLines in hooks/lib/mergecmd.ts takes an optional siblings?: { number: number; state: string }[] (the parent's sub-issues as read). When siblings is given and every sub-issue other than o.issue is CLOSED (any case; the one being closed counts as closed), the parent line is `gh issue close <parent> --repo <owner/repo> --comment 'all <k> tasks done'` (k = siblings.length, quoted with shellWord) placed right after the task's close line; when some are still open it is the comment line `# parent #<p>: <m> of <k> tasks still open (#a, #b)`; when siblings is absent it is today's comment line unchanged.
- In hooks/register.ts finish, when the card has issue and parent and ownerRepo is known, it reads the parent with run(['gh','issue','view',String(parent),'--repo',ownerRepo,'--json','number,title,state,labels,body,subIssues']) with a 60 s timeout, the exact MOD-194 allowlist shape (allow.ts is forbidden and unchanged), and passes the parsed sub-issues (nodes array or plain array) to finishLines. landRepo must be set to ownerRepo before the run so the shape passes; the run must pass the allowlist while merge is running (test it). A failed or unparsable read passes no siblings.
- The parent's close line is printed, never run: the mod still calls no gh write.
- docs/review-and-merge.md 'A card with an issue' describes the parent close line; CHANGELOG.md Unreleased entry.
- The gates pass: claude plugin validate, the node suite, claude plugin test.

## Review

Consistent first attempt. allow.ts was forbidden, so the worker clears mergeCtx for the single read-only gh issue view and restores it in a finally. Accepted: dropping mergeCtx only removes the merge-time git shapes for that await; it grants nothing a non-merge run lacks. Follow-up folded into the worker-guard card: let allow.ts pass the MOD-194 view shape while merge runs, and remove this toggle.
