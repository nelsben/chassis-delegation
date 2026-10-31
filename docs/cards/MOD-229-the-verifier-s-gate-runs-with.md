---
id: MOD-229
title: The verifier's gate runs with no 10-minute host cap: a spawned run with its own ceiling (gateTimeoutMinutes 1 to 120, default 30) and a "gate running Nm" row
domain: mod
tier: frontier
status: merged
issue: 323
scope: [hooks/register.ts, hooks/lib/verify-native.ts, hooks/lib/repoconfig.ts, hooks/lib/configtable.ts, hooks/lib/configeff.ts, hooks/lib/gaterun.ts, tests/*.test.ts, tests/node/*.mjs, docs/configuration.md, CHANGELOG.md]
forbid: [hooks/lib/allow.ts, hooks/lib/version.ts, .claude-plugin/plugin.json, docs/cards/**]
red_test: claude plugin test . (a new engine case fails now: a gate whose fake run takes 11 simulated minutes under gateTimeoutMinutes 30 is refused as over the cap instead of passing)
gate: validate, node, test
budget: 4-attempts
spend: 15
---
## Why

Issue #323: on a busy machine the engine suite takes longer than 9 minutes, so verdicts come back `unverified on gate … hit the verifier's 9-minute limit` and the brain re-runs gates by hand. The limit exists because `$.process.run` caps one call at 10 minutes (hooks/lib/verify-native.ts DEFAULT_GATE_TIMEOUT_MS, repoconfig.ts caps gateTimeoutMinutes at 10). `$.process.spawn` has no such cap: the child lives as long as its loop or the module, so a gate can run longer under a ceiling the mod sets itself.

## Done when

- FIND THE LIMITS FIRST and name them in the report: (a) every place the verifier's gate run is bounded (DEFAULT_GATE_TIMEOUT_MS and the io.exec in hooks/lib/verify-native.ts about line 866 and 954, the run calls in hooks/register.ts about lines 2949 and 5214, the engine-gate lock `until` at about line 4910, the repoconfig.ts 1-to-10 check); (b) whether the code path that runs the deferred verify (the background verify after a hand-back) is itself under a hook time budget shorter than the new ceiling. If (b) is yes, the design must move the gate wait out of that budget (the spawn loop runs on after the hook returns, as the host types' `session.start` spawn example shows, and the verdict is recorded when the child exits); say which you did.
- The verifier's gate commands run through `$.process.spawn` (a new helper in hooks/register.ts that collects stdout and stderr, at most 4 MiB each as run does, and returns the same `{ ok, exitCode, stdout, stderr }` shape the verifier's io.exec gives today), so no 10-minute host cap applies. Commands other than gates keep `$.process.run`.
- The ceiling is the mod's own: `gateTimeoutMinutes` accepts a whole number 1 to 120, default 30, in the repo file and the user option (hooks/lib/repoconfig.ts, hooks/lib/configtable.ts and hooks/lib/configeff.ts; the plugin.json option is forbidden to this card, so if a manifest default must change, say so in the report as an amend). At the ceiling the child is killed and the verdict is `unverified on gate` with the words `gate ran past gateTimeoutMinutes (<n> min)`; the engine-gate lock's `until` uses the same ceiling.
- While a gate runs, the verdict row (the band row and the `verdict` tool's reply when called) says `verifying (gate <id> running <m> min)`; time waiting for the engine-gate lock is shown apart as `waiting for the engine gate <m> min` and is not counted toward the ceiling.
- The verdict when the gate exits is exactly what it is today for the same exit code and output (pass, red, timeout-rerun logic in runGate unchanged).
- Tests (engine, with a fake spawn and the fake clock): a gate that runs 11 minutes under the default ceiling passes and records consistent; one that runs past gateTimeoutMinutes 2 is killed and unverified with the new words; the row text while running; lock wait not counted; gateTimeoutMinutes 121 and 0 refused with the 1-to-120 message. Existing exact-string tests that the new range text changes are updated, and only those.
- docs/configuration.md describes gateTimeoutMinutes as 1 to 120, default 30, the mod's own ceiling. CHANGELOG.md gains a Changed entry under `## Unreleased` naming MOD-229 and #323. validate, the node tests and the engine suite pass.

## Review

Four attempts. Attempt 1 built the spawned gate (spawnGate, a $.clock.after ceiling, gateTimeoutMinutes 1-120 default 30, the running-gate row) but left the manifest, configtable and upgrading doc at 9. Attempt 2 moved them to 30, and its red caught a real bug: a host default differing from the table's beat a repo-file value. Attempt 3 fixed two comments. Attempt 4 rebased over MOD-230 and MOD-231 and added two tests that MOD-230's load words fire on spawnGate red and ceiling results. The lead raised the budget to 3, then 4. DEFAULT_GATE_TIMEOUT_MS (9 min) stays only as the pure-path fallback; production always passes io.gate. Its reviewed-and-accepted verdict could not merge until MOD-231. Unproven without a live run: that stream.return() kills the OS child, the 4 MiB cap on real output, and the band row's running text.
