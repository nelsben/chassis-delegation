---
id: MOD-20
title: Gates that run in parallel do not false-refute: a gate red only on timeouts in tests the delta never touched is re-run once, engine-suite gates take turns across workers, and the deny lexer stops reading redirects inside quoted text in a command substitution
domain: mod
tier: standard
status: merged
scope: [hooks/lib/verify-native.ts, hooks/lib/gates.ts, hooks/lib/brain.ts, hooks/register.ts, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/lib/allow.ts, hooks/lib/gitguard.ts, hooks/lib/card.ts, hooks/lib/dispatch.ts, hooks/lib/version.ts, bin/**]
red_test: pure tests: a gate output whose only failures are two `timed out after 5000 ms` lines in test files outside the delta is classified rerun, one with an assertion failure or a timeout in a touched file is not; bashWrites on the gh issue close example above gives no paths and on the real redirect inside a substitution gives hooks/a.ts; an engine test in which the first gate run is red on timeouts and the second green verifies with the rerun claim; red first
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

On 2026-10-11 two workers ran their gates on one machine at once (load average about 40). MOD-16's own engine run had six timeouts and passed on a rerun with no change; MOD-17 was refuted on gate because the verifier's engine run timed out on two tests MOD-17 never touched (dispatch tool registration, the dashboard band), and it took a re-judge by hand to see it was clean. Every two-worker wave carries this risk: the engine suite's per-test timeout is 5 seconds, and two suites at once blow it. Separately, the brain's own merge command was refused under delegateOnly because a comment string inside $( … ) carried `<task>-a<attempt>`, and the lexer read the `>` as a redirect to a file in the repo.

## Done when

- when the verifier's gate run is red and every failing test fails only with the engine's `timed out after N ms` and none of those tests sits in a file the delta changed, the verifier re-runs that gate once; the claim says `gate green on rerun (first run: n timeouts in untouched tests)` when the rerun passes, and the attempt is refuted as today when it does not; a failure that is not a timeout, or a timeout in a touched test file, is never re-run
- engine-suite gates (a gate-map command that runs `claude plugin test`) take turns across this session's workers: a verifier waits for another verifier's engine gate to finish before starting its own, with a store-held lock that expires after the gate's own timeout so a crash never wedges it; the wait is one line in the verdict detail (`waited 40 s for MOD-x's engine gate`)
- the delegateOnly lexer treats text inside quotes inside a command substitution as quoted, so `gh issue close 2 --comment "$(printf 'id <task>-a<n>')"` counts no write; a real redirect inside a substitution (`$(echo x > hooks/a.ts)`) still counts
- pure tests cover the timeout parser and the rerun decision; README (the gate claim, the turn-taking) and CHANGELOG
