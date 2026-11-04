---
id: MOD-287
title: A card cut with no issue is matched against the planned tasks the mod filed, and the result says which to pass; the issueMatch option can make it a refusal
domain: mod
tier: standard
status: merged
issue: 334
scope: [hooks/lib/issuematch.ts, hooks/lib/land.ts, hooks/lib/landtree.ts, hooks/lib/card.ts, hooks/lib/configtable.ts, hooks/register.ts, .claude-plugin/plugin.json, tests/node/issuematch.node.mjs, tests/node/land.node.mjs, tests/issuematch.test.ts, tests/configcmd.test.ts, docs/guide.md, docs/configuration.md, CHANGELOG.md]
forbid: [hooks/lib/ghguard.ts, hooks/lib/mergecmd.ts, hooks/lib/version.ts, docs/cards/**]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs (the new tests/node/issuematch.node.mjs) — the 'a planned task under the card scope is suggested with its parent' case fails on main (no matcher exists) and passes after
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

The mod files hundreds of planned tasks and links a card to its issue at dispatch, but nothing at card time says that a planned task already covers the card's scope, so cards are cut from scratch beside open planned tasks and the trees never close (one adopter repo: 65 of 70 recent cards carry an issue, 6 of them a tree item; another: 550 cards, none). The mod already holds every filed item's paths and issue number locally, so the match needs no gh call. Closes #334.

## Done when

- land writes two more lines beside the `issue: #<n> <url>` line it already writes back to the landed file: `type: <type>` and, when a parent was given, `parent: #<n>`; land_plan and tree_import write the same for each item they file (tree_import already writes `issue` into the plan file; add nothing there beyond what the matcher reads). Older landed files without a type line are skipped by the matcher.
- A pure matcher in a new hooks/lib/issuematch.ts: given the card's scope globs, the candidates (every item of type task, bug or spike with an issue number, read from .delegation/landed/*.md that carry `type:` and `issue:` and no `closed:` line, and from .delegation/plans/*.json items with an `issue`), and the issue numbers already named by any card in the card folder (any status) or by a ledger row, it returns up to three candidates whose paths overlap the card's scope (the existing glob matcher; a path is a match when either side's glob covers the other), most overlapping first, excluding the already-named ones. An item's parent is its `parent:` line, or the plan file's enclosing item's issue.
- The card tool, when called without `issue` and the matcher finds candidates, adds to its result one line per candidate: `planned task #<n> "<title>" (under #<p>) overlaps this scope; pass issue: <n>, parent: <p>` (without the parent clause when none is known). /dispatch's dry run prints the same lines for a card with no `issue:`. With `issue` given, nothing is printed.
- New repo option `issueMatch` in hooks/lib/configtable.ts: `off`, `suggest` (default) or `require`; with `off` nothing is matched; with `require` the card tool refuses a card with no `issue` when a candidate exists, ending `pass issue: <n> (or set issueMatch suggest)`, and /dispatch refuses the same card the same way. The option appears in /delegation config, the manifest's userConfig if the others of repo scope do, docs/configuration.md, and the option count assertion in tests/configcmd.test.ts is raised by one.
- tests/node/issuematch.node.mjs: a planned task whose path is under the card's scope is suggested with its parent; one already named by a merged card is not; one whose landed file has a closed: line is not; three candidates are ordered by overlap and a fourth is cut; a feature or story is never a candidate. tests/node/land.node.mjs: the landed file gains type and parent lines. One engine test (harness test wrapper) runs the card tool with a landed file in place and asserts the suggestion line; one with issueMatch require asserts the refusal.
- docs/guide.md's planning section gets a paragraph on the match and the issueMatch option, including that a task closed on GitHub by hand still suggests until it is reconciled or its landed file carries closed:. CHANGELOG.md Unreleased gains one line. No other file changes.

## Review

Brain review: pure hooks/lib/issuematch.ts (landed and plan parsers, matcher on scopeOverlap, three lines, landedTail); fileOne writes type and parent beside the issue line for land, land_plan and tree_import; plannedFor in register.ts reads landed and plan files, excludes issues named by any card or ledger row, no gh; card tool and dispatch (dry run and real) print the lines, require refuses. Three amends approved (repoconfig key, options and land tests). Nits, not refuted: a landed item's title in the suggestion is its file slug (land keeps no title line); ledger rows carry no issue field yet so that exclusion is a no-op; no engine test of the dispatch dry-run lines. Explored on haiku/medium, first attempt, $0.11. Closes #334.
