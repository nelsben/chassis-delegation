---
id: MOD-299
title: `tree reconcile all [--confirm]` runs reconcile over every open top-level tree issue of the repo in one command, with one report and one cap, instead of one command per epic
domain: mod
tier: standard
tier_reason: A loop over the existing single-issue path with a shared cap, a tool schema change and a combined report; cross-cutting
status: merged
scope: [hooks/lib/reconcile.ts, hooks/lib/tree.ts, hooks/register.ts, hooks/lib/allow.ts, tests/allow.test.ts, docs/guide.md, tests/node/reconcileall.node.mjs, tests/reconcileall.test.ts, tests/node/reconcile.node.mjs, tests/reconcile.test.ts, tests/harness.ts, CHANGELOG.md]
forbid: [hooks/lib/ghguard.ts, hooks/lib/scheduler.ts, hooks/lib/configeff.ts, docs/cards/**]
red_test: node --test tests/node/reconcileall.node.mjs (fails now: the file does not exist; passes when epicsOf orders the open epics and reconcileAllText joins the per-epic reports with one close block)
gate: validate, node, test
budget: 3-attempts
spend: 10
---
## Why

After a release the person runs `tree reconcile <n>` once per top-level issue, then again with --confirm: a repo with ten epics is twenty commands, read one at a time. The mod already lists the repo's issues with their labels in setup (untypedIssues), so it can find the open type:epic issues itself and walk them. One command, one combined report, one close pass.

## Done when

- `/delegation tree reconcile all [--confirm]` and the tree tool with `reconcile: true, all: true` (a new boolean property on TREE_TOOL; `issue` stays required only when `all` is not true) run the existing single-issue reconcile over every open issue of the repo that carries the `type:epic` label, in ascending number order; parseReconcileArgs accepts the word `all` in place of the number and returns `{ all: true, confirm }`; the usage line becomes `/delegation tree reconcile <n>|all [--confirm]`
- The top-level issues are read with one `gh issue list --repo <owner/repo> --state open --label type:epic --limit 100 --json number,title` call through the existing run() path; no open type:epic issue prints `tree reconcile all: no open type:epic issue on <owner/repo>; name one: /delegation tree reconcile <n>`; a gh failure prints `tree reconcile all: <why>` in the single-issue form
- The report is one text: for each epic a heading line `## #<n> <title>` followed by that epic's existing three lists and lines unchanged, and after the last epic one block of every `gh issue close` line (done-elsewhere first, then the commented not-planned lines) so the person copies one block; an epic with nothing in any list prints its heading and one line `nothing to reconcile`
- The read cap is shared across the run: at most treeImportBatch sub-issue views in total, counted across epics in order; when the cap is hit the remaining epics are not viewed and the report ends with `not read: <k> epics (#a, #b, …): run again`, and sub-issues not read inside the epic where the cap fell keep the existing `not read: run again` line
- With --confirm the done-elsewhere closes run across all epics in report order, at most treeImportBatch per run and one second apart, with the existing `closed #<n>` / `close #<n> failed: <why>` lines under each epic's heading and the existing landed-file `closed:` write; closed-with-children and no-match rows are never closed, and the gh guard is unchanged
- A pure helper in hooks/lib/reconcile.ts (e.g. `epicsOf(json)` for the list JSON and `reconcileAllText(parts, notRead)` for the combined report) is tested in a new tests/node/reconcileall.node.mjs: order, the empty case, the combined close block, the cap line; one engine test in a new tests/reconcileall.test.ts covers the `all` word reaching the tool (the usage line and the no-epic line), importing test from tests/harness.ts
- docs/guide.md: the MOD-288 paragraph and the adoption step 6 name `tree reconcile all` as the way to retire everything in one go; CHANGELOG.md gains one line under Unreleased / Added (create the Unreleased heading above 0.9.49)
- hooks/lib/allow.ts gains one exact-shape check for that list call (`gh issue list --repo <landRepo> --state open --label type:epic --limit 100 --json number,title`, pinned to the landRepo like setupIssueListOk; any other flag, label, state, limit or json set stays refused), with a case in tests/allow.test.ts for the allowed shape and one refused variant; no other gh shape is added
- hooks/lib/ghguard.ts, hooks/lib/scheduler.ts and hooks/lib/configeff.ts are untouched; the validate, node and test gates are green

## Review

Brain review: parseReconcileArgs takes the word all; reconcileWith lists open type:epic issues with one gh issue list call (the guard gains exactly that landRepo-pinned shape, epicListOk, next to setupIssueListOk), walks them ascending with one shared treeImportBatch sub-issue view counter, builds one Reconciled per epic, and prints reconcileAllText: a heading per epic, its rows or "nothing to reconcile", one close block with done-elsewhere lines before the commented not-planned lines, and the "not read: k epics" line; with --confirm the closes run across epics in order under the same cap, one second apart, with the landed closed: write unchanged. The single-issue path is byte-identical in output. TREE_TOOL requires issue or all. Nits, not blocking: the epic's own parent view is not counted against the cap (only sub-issue views are, as the card says); with both issue and all set, all wins silently. Attempt 1 was refuted on sha (the worker wrote the word HEAD) and the guard blocked the list call; granted allow.ts + its test, verified by hand at 075fb2b after the resume's verifier never ran. $0.47 plus the resume.
