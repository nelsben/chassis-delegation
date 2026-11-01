---
id: MOD-255
title: Bug: an owed review row clears from the band once a review accepts the attempt
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/rows.ts, hooks/lib/band.tsx, hooks/lib/mergecmd.ts, tests/rows.test.ts, tests/landnudge-band.test.ts, tests/harness.ts, tests/node/**]
forbid: []
red_test: tests/landnudge-band.test.ts or tests/rows.test.ts: after an accepting review row the band shows no owed review for the task (fails today)
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Since MOD-231, a newest review row with next=accept resolves the task to its consistent row and merge accepts it, but the band above the prompt keeps showing the review as owed for that task until something else redraws it away. The band must use the same resolution merge and the verdict tool use.

## Done when

- The band's owed-row logic resolves a task's rows through the same function merge uses (resolveRows / reviewAcceptedAttempt in hooks/lib/mergecmd.ts), so a task whose newest review row says next=accept is not shown as owing a review.
- A review that refutes still leaves the task showing its next step as today.
- An engine test: a consistent next=review verdict followed by an accepting review row leaves no owed-review row in the AbovePrompt render; a refuting review keeps one.
- Gates validate, node and test are green.
