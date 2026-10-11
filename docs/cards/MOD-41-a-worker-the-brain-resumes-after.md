---
id: MOD-41
title: A worker the brain resumes after a consistent verdict is judged when it hands back again, as a new attempt
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/attempts.ts, hooks/lib/handback.ts, hooks/lib/verify.ts, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/templates/**, hooks/lib/allow.ts, hooks/lib/verify-native.ts, hooks/lib/gitguard.ts, hooks/lib/brain.ts, hooks/lib/version.ts, hooks/lib/legacy.ts, hooks/lib/cleanstop.ts, bin/**]
red_test: engine test in tests/hooks.test.ts: a worker's attempt 1 is consistent at sha 1111111; the same agent then hands back a report at sha 2222222; the mod prints a verdict row for attempt 2/2 and the ledger gains exactly one row for it (fails today: no row); red first
gate: validate, node, test
budget: 2-attempts
spend: 6
---
## Why

Found on 2026-10-11 with MOD-38: attempt 1 came back consistent (next=accept), the brain saw the work could not fire live and resumed the same worker with SendMessage to fix it; the worker handed back a new sha with a report, and the mod posted no verdict and wrote no ledger row for it. The brain had to re-judge by hand with /dispatch MOD-38 --verify. A resume after accept is a normal move (the brain reads the diff and finds a problem the claims could not), and a hand-back the mod silently drops is exactly the gap the mod exists to close. A resume the mod itself advised (after a refute) is judged today; one the brain chooses after a consistent verdict is not.

## Done when

- when a worker whose last attempt was judged consistent (or consistent with report gate=fail, or unverified) hands back again with a report whose sha differs from that attempt's, the mod records the next attempt for the task (kind resume, same lineage, budget counted as for any resume) and judges it exactly as an advised resume's hand-back, posting the verdict row and writing the ledger row; a hand-back at the same sha is the MOD-1 re-judge and changes nothing
- a hand-back past the task's budget= is judged and its row says the budget is spent (next=check by hand or stop as today); it is never dropped
- the brain's own SendMessage resume needs no new command: the hook that sees the worker's hand-back finds its attempt record by agentId whatever the previous verdict was
- an engine test: attempt 1 consistent at sha X, then a hand-back from the same agent with a report at sha Y prints the attempt 2/2 verdict row and writes one ledger row; a hand-back at X again writes nothing; README (resuming after accept) and CHANGELOG
