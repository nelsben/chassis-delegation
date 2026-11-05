---
id: MOD-307
title: A red gate on a hand-back that claimed gate=pass is re-run once on its own before the verdict says red, and the row says so
domain: mod
tier: standard
status: merged
issue: 394
scope: [hooks/lib/verify-native.ts, hooks/lib/gaterun.ts, hooks/lib/verify.ts, tests/node/gaterelay.node.mjs, tests/gaterun.test.ts, tests/verifynative.test.ts, tests/harness.ts, docs/contracts.md, CHANGELOG.md]
forbid: [hooks/register.ts, hooks/lib/allow.ts, hooks/lib/scheduler.ts, hooks/templates/**, docs/cards/**]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/gaterelay.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

With several workers running full suites on one machine, a timing test went red under the verifier's run twice for a branch that was green alone; the brain re-ran the suite and accepted by hand. Issue #394. Today only a red whose output shows timeouts in untouched tests is re-run (timeoutRerun in hooks/lib/verify-native.ts); any other red with a gate=pass claim is a refutation at once.

## Done when

- In hooks/lib/verify-native.ts the gate step re-runs a gate once more when all of these hold: the first run completed (ok) and exited non-zero and not 126 or 127; the report says gate=pass; the run is a worktree run (repo=here is not re-run: the tree can change under it) and the tree is still at the sha; no timeoutRerun already ran. This widens MOD-20 on purpose: MOD-20 kept the re-run narrow (timeouts in untouched tests only) because an assertion failure is usually real, but with several suites sharing one machine a timing test goes red under load for a branch that is green alone (#394); the re-run costs one gate run and the row says it happened. gate=fail with a red first run is still not re-run.
- The second run's result is the one judged. Green: claim gate held with detail `gate=pass confirmed on re-run (first run red: <first failure gateFailures() reads, else the last non-blank output line, cut to 120 chars>)`. Red: the existing refutation claim line is unchanged, and after the output tail a separate line `note: the gate was re-run once on its own and was red again` is added (the MOD-20 note pattern at verify-native.ts line 1049). The MOD-230 load line, when it follows a re-run, is prefixed `re-run: `.
- The verify-gate-<attempt>.txt file holds the second run's output when the second run was red; the first run's output is written beside it as verify-gate-<attempt>-first.txt. tests/gaterun.test.ts line 303 (the written-files assertion) is updated for the pair.
- tests/gaterun.test.ts: the MOD-20 cases `an assertion failure is not run again` and `a timeout in a test file the delta changed is not run again` are rewritten to the new rule (re-run, then green holds with the confirmed-on-re-run detail) with a comment naming MOD-307 and #394; a case that gate=fail plus red is not re-run stays; one pure case covers the file pair.
- tests/node/gaterelay.node.mjs (new, required) covers: red then green holds with the confirmed-on-re-run detail; red then red refutes with the unchanged claim line and the new note line; gate=fail with a red first run is not re-run; exit 127 is not re-run; a first run that did not complete is not re-run.
- docs/contracts.md, where the MOD-20 re-run is described (lines 281 and 302 today), is updated to the new rule in two sentences.
- CHANGELOG.md gains one bullet under `## Unreleased` / `### Fixed` naming MOD-307 and #394.
- The validate, node and test gates are green.

## Review

Diff read in full. runGate keeps the MOD-20 timeout rerun first, then re-runs a red gate=pass run once more when the run is a worktree run and HEAD is still the sha; the second run is judged, green reads gate=pass confirmed on re-run with the first failure, red keeps the claim line and adds the note, the load line gets the re-run prefix, and the first run's output is written as verify-gate-n-first.txt beside the second's. Two out-of-scope test expectations (hooks4, gatespawn) pinned one gate run and follow from the card's rule; amend granted. Nit for the release touch: the CHANGELOG bullet is followed by a blank line inside the Fixed list. Verdict consistent at f24f7d4 after the grant.
