---
id: MOD-266
title: Session start gets faster: the slow steps of the session.start hook are measured, and the ones that dominate are cut or moved off the start path, with what a session sees after start unchanged
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/**, tests/**, CHANGELOG.md]
forbid: [.claude-plugin/**, hooks/templates/**, docs/**]
red_test: none
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

MOD-263 measured `$.session.start` at about 350 ms per test (world build 0 ms, test body 11-19 ms), so start is now nearly all of each test's fixed cost across about 2000 tests. The same hook runs at every real session start and reload. It registers 11 tools and 2 commands, loads templates, prunes the store, migrates task keys, sweeps merge-gates files and scans debriefs, and none of it has been timed step by step.

## Done when

- Measure first: in a scratch test (not committed), time each step of the session.start hook in the order it runs (each tool/command registration, `loadedTemplates`, the prune, `migrateTaskKeys`, the merge-gates sweep, the debrief scan, and anything else over 10 ms), and time the module load apart from the hook. Record the per-step ms in the report's metrics, from one run on a typical `world()`.
- Then change only the steps that dominate, by one of: (a) doing nothing when there is nothing to do (an early exit on a cheap check), (b) caching a value that is the same on every start of a process, (c) running work that nothing reads before the first turn after start on a `$.clock.after(0)` timer or at the first `turn.start`, fail-open. Each change is named in the report with its before and after ms.
- What a session sees after `await $.session.start(...)` is unchanged: the same tools and commands are registered before start resolves, the same templates are loaded, and the same store, file and ledger state is in place before the first turn. A step moved under (c) is one whose result nothing reads before the first turn, and the report says why for each.
- No existing assertion changes. A test may only gain a clock advance or a `turn.start` where it reads a moved step's effect, and the report lists each such test. No test is deleted, skipped or weakened, and the test count and `expect(` count do not go down (report both).
- The report gives the per-test session.start ms after the change, and the engine-suite wall time from two runs; a worse or equal result is reported as such, not hidden.
- CHANGELOG.md gets an `## Unreleased` entry under `### Changed`. Gates validate, node and test are green.
