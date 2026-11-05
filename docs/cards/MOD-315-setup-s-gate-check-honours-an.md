---
id: MOD-315
title: setup's gate check honours an existing gateMap when the repo has no package.json test script
domain: mod
tier: standard
status: merged
issue: 429
scope: [hooks/lib/setup.ts, hooks/register.ts, tests/node/setupgate.node.mjs, tests/setup.test.ts, tests/harness.ts, CHANGELOG.md]
forbid: [hooks/lib/allow.ts, hooks/lib/scheduler.ts, hooks/lib/card.ts, hooks/lib/verify-native.ts, hooks/templates/**, docs/cards/**]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/setupgate.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

On this very repo `/delegation setup` reports `✗ a gate: no test command found` although .chassis-delegation.json names three gates, because detectGate in hooks/lib/setup.ts reads only package.json, pyproject, Cargo.toml and go.mod. The check misleads every adopter whose gates live in the config.

## Done when

- gatherSetup (hooks/register.ts) reads the repo's gateMap the way loadTarget does (parseRepoConfig then mergeConfig, so /config overrides apply and refused gates do not count) and passes it on the probe as `gateMap?: Record<string,string>`; loadTarget and detectGateIn are unchanged.
- setupChecks (hooks/lib/setup.ts): when the probe carries a gateMap with at least one entry the gate check holds and reads `a gate: <first gate id>: <command>` plus ` (+<n> more)` when more than one; detectGate still runs and still feeds the tools-on-PATH check (gate?.stack) as today; the no-gate fix text is unchanged.
- With a gateMap on the probe, phase 2 of setup neither prints `setup would have set "gateMap"…` nor writes gateMap into the config (wouldSet and configLines omit it), and handoverText names the gateMap's first command; the init-plan writes of phase 2 run as they do for any repo that reaches it (they never overwrite).
- tests/node/setupgate.node.mjs (new; setup.ts is importable from node, see tests/node/setuptree.node.mjs) covers: a probe with gateMap {validate, node, test} and no package.json holds the gate check with `a gate: validate: … (+2 more)`; a probe with neither still fails with `a gate: no test command found`. tests/setup.test.ts gains one engine case for phase 2 with a gateMap (no gateMap line in wouldSet); tests/setup.test.ts line 93 and tests/hooks2.test.ts's empty-folder case keep passing.
- CHANGELOG.md gains one bullet under `## Unreleased` / `### Fixed` naming MOD-315.
- The validate, node and test gates are green.

## Review

Diff read in full. gateMapFirst and the gate check in setup.ts; Found.gate optional so scaffoldConfig, wouldSet and configLines drop the gateMap entry on a gateMap repo; setupGateMap in register.ts reads the repo config as loadTarget does; handoverText appends the first mapped command. The hooks2.test.ts GH-109 expectation change follows from the card's phase-2 clause; amend granted. Verdict consistent at ec17bf1 after the grant.
