---
id: MOD-294
title: A round-2 hand-back's files= is judged against that round's own delta, or a cumulative list is accepted; the refute names the base it compared against and lists the omitted paths in full
domain: mod
tier: standard
status: merged
issue: 388
scope: [hooks/register.ts, hooks/lib/verify-native.ts, hooks/lib/verify.ts, hooks/lib/attempts.ts, hooks/lib/handback.ts, tests/node/roundfiles.node.mjs, tests/roundfiles.test.ts, tests/harness.ts, CHANGELOG.md]
forbid: [hooks/lib/allow.ts, hooks/lib/ghguard.ts, hooks/lib/scheduler.ts, hooks/lib/configeff.ts, docs/cards/**]
red_test: node --test tests/node/roundfiles.node.mjs (fails now: the file does not exist; passes when a round-2 partial files= is held against the round delta)
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

A worker resumed for a second round listed only that round's files in files= and the verifier refuted it as "files= does not match the actual delta (omits ...)" because it compared against the whole branch since the dispatch base; the brain checked git by hand and overrode, twice in one day (#388). A refute the brain always overrides costs a wake and teaches nothing.

## Done when

- When a task has an earlier consistent (or reviewed) attempt on the same branch, the files claim of a later hand-back is held when files= matches the delta since that attempt's sha (the round's own delta) OR the delta since the dispatch base (the cumulative list); the held line says which (`files= matches the round delta since <sha7>` / `... the branch delta since <base7>`)
- When the claim still fails, the line says which base it compared against (`round base <sha7>` when a prior consistent attempt exists, else `dispatch base <sha7>`) and lists every omitted and invented path in full, never truncated
- filesClaim in hooks/lib/verify-native.ts stays pure; a new pure helper picks the round base from the attempt rows and is tested with filesClaim in a new tests/node/roundfiles.node.mjs: round-2 partial list accepted, round-2 cumulative list accepted, round-2 list that omits a file of its own round refuted naming the round base and the path
- An engine test in tests/ covers the wiring once; every engine test imports test from tests/harness.ts; the CHANGELOG gains one line under Unreleased / Fixed
- hooks/lib/allow.ts, hooks/lib/ghguard.ts and hooks/lib/scheduler.ts are untouched; the validate, node and test gates are green

## Review

Brain review: roundBase picks the newest earlier consistent or reviewed attempt's sha; verifyNative reads git diff --name-status -M <roundBase> <sha> only when one exists and not for a dirty-tree verify; filesClaimRound holds on the round delta or the cumulative delta with a line naming which, and a failure names the round base; with no prior round the old line is byte-identical and a second line names the dispatch base, which keeps the pinned tests. Nit, not blocking: roundBase matches on attempt number below the current one, so a round that reopens the same attempt number (a pause-cap or malformed-report reopen) has no round base and falls back to the dispatch base, which is the old behaviour. First attempt, $0.45.
