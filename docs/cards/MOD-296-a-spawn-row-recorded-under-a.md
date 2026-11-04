---
id: MOD-296
title: A spawn row recorded under a suffixed task id closes once a later row for the plain task id is accepted or merged, so merged tasks no longer read as running
domain: mod
tier: standard
status: merged
issue: 398
scope: [hooks/register.ts, hooks/lib/rows.ts, hooks/lib/status.ts, hooks/lib/attempts.ts, hooks/lib/taskkeys.ts, hooks/lib/live.ts, hooks/lib/band.tsx, tests/node/suffixrows.node.mjs, tests/suffixrows.test.ts, tests/harness.ts, CHANGELOG.md]
forbid: [hooks/lib/allow.ts, hooks/lib/ghguard.ts, hooks/lib/scheduler.ts, hooks/lib/configeff.ts, docs/cards/**]
red_test: node --test tests/node/suffixrows.node.mjs (fails now: the file does not exist; passes when a suffixed open row with a later plain accept reads closed)
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

The ledger listed four tasks twice: one row with an agent-id suffix (`TASK-20 a0cd00b3...`, 0 attempts, open) from the mod's own record of the spawn, and the accepted row under the plain id written later. The open rows never close, so the ledger and the band read as if four merged tasks were still running (#398).

## Done when

- Find where a spawn or hand-back is recorded under `<task> <suffix>` (the owed-row match in hooks/register.ts uses r.task.startsWith(`${l} `); the ad hoc path records under a suffixed id) and write the rule in one pure helper: a suffixed row whose plain id has a later accept or merged row (or a consistent/reviewed verdict row) is read as closed, with reason `superseded by <plain id> attempt <n>`; the ledger table, the band's running count and the status view all use it
- When the brief header names the task id, the spawn row is recorded under the plain id in the first place, so no suffixed row is written for a briefed worker; a cardless or ad hoc spawn still gets the suffix
- The helper lives in hooks/lib/rows.ts or hooks/lib/status.ts and is tested in a new tests/node/suffixrows.node.mjs: a suffixed open row with a later plain accept reads closed; without one it stays open; a briefed spawn is keyed by the plain id
- An engine test in tests/ covers the wiring once; every engine test imports test from tests/harness.ts; the CHANGELOG gains one line under Unreleased / Fixed
- hooks/lib/allow.ts, hooks/lib/ghguard.ts and hooks/lib/scheduler.ts are untouched; the validate, node and test gates are green

## Review

Brain review: plainTaskOf splits a suffixed id at its first space; supersededRows scans newest-first and maps each suffixed row to "superseded by <plain> attempt <n>" when a later accept, merged, consistent or reviewed row for the plain id exists; worktreeRows shows that reason as the row state (a live worker still wins, so a running suffixed spawn is not hidden); liveState skips a running or pending suffixed spawn that a later ledger row closed, so the band's count drops. Caveat the worker raised and I confirmed: no code path in 0.9.49 writes a space-suffixed id (ad hoc spawns use adhoc-<8>, briefed spawns use the header's plain task), so this closes the read side of #398 for ledgers already carrying such rows; if the adopter's 0.9.44 writer still exists somewhere, #398 may need a follow-up on the write side. Explored on haiku/medium from sonnet; first attempt, $0.07.
