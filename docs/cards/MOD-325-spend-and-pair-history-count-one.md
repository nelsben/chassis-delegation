---
id: MOD-325
title: Spend and pair history count one verdict row per attempt: a re-verify of the same attempt does not double its usd
domain: mod
tier: standard
status: merged
issue: 456
parent: 425
scope: [hooks/lib/choice.ts, tests/node/lastperattempt.node.mjs]
forbid: [hooks/lib/verdicttool.ts, hooks/register.ts, tests/node/predates.node.mjs]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/lastperattempt.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

A refuted verdict followed by a consistent re-verify of the same attempt leaves two ledger rows of the same kind, task, subtask and attempt, each carrying the attempt's usd, and cardOutcomes sums both, so pairHistory and the adaptive suggestion over-count spend. One repo has 24 such pairs, this one 28.

## Done when

- hooks/lib/choice.ts exports `lastPerAttempt(rows)`: given a card's rows, it returns them with every earlier row dropped that shares kind, subtask (absent reads 'main') and attempt with a later row; rows without a numeric attempt are kept as they are; order of the kept rows is the order of their last appearance.
- `cardOutcomes` uses `lastPerAttempt` for its `usdRows` only (the usd sum): a card whose attempt 1 has a refuted kind:spawn row with usd 1.46 and a later consistent kind:spawn row with usd 1.46 sums to 1.46, not 2.92. `confirmed` and the brief-defect rule are unchanged (they still read every verdict row).
- tests/node/lastperattempt.node.mjs is the red test: it imports from ../../hooks/lib/choice.ts and checks the 1.46 case above through `cardOutcomes`, a card with attempts 1 and 2 each once (both summed), a review row and a spawn row on the same attempt (both kept: different kinds), and a subtask 'a' row next to a subtask 'main' row on the same attempt (both kept). Model it on tests/node/choice.node.mjs.
- The existing choice, adaptive and explore node tests stay green; any of their expectations that summed a duplicated attempt is not changed unless it fails, and then only that number.
- The validate, node and test gates are green.

## Review

Brain review: diff read. lastPerAttempt keys on kind, subtask and attempt and keeps the last row; cardOutcomes applies it to the usd rows only. The one changed choice.node.mjs expectation (3 to 2) is the duplicated-attempt case the card allowed changing; scope amend granted. Explore run on haiku/medium, consistent on attempt 1.
