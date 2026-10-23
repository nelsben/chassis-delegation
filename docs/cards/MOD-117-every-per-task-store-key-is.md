---
id: MOD-117
title: Every per-task store key is scoped to the card's repo, so a card id reused in a second repo starts at attempt 1 and is checked against its own folders
domain: mod
tier: frontier
status: merged
scope: [hooks/register.ts, hooks/lib/**, tests/**, CHANGELOG.md, docs/internals.md]
forbid: [bin/**, hooks/templates/**, .claude-plugin/**, docs/cards/**, .chassis-delegation.json]
red_test: the new two-root engine test fails at the base: the second repo's first dispatch prints attempt 2/2 (save that run under .delegation/MOD-117/ as the red evidence)
gate: validate, node, test
budget: 2-attempts
spend: 25
---
## Why

Issue #185 (and #184, the same cause). The store is one file per machine, and a local card's records sit under bare ids (delegation.tasks.<id>, delegation.outside.<id>, delegation.effort.<id>, delegation.classifier.<id> and the like); only cross-repo cards take the @<repo> suffix (K.tasksIn). Card ids restart in each repo, so a second repo's first OPS-4 dispatch printed attempt 2/2 and was judged against the other repo's outside listing.

## Done when

- Every per-task key in K (hooks/register.ts) that is keyed by a card id (tasks, outside, effort, classifier and any other found by reading K and its callers) is keyed by id plus the card's repo for local cards too, in the same form K.tasksIn uses for another local repo. List the keys changed in the report's metrics or the commit message.
- In a store that already holds attempts for OPS-4 from another root, the first dispatch of this repo's OPS-4 prints attempt 1/2, and its verdict reads the outside listing taken at its own dispatch.
- On session start, once and idempotently, each bare per-task key is migrated: rows that carry a root (or repo) field go to the scoped key for that root, rows with none go to the session root's key, and the bare key is removed. A debug log line says how many keys moved. Retention/pruning walks the new keys.
- Cross-repo cards (repo=<path>) behave as before; their existing tests pass unchanged.
- Tests: an engine test with two roots sharing a card id (attempt 1/2 in both; outside listing not shared); a migration test on a store seeded with mixed-root rows under a bare key; pure tests for any new key helper. CHANGELOG gains an Unreleased entry naming #185 and #184.
- No machine paths, user, product or repo names in code, tests, commit or CHANGELOG. The validate, node and test gates pass.

## Review

Attempt 1 (opus) accepted. Every per-task store family keyed by a card id (tasks, outside, effort, classifier, taskRepo, mergePrep) and the attempt keys (posted, postedRow and the in-memory maps) now carry the card's repo as an absolute root path, for the session repo's own cards too; K.tasksIn folds into K.tasks. A once-per-root, idempotent migration in hooks/lib/taskkeys.ts moves bare keys to the root their rows name (else the session root), deletes bare keys only when every write landed, and logs one debug line. The red differed from the card's guess: MOD-97's root filter already kept attempt counts apart, but at base the two repos shared the posted key (the second verdict row was never posted) and the outside listing; the two-root test catches both. Retention still groups by bare id (cautious: an open OPS-4 in one repo keeps the other's keys). handoff and replay stay keyed by brief path. Gates green: validate, node 995/0, plugin 1508/0.
