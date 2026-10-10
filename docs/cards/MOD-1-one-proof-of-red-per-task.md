---
id: MOD-1
title: One proof of red per task: a red file an earlier attempt of the task held with is held again, and a --verify at the last attempt's own sha re-judges that attempt instead of opening a new one
domain: mod
tier: standard
status: merged
scope: [hooks/lib/verify-native.ts, hooks/register.ts, hooks/lib/attempts.ts, hooks/lib/verify.ts, hooks/lib/quiet.ts, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/lib/gitguard.ts, hooks/lib/card.ts, hooks/lib/setup.ts, hooks/lib/scheduler.ts, hooks/lib/dispatch.ts, hooks/lib/brief.ts]
red_test: pure tests beside the existing redClaim tests: redClaim with hash H and a prior entry {attempt 1, hash H, held} is held with the reuse detail, and with that entry not held is failed as today; pure tests in tests/attempts.test.ts: the verify-target function over a ladder whose last attempt is refuted at sha X returns that attempt with rejudge true for X, a fresh attempt number with rejudge false for Y, and the work-present attempt for a work-present last record; engine tests in tests/hooks.test.ts: after a refuted attempt 1 at sha X whose red= is .delegation/<id>/red-1.txt, /dispatch <id> --verify X records no attempt 2, holds red, prints re-judging attempt 1/2 and no budget-exhausted line; and a resume hand-back at a new sha whose red= is attempt 1's held file is held on red; red first
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Public issue #35 (the first adopter, 2026-10-10): attempt 1 handed back a real red file and was otherwise good; a $0.07 docs-only resume reported the same red= path and was refuted "red evidence is attempt 1's file again" and advised a frontier respawn of the whole task. Red evidence proves the task's red test failed before the fix, and one proof per task is enough; a byte-identical file is the right evidence, not a forgery, when an earlier attempt already passed the red check with it. The same defect bit this repo on GH-116: after the brain amended the brief to approve a manifest edit, /dispatch GH-116 --verify 75640e2 (the sha attempt 1 handed back) opened attempts 2 and 3 instead of re-judging attempt 1, spent the budget to "exhausted", and refuted itself on red with every other claim held; runVerifyDispatch in hooks/register.ts re-uses only a work-present attempt, and redClaim in hooks/lib/verify-native.ts refutes any prior hash.

## Done when

- redClaim holds a red file byte-identical to one an earlier attempt of the same task passed the red check with, detail "attempt n's proof, reused (one proof per task)"; a file byte-identical to an earlier attempt's whose red claim did NOT hold (refuted or unchecked) is still refuted as today, so the prior-hash entries carry whether that attempt's red claim held
- /dispatch <id> --verify <sha> where <sha> equals the sha on the last attempt record (verdict verified, unverified, refuted, no-report, refused or over-spend; not pending or running) re-judges that attempt: the same attempt number, no new attempt record, no budget= consumed, a ledger verify row carrying that attempt number, the attempt's verdict and advice replaced as for any hand-back, and the dispatch output's first line says "re-judging attempt n/b at <sha>"
- a --verify at a sha no attempt recorded opens a new verify attempt exactly as today, and the work-present case is unchanged
- which attempt a --verify judges is a pure function in hooks/lib/attempts.ts: the last record and the sha in, { attempt, rejudge } out
- the escalation ladder is unchanged (ESCALATING_CLAIMS stays sha, gate, red): once a reused proof is held, the red refutes that remain say the worker skipped red-first
- README: the --verify paragraph names both cases and the red-evidence section says one proof per task
