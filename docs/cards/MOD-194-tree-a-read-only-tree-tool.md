---
id: MOD-194
title: tree: a read-only tree tool and /delegation tree <n> read one issue and its sub-issues with one exact gh issue view shape and print planned / in flight / done, matched to cards, with the parent's scope and forbid blocks
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/allow.ts, hooks/lib/tree.ts, tests/allow.test.ts, tests/tree.test.ts, tests/node/tree.node.mjs, tests/background.test.ts, docs/guide.md, CHANGELOG.md]
forbid: [docs/cards/**, hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, docs/upgrading.md]
red_test: "tests/tree.test.ts: the tree tool, through the harness, with a fake gh whose `gh issue view 50 --repo o/r --json number,title,state,labels,body,subIssues` prints a JSON fixture (feature #50 with a ```scope block hooks/** and a ```forbid block docs/cards/**, sub-issues #51 closed, #52 open, #53 open) and a card folder holding a card with issue: 52 status queued: asserts the argv was exactly that, and the text has the header `#50 feature: <title> (open)`, `scope: hooks/**`, `forbid: docs/cards/**`, then `done #51 …`, `in flight #52 … MOD-<id>`, `planned #53 …`, and the count line `1 done · 1 in flight · 1 planned`. tests/allow.test.ts: the view shape passes; other --json fields, another repo, --web, --comments, a non-numeric number and an absent landRepo are refused. tests/node/tree.node.mjs: the pure parse. All fail on main."
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

The founder plans in Claude; a new session must be able to read the plan back without anyone opening GitHub, and the brain must read a feature's scope to cut a task's card with parentScope. Today nothing reads an issue tree back. One read-only allowlist shape keeps the mod's GitHub surface small.

## Done when

- hooks/lib/tree.ts (new, pure, no I/O): fencedBlock(body, name) returns the lines of the first ```<name> fenced block (trimmed, blank lines dropped) or []; treeOf(json, cards, done) takes the parsed gh JSON (number, title, state, labels [{name}], body, subIssues — accept both an array and { nodes: [...] } of { number, title, state, url? }), the open card list ({ id, issue?, status? }) and the set of done task ids, and returns { header, scope, forbid, rows, counts }: a sub-issue is done when its state is CLOSED (any case) or its card's id is in done; in flight when a card names it in issue: and it is not done; planned otherwise. type is the first label matching ^type:(.+)$, else 'issue'. treeText(tree) renders: `#<n> <type>: <title> (<open|closed>)`, `scope: <globs comma-joined>` and `forbid: …` (each only when non-empty), one row per sub-issue in number order `<done|in flight|planned> #<n> <title>[ <card id>]`, then `<d> done · <f> in flight · <p> planned`, and a last line `parentScope for a task card: <scope globs as JSON array>` when scope is non-empty.
- hooks/lib/allow.ts gains exactly one shape, documented in the header beside MOD-192's: gh issue view <1-9 digits> --repo <landRepo> --json number,title,state,labels,body,subIssues (args in exactly that order, that exact field list); absent landRepo refuses it. Nothing else changes in allow.ts.
- A new tool tree is registered in session.start after land_plan (same try/debug pattern) with inputSchema { issue: number (required, whole number 1+) }, description: reads one GitHub issue of this repo and its sub-issues (read-only) and prints what is planned, in flight and done, matched to cards, with the issue's scope and forbid blocks; use it at the start of a session to pick up the plan, and before cutting a card under a parent to get parentScope. It is answered by an on('tool.call', { tool: 'mcp__chassis-delegation__tree' }) hook, and /delegation tree <n> answers the same text through the same function. landRepo is filled from <root>/.git/config the way landWith fills it, before the run.
- The run goes through run() with a 60 s timeout; on non-zero exit, bad JSON, or a non-GitHub origin it returns one line saying why (gh's stderr trimmed to 400 characters) and nothing else. It writes no file.
- Cards are read from the card folder the way landWith reads them (parseCard; card field issue), done ids from doneTasks(ledger).
- tests/background.test.ts tool list ends 'land', 'land_plan', 'tree'. docs/guide.md 'Planning on GitHub' documents tree and how the brain uses its parentScope line with the card tool's parent/parentScope; CHANGELOG.md Unreleased entry.
- The gates pass: claude plugin validate, the node suite, claude plugin test.

## Review

Consistent first attempt. Checked the real gh output shape: subIssues is { nodes: [], totalCount }, which treeOf accepts. The view shape is checked before the issueRepo refusal, so it works in repos with no issueRepo. Exactly one read-only shape added.
