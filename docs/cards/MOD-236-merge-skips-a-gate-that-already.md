---
id: MOD-236
title: Merge skips a gate that already passed at verify on the same tree, and "gate reused" means a real reuse
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/verify.ts, hooks/lib/verify-native.ts, hooks/lib/mergecmd.ts, tests/merge.test.ts, tests/verify.test.ts, tests/verifynative.test.ts, tests/gaterun.test.ts, tests/dispatchsays.test.ts, tests/harness.ts, tests/node/**, CHANGELOG.md]
forbid: []
red_test: tests/merge.test.ts: a merge whose rebase changes nothing but the card file runs no gate process (fails today: all gates re-run)
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Merge re-runs every card gate (hooks/register.ts near 3014-3031) even when the verifier passed them on an identical tree, about 2 minutes of engine lock per card; today no gate result is recorded per gate, the verifier sets one held claim for the set and stops at the first failure. Separately, gateReusedIn (hooks/lib/verify.ts near 326-329) matches every `not re-run` reason (gate id not in gateMap, tree not at sha, a refused command) and labels it 'gate reused (recorded pass, not re-run)', which misleads. This only pays off when the rebase moves nothing but the card; with several cards in flight most rebases move the base and every gate still runs.

## Done when

- VerifyResult gains gateTree: a map from each gate id whose runs all exited 0 to the worktree tree hash (git rev-parse HEAD^{tree}) they ran on, keyed by the gate id that actually ran (the _empty swap included); judged writes it into the ledger verdict row.
- Merge, after its rebase and card commit, reads gateTree from the ledger (ledgerText, not the spawn record which may be pruned), runs `git diff-tree -r --name-only <verifiedTree> HEAD^{tree}`, and when the output is empty or names only the card's path, skips each gate whose id has a recorded tree equal to the verified tree, printing `<gate>: gate reused (pass at verify on tree <short>, not re-run)` into merge-gates.txt and the merge output; a git-ignored card (no card commit) counts as no card change.
- Any other path in that diff-tree output re-runs every gate as today.
- gateReusedIn is replaced by gateNotRerun(lines) which names the reason after the label: `gate not re-run (not in gateMap)`, `gate not re-run (tree not at sha)`, `gate not re-run (refused)`; the words `gate reused` appear only for the merge skip above. tests/gaterun.test.ts and tests/dispatchsays.test.ts, which pin the old words, are updated in the same change.
- Tests: a merge with no base movement skips all three gates; a merge after the base moved runs them; the renamed labels in node tests.
- CHANGELOG.md gets an Unreleased line.
- Gates validate, node and test are green.
