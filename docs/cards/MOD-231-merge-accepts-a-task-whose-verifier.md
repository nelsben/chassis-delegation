---
id: MOD-231
title: merge accepts a task whose verifier said next=review and whose review then said next=accept
domain: mod
tier: standard
status: merged
scope: [hooks/lib/mergecmd.ts, hooks/register.ts, tests/mergecmd.test.ts, tests/node/*.mjs, tests/*.test.ts, CHANGELOG.md]
forbid: [hooks/lib/allow.ts, hooks/lib/version.ts, .claude-plugin/plugin.json, docs/cards/**]
red_test: a new mergecmd test fails now: the ledger rows consistent·next=review then review·reviewed·next=accept give a merge refusal
gate: validate, node, test
budget: 2-attempts
spend: 5
---
## Why

MOD-229's verifier row read consistent · next=review and its review row read reviewed · next=accept. merge refused anyway ("last verdict is consistent · next=review; merge needs consistent/accept"): latestVerdictRow in hooks/lib/mergecmd.ts skips a review row with next=accept and falls back to the consistent row, whose next is review. So a reviewed-and-accepted task can never merge.

## Done when

- Read hooks/lib/mergecmd.ts latestVerdictRow and verdictRefusal (about lines 100-130) and any other place in hooks/register.ts that decides merge readiness from the ledger (grep latestVerdictRow, verdictRefusal, and the merge-finish path) before changing anything.
- The rule: when the newest row for the task is a review row with next=accept and the row it reviewed (the latest non-review row of the same attempt) is consistent, merge treats the task as consistent · next=accept, with the attempt and sha of that consistent row. A review row with any other next (resume, check by hand) still blocks, as today. A consistent row with next=accept and no review row still merges, as today.
- The verdict tool and the band agree with merge: after a review row with next=accept, the verdict tool's reply for the task names next=accept, not next=review with a new review spawn block.
- Tests: (a) consistent·next=review then reviewed·next=accept merges; (b) consistent·next=review then reviewed·next=check by hand refuses; (c) consistent·next=accept alone merges; (d) consistent·next=review alone refuses; (e) the verdict tool after (a) reports next=accept and offers no spawn block.
- CHANGELOG.md gains an entry under ## Unreleased naming MOD-231. validate, the node tests and the engine suite pass.

## Review

Lead read the mergecmd.ts diff: a newest review row with next=accept now resolves to the consistent row of its attempt, with next=accept; any other review next still blocks. The verdict tool says "next=accept (reviewed)" with no spawn block. Band not changed; check that an owed review row clears after a real review. Found by MOD-229, whose reviewed-and-accepted verdict could not merge.
