---
id: MOD-54
title: The dispatch dry run warns when a card's scope names more than six files, and hints that the economy tier would do for a small standard card
domain: mod
tier: standard
status: merged
scope: [hooks/lib/dispatch.ts, hooks/lib/card.ts, hooks/register.ts, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/templates/**, bin/**, hooks/lib/verify-native.ts, hooks/lib/allow.ts]
red_test: the pure tests for the two new functions fail on main because the functions do not exist; red first
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Issue 108 findings 3 and 4: across 43 cards, cost tracked the number of files a card touched (2 to 3 files $0.20 to $0.64, 6 to 9 about $1.60, 13 and over $3 and a worker that hit the plan limit), and all 52 runs were Sonnet although several cards were a two-line fix with a test. Nothing at dispatch said either.

## Done when

- dispatch (dry run and real) prints ` warning: scope names N files (and M globs); cost tracks the files a card touches: split it` when the brief header's scope holds more than 6 literal entries (an entry with no glob character); glob entries are counted in the line but never trigger it; 6 is a named constant
- dispatch prints ` hint: tier economy would do: N files in scope, K done-when lines, a red test` when the card's tier is standard, its scope (leaving out entries under tests/ or test/) holds at most 2 entries none of which has a glob character, its Done when holds at most 3 statements, and its red_test is not none; the card tool's dry-run summary carries the same hint for a card written at standard
- both lines come from pure functions in hooks/lib/dispatch.ts or hooks/lib/card.ts with tests at and either side of each threshold; nothing is refused or changed on the card
- README (the card section) names both lines; a CHANGELOG entry under Unreleased; the three gates pass
