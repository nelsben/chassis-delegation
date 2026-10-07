---
id: GH-2
title: A report delivered only through the hand-back tool is verified, never read as no-report
domain: mod
tier: frontier
status: merged
scope: [hooks/**, tests/**, types/**, templates/**, CHANGELOG.md, README.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, agents/**, eval/**, scripts/**]
red_test: an engine test in tests/hooks.test.ts where a BACKGROUND briefed worker's turn.complete answer holds no [[report]] but its hand-back carries one; today it is judged no-report
gate: validate,node,test
budget: 3-attempts
---
## Why

Report GH-2. Live on 2026-10-04,
frontend workers FE-231 and FE-232 (three times) delivered their `[[report …]]` only through the
SubagentHandback tool and left their final answer short. Every hand-back read as `no-report`, the
ladder resumed, respawned at frontier, and stopped with the budget exhausted while the work was done.

## What is known

- `hooks/register.ts` has a `handbacks` map filled by an `on('tool.call')` hook that watches for
  `e.tool === 'SubagentHandback'`. That tool is NOT in `.claude-plugin/types/claude-code-tools/index.d.ts`
  (the engine lays that folder when it loads the mod or runs `claude plugin test`), so the hook most
  likely never fires live. Confirm from the API types in `.claude-plugin/types/claude-code/index.d.ts`:
  grep `handbackReport`, `handback`, `TurnCompleteInput`, `AgentSpawnResult`.
- The foreground path (the `tool.call {tool: Agent}` hook) already reads `result.handbackReport.text`.
- The background path (`on('turn.complete')` with `e.agentId`) reads only `e.answer` plus the map.
- `tests/background.test.ts` has a test that feeds the hand-back through a fake SubagentHandback tool
  call; it passes in the harness and says nothing about the live engine.

## Done when

- Find where the engine actually exposes a background subagent's hand-back report (the turn.complete
  input, an agent.* event, `$.agent.list`, or the Agent result on a later poll) and read it there.
  Last report wins across answer text and hand-back. If the engine exposes nothing for a background
  worker, say so in the report and make the brief template tell the worker to put the report line in
  its final answer text as well as the hand-back (templates/brief.md), with a test on the template.
- The new red test in tests/hooks.test.ts goes red before the fix and green after.
- CHANGELOG.md gets an Unreleased entry naming GH-2.
- `claude plugin validate .`, the node suite, and `claude plugin test .` are green in your worktree
  (the three 5D git-guard tests that fail on `{ text }` vs `{ result }` are GH-5's job; leave them).
