---
id: MOD-284
title: land_plan and tree_import refuse a child whose type does not rank below its parent's: epic, feature, story, then task, bug or spike
domain: mod
tier: standard
status: merged
scope: [hooks/lib/landtree.ts, hooks/lib/land.ts, tests/node/landtree.node.mjs, tests/node/land.node.mjs, docs/guide.md, docs/contracts.md, CHANGELOG.md]
forbid: [hooks/register.ts, hooks/lib/version.ts, .claude-plugin/plugin.json, docs/cards/**]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs (tests/node/landtree.node.mjs) — the new 'a feature under a story is refused' case fails on main (the plan is accepted) and passes after
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Two adopter repos filed their trees in opposite orders (epic above feature in one, feature above epic in the other) and nothing in the mod said so, because filing checks paths and counts but never the order of types. One order, enforced at filing time, is what the next repos need before their backlogs are imported. Existing trees are untouched: the check runs only when a tree is filed.

## Done when

- A pure helper in hooks/lib/landtree.ts gives each type a rank: epic 0, feature 1, story 2, task, bug and spike 3; a child is in order when its rank is greater than its parent's. Feature is optional between epic and story; a task, bug or spike may hang straight under any of the three.
- tree_import (hooks/lib/landtree.ts parsePlan, or the function that checks items) adds one error per out-of-order child, in the existing item-path form, e.g. `items[1].children[0]: a feature cannot hang under a story (order: epic, feature, story, then task, bug or spike)`; a child with the same rank as its parent is an error too (a story under a story). Nothing is filed when any error is present, as today. The file's top-level `parent` is not checked (its type is not known locally).
- land_plan (hooks/lib/land.ts parsePlan) applies the same rule between the top item (its `type`, feature by default, or epic) and each task (story, task, bug or spike), and between nested children when the tasks array carries children; the error names the item the same way land_plan names other item errors. The top item under an existing `parent` number is not checked.
- docs/guide.md: the vocabulary table in the planning section is rewritten in the order epic, feature (optional), story (optional), task / bug / spike, and one sentence after it says the order is enforced when a tree is filed and never on an existing tree; docs/contracts.md gets the same order where it lists the levels, if it does.
- tests/node/landtree.node.mjs and tests/node/land.node.mjs gain cases: a plan with a feature under a story is refused naming the item; a story under a story is refused; epic > feature > story > task, epic > task and feature > bug are accepted. No engine test is needed.
- CHANGELOG.md Unreleased gains one line for this change. No other file changes.

## Review

Brain review: orderError ranks epic 0, feature 1, story 2, task/bug/spike 3 and refuses equal or higher rank; parseTreePlan passes the parent type down the walk; land_plan checks each task against the top item (its schema has no nested children, so only the accepted cases are testable there). MOD-215's engine fixture reordered under an approved amend. Explored on haiku/medium, first attempt, $0.05.
