---
id: MOD-215
title: tree import: file a large multi-level plan from a JSON file, with a dry run first and an idempotent re-run
domain: mod
tier: standard
status: merged
scope: [hooks/lib/landtree.ts, hooks/lib/land.ts, hooks/register.ts, hooks/lib/configtable.ts, .claude-plugin/plugin.json, tests/landtree.test.ts, tests/node/landtree.node.mjs, docs/guide.md, docs/configuration.md, CHANGELOG.md]
forbid: [hooks/lib/allow.ts, hooks/lib/version.ts, docs/cards/**]
red_test: claude plugin test . (tests/landtree.test.ts fails now: no tree import)
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Adopter feedback: a backfill tree of 7 features, 37 epics, about 150 stories and 100 tasks is far past one land_plan call (one level, 30 tasks). Filing it today takes hundreds of tool calls and hand-linking. A file import with a dry run and a resumable re-run files it in one reviewed step.

## Done when

- A plan file is JSON under `.delegation/plans/` (the command refuses any other folder): `{ "version": 1, "parent"?: <n>, "items": [ { "type", "title", "paths"?, "note"?, "close"?, "children"?: [...] } ] }`, types feature, epic, story, task, nested up to 4 levels, with the MOD-213 path rules (tasks need paths; a child's paths sit inside its parent's when the parent has paths) and the MOD-214 close rule, checked at every level before anything is filed. A pure parser/validator in hooks/lib/landtree.ts returns the normalised tree or every error with its item path (e.g. `items[2].children[0]`).
- `/delegation tree import <file> [--dry-run]` and a `tree_import` tool (`file`, `confirm`). Without confirm (and always with --dry-run) it prints the whole tree indented with per-type counts, how many are new, may-reuse and filed-closed, and runs no gh. With confirm: true it files parents before children with the existing land shapes, under `parent` when given, each landed file carrying the MOD-207 plan: key so a re-run reuses what is filed and files only what is missing.
- Pacing: at most 20 creates per run by default (option `treeImportBatch`, 1 to 100), then it stops with `filed k of n; run again to continue`; a GitHub sub-issue cap (100 per parent) is checked in the validator and refused before filing.
- The import writes each filed item's issue number back into the plan file (`"issue": <n>` on the item, the file rewritten whole, 2-space JSON) after each create, so the file is the manifest and a re-run reads it first; an item with `issue` whose issue is OPEN (or CLOSED with `close`) is skipped without a create. Creates are paced at least 1 s apart.
- Every create and close goes through the existing allowlisted shapes; no new gh shape. Titles and bodies pass the redact rules.
- Tests: tests/landtree.test.ts (engine) covers dry run counts with no gh, a 3-level file filed parents-first, a re-run after a partial failure files only the missing items, the batch stop line, a validation error naming the item path, a file outside .delegation/plans/ refused; tests/node/landtree.node.mjs covers the pure validator.
- docs/guide.md gains a `Tree import` section with a short example file (placeholder titles only); the option is in docs/configuration.md, hooks/lib/configtable.ts and .claude-plugin/plugin.json (option only; the version untouched). CHANGELOG.md gains Added entries under `## Unreleased` naming MOD-215. validate, the node tests and the engine suite pass.

## Review

Read the tree_import core: validation before any gh call, preview without confirm, parents before children through fileOne, the issue number written back after each create, the batch stop, 1 s pacing, and children-first closes. The three test amends were approved after reading them; they are mechanical. Nit for later: an item whose recorded issue is CLOSED but has no close: field gets filed again instead of reused or flagged.
