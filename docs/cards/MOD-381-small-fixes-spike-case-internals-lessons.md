---
id: MOD-381
title: three small fixes: the card tool reads purpose in any letter case everywhere, the internals note on the brain stamp matches what rows carry, and the mod lessons gain the background-wait rule
domain: mod
tier: economy
tier_reason: Three exact edits with the text given; no design left
status: merged
issue: 525
scope: [hooks/lib/card.ts, docs/internals.md, docs/cards/lessons/mod.md, CHANGELOG.md, tests/node/spikecard.node.mjs, tests/*.test.ts, tests/node/*.node.mjs]
forbid: [bin/**, docs/cards/MOD-*, docs/mockups/**, hooks/register.ts, hooks/lib/spike.ts, hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, docs/upgrading.md]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/spikecard.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

Three leftovers from 0.9.62. `cardFromFields` lower-cases `purpose` for its checks, but two lines compare the raw input with `'spike'`, so `purpose: Spike` skips the scope add and the lanes refusal. The MOD-342 bullet in docs/internals.md says no spawn row has the brain stamp, and MOD-348 gave it one. Two workers in a row (MOD-375, MOD-377) waited on a background test run badly: one left wait loops that never end, one handed back before the run finished.

## Design (decided by the brain; build it, do not redesign it)

- `hooks/lib/card.ts`: the two places that read `input.purpose === 'spike'` (the findings scope add in `cardFromFields`, and `a spike is one card; drop lanes`) compare `text(input.purpose).toLowerCase() === 'spike'` instead. Nothing else in the file changes.
- `docs/internals.md`, the `MOD-342:` bullet: replace the words `and no other row kind (spawn, accept, amend, pause, review) has it` with `a spawn row has it too since MOD-348, and no other row kind (accept, amend, pause, review) does`. Nothing else in the file changes.
- `docs/cards/lessons/mod.md`: add this one line at the end, word for word: `- 2026-11-15 Run the test suite in the foreground and hand back only after it ends. Never wait on a background run with a pgrep -f loop: the loop matches its own command line and never exits (MOD-375), and a hand-back sent while the run is still going is judged no-report (MOD-377).`
- `CHANGELOG.md`, `## Unreleased` (make it above `## 0.9.62` when absent), `### Fixed`: one bullet `(MOD-381)` for the purpose case fix only.

## Tests

- `tests/node/spikecard.node.mjs` (the red test): add two cases. A card input with `purpose: 'Spike'` and a findings path outside its scope gets the findings path added first in scope. A lanes input with `purpose: 'SPIKE'` is refused with `a spike is one card; drop lanes`.

## Left to you

- Test names.

## Done when

- The two comparisons read purpose in any letter case, and the two new node cases pass.
- The internals bullet and the lessons line read as given, and nothing else in those files changes.
- Gate validate, node and test are green.

## Review

Brain review (Opus 5.5): Exact. The two comparisons now lower-case purpose, and the two node cases cover Spike and SPIKE. The internals bullet and the lesson line read as given, and the changelog bullet names the case fix only.
