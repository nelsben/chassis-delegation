---
id: MOD-259
title: Test gap: an engine test of the land overlap list with a parked card
domain: mod
tier: standard
status: merged
scope: [tests/land.test.ts, tests/harness.ts, hooks/lib/land.ts, hooks/register.ts]
forbid: []
red_test: none
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

MOD-216 added the parked status, and openCards (hooks/lib/land.ts near 203) drops parked and merged cards, but no engine test checks that land's overlap list (cards whose scopes overlap the one being landed) leaves a parked card out while keeping an open one. The parked work-tree cards MOD-178/179 sit in this repo, so the path is live.

## Done when

- An engine test lands a plan where one open card and one parked card both overlap the landed card's scope, and asserts the overlap list names the open card only.
- A second case asserts a merged card is left out the same way.
- No production code changes unless the test exposes a bug; any such fix is named in the report.
- Gates validate, node and test are green.
