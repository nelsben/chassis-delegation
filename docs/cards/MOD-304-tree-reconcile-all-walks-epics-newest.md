---
id: MOD-304
title: tree reconcile all walks epics newest first with a read cap per epic, so one run reaches every epic; with no type:epic label it points at setup
domain: mod
tier: standard
tier_reason: A loop restructure in reconcileWith with a given cap rule, one new gh read on an existing allow shape, and text changes
status: merged
scope: [hooks/lib/reconcile.ts, hooks/register.ts, tests/node/reconcileall.node.mjs, tests/reconcileall.test.ts, tests/harness.ts, docs/guide.md, CHANGELOG.md]
forbid: [hooks/lib/allow.ts, hooks/lib/ghguard.ts, hooks/lib/scheduler.ts, hooks/lib/configeff.ts, hooks/lib/configtable.ts, docs/cards/**]
red_test: node --test tests/node/reconcileall.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

On a repo with 37 open epics the shared treeImportBatch cap of 20 views was spent on the eight oldest epics (pre-card history, every child no match) and the 29 newer epics, every active one, were not read; and because the cap is shared and nothing changes without --confirm, running again gives the identical report (two runs on another repo were byte-identical). On two repos with no tree labels at all the run said "no open type:epic issue; name one", which sends the person the wrong way.

## Done when

- hooks/lib/reconcile.ts epicsOf returns the epics descending by number (newest first); every test pinning ascending order is rewritten
- register.ts reconcileWith for `all`: the view cap (cfg.treeImportBatch) counts the open children viewed within one epic and resets for the next epic, so every epic is walked in one run; the epic's own parent view is not counted; a child past the cap keeps `read: false` and its row reads `#<n> — not read: run /delegation tree reconcile <epic number>`; the run-level `skipped` list and the `not read: <k> epics (...): run again` line are removed from reconcileAllText (its notRead parameter goes, callers and tests updated); the single-epic path (`tree reconcile <n>`) keeps its current cap behaviour
- Views are paced: after the first, each `gh issue view` in a reconcile all run follows a 250 ms pauseOffBudget, as closes are paced at 1 s
- When the epic list is empty, reconcileWith runs the allowlisted `gh label list --repo <ownerRepo> --json name --limit 100` (the exact shape setupLabelListOk accepts; allow.ts is not changed) and answers `tree reconcile all: no type:epic label on <ownerRepo>: run /delegation setup to create the tree labels` when no label named type:epic exists, else the existing `no open type:epic issue` line; a label list that fails to run or returns non-JSON falls back to the existing line
- tests/node/reconcileall.node.mjs gains cases: epicsOf orders descending; reconcileAllText with a child marked not read prints the per-epic `run /delegation tree reconcile <n>` row and no run-level not-read line. The descending case fails on main
- tests/reconcileall.test.ts gains an engine case with three epics whose children total more than treeImportBatch (set the option low in the test): every epic heading appears in one run and the over-cap child row names its epic; and a case where the label list has no type:epic label and the setup line is returned
- docs/guide.md: the `tree reconcile all` paragraph says every epic is read in one run, newest first, with the cap per epic
- CHANGELOG.md gains one bullet under `## Unreleased` / `### Fixed` (create the heading above `## 0.9.50 — 2026-11-05` if absent) naming the change and (MOD-304)
- The validate, node and test gates pass

## Review

Read the diff: epicsOf sorts descending; reconcileWith resets `viewed` per epic and keeps the parent view uncounted; the run-level skipped list and the reconcileAllText notRead parameter are gone; the over-cap row names the single-epic command; the empty-epic path runs the allowlisted label list and points at setup only when the labels came back and lack type:epic. Nit kept: the 250 ms pause goes through pauseOffBudget, which sleeps whole seconds, so every view after the first costs about a second in `all` mode.
