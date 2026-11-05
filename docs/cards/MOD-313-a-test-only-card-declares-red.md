---
id: MOD-313
title: A test-only card declares red_test none (test-only), and the verifier refuses a change outside the test folders under it
domain: mod
tier: standard
status: merged
issue: 427
scope: [hooks/lib/verify-native.ts, hooks/lib/card.ts, tests/node/testonly.node.mjs, tests/verifynative.test.ts, tests/card.test.ts, tests/harness.ts, docs/contracts.md, CHANGELOG.md]
forbid: [hooks/register.ts, hooks/lib/allow.ts, hooks/lib/scheduler.ts, hooks/lib/dispatch.ts, hooks/templates/**, docs/cards/**]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/testonly.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

A card whose only change is new tests for behaviour that already holds cannot show a failing run before the change, and the adopter's worker could not satisfy the red step. The verifier already treats a red_test starting with `none` as wanting no red, but nothing documents `none (test-only)` or guards it: a worker could change source under it with no red proof.

## Done when

- hooks/lib/verify-native.ts: when the brief's red_test matches /^none \(test-only\)/i a `red` claim is made: held with detail `red_test none (test-only): the delta is tests and docs only (<n> paths)` when every delta path is a test path (under a folder named test, tests, __tests__ or spec, or ending in .test.<ext>, .spec.<ext>, _test.<ext> or .node.mjs) or a doc path (CHANGELOG.md, README.md, or under docs/); failed with detail `red_test none (test-only) but the delta changes <paths, at most 5>` otherwise; unchecked with the existing could-not-establish reason when the delta is unknown; a plain `none` or `none (docs only)` is unchanged (no claim, as tests/verifynative.test.ts line 288 asserts).
- hooks/lib/card.ts: the redTest description (line 83) and the empty-red_test refusal (line 235) both gain `, or "none (test-only)" for a change that is only tests`.
- tests/node/testonly.node.mjs (new; verify-native.ts is importable from node, see tests/node/verify-native.git.node.mjs) covers: tests-only delta held; tests plus CHANGELOG held; a source path refuted with the paths named; `none (docs only)` makes no claim. tests/verifynative.test.ts gains one engine case through verifyNative for the refuted path; tests/card.test.ts asserts CARD_TOOL's redTest description names `none (test-only)`.
- docs/contracts.md: the red_test row (line 35 today) and the red claim row (line 282) each gain a sentence on `none (test-only)` and the guard.
- CHANGELOG.md gains an `### Added` heading above `### Fixed` under `## Unreleased` (if absent) with one bullet naming MOD-313.
- The validate, node and test gates are green.

## Review

Diff read in full: testOnlyRed pure in verify-native.ts with held/failed/unchecked as the card asks, wired before the briefWantsRed branch with the delta minus .delegation and foreign-git paths; card.ts texts; node and engine cases; contracts.md rows; CHANGELOG Added. Nit carried: the contracts.md red_test row runs the new sentence straight on after "inside forbid" without a separator. Verdict consistent at 1bb6d4c.
