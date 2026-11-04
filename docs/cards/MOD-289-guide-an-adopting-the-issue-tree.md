---
id: MOD-289
title: Guide: an 'Adopting the issue tree in an existing repo' section with the checklist, what closes what, and a plain map from the owner's words to steps
domain: mod
tier: economy
status: merged
issue: 335
scope: [docs/guide.md, tests/node/docs.node.mjs, CHANGELOG.md]
forbid: [hooks/**, docs/cards/**, .claude-plugin/plugin.json]
red_test: none
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

The adoption steps live in people's heads and in six paragraphs spread through the guide; the next repos to adopt the tree need them in one place, in order. Issue #335 asks separately for a plain-language map from what the owner says (check, file, card, do) to the commands. Closes #335.

## Done when

- docs/guide.md gains a section 'Adopting the issue tree in an existing repo' with, in order: run /delegation setup and act on its Tree lines (labels, project, scopeAmends within-parent, untyped issues); write the backlog as a .delegation/plans/<name>.json in the order epic, feature (optional), story (optional), task / bug / spike; tree import --dry-run, then confirm in batches; from then on every card takes the issue: and parent: the card tool suggests (and what issueMatch require does); run tree reconcile <n> on each top-level item once to retire what already shipped. Each step names the command and what it prints.
- The same section has a short table 'What closes what': a task closes at merge finish; each ancestor closes at finish when all its sub-issues are closed, up to four levels; reconcile proposes closes for planned tasks done by unlinked cards; nothing else in the mod closes an issue; a parent closed by hand with open children is listed by reconcile and left for the person.
- docs/guide.md gains near the top a table 'When you say ... run ...' mapping the owner's words to steps: 'check this' → the tree tool or /delegation (the status band); 'file this' → land; 'plan this' → land_plan or tree import; 'card this' → the card tool; 'do it' → dispatch; 'is it done' → verdict and merge; 'release' → the release card shape. One row per phrase, each naming the tool and the command, as #335 asks.
- Every command and option named in the two sections exists in this repo at the card's base commit, or is one of the 0.9.48 additions in CHANGELOG.md Unreleased (tree checks in setup, issueMatch, tree reconcile, the ancestor close); the worker reads CHANGELOG.md Unreleased and the hooks/lib files for the exact words and prints nothing it cannot find there.
- tests/node/docs.node.mjs, if it checks guide headings or links, passes with the new sections; no other test changes. CHANGELOG.md Unreleased gains one line for the two sections. No other file changes.

## Review

Brain review: guide gains the owner-words table (seven rows, each naming the tool and the slash command) and the adoption section (six ordered steps: setup Tree lines, plan file in rank order, dry run, confirm in batches, cut cards from issues with the issueMatch lines, reconcile) plus the What closes what table; every command and option checked against 0.9.48 behaviour. The worker's added row for land --supersedes and --closed is right, the code does close there, and the card's "nothing else closes" sentence holds for the rest. CHANGELOG line under Unreleased/Added. First attempt, $0.02.
