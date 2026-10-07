---
id: GH-106
title: A per-attempt spend ceiling: the brief states it, the mod tracks each worker's own cost, warns once at the ceiling, and stops the worker at twice it
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/cost.ts, hooks/lib/brief.ts, hooks/lib/dispatch.ts, hooks/lib/repoconfig.ts, hooks/lib/verify.ts, hooks/lib/quiet.ts, hooks/lib/attempts.ts, hooks/templates/brief.md, hooks/types/**, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/types/**, .chassis-delegation.json, docs/**, hooks/lib/scheduler.ts, hooks/lib/gitguard.ts, hooks/lib/verify-native.ts]
red_test: engine tests in tests/hooks.test.ts: (a) a worker whose turn.complete usage crosses its brief's spend=2 gets exactly one session.send "wrap up and hand back now" message; (b) crossing 2x the ceiling aborts its running turn (or, if the engine gives no handle, posts the over-spend row) and the attempt records verdict over-spend; (c) the verdict row's usd is that worker's own cost from its usage, not the session delta; red first
gate: validate,node,test
budget: 2-attempts
---
## Why

Public issue #15. Fifteen standard cards cost $1 to $4.55 each on Sonnet 5.5; two cost $21.79 and $32.48
because the workers over-delivered (26 tests where the card asked for one red test; a full suite run
twice, a mutation check, a 3,361-row audit). Nothing told the worker or the mod what one attempt may
spend, and the brain saw the cost only in the verdict. Separately, the row's `usd` is the session's cost
growth during the attempt, so concurrent workers inflate it (a $2 card read $14.47 here on 2026-10-07).

## Done when

- **The ceiling.** A new brief header field `spend=<usd>`. Config key `spendByTier` (repo file and
  /config, an object tier → dollars; default `{economy: 2, standard: 6, frontier: 15}`; `0` means no
  ceiling). `/dispatch` writes `spend=` from the card's `spend:` field if present, else the tier default.
  The brief template's Rules gain one line: "Spend: about $<spend> for this attempt. Do what the card
  asks and no more; when you are near it, stop and hand back what you have with the report line."
- **Per-worker cost.** Wire `hooks/lib/cost.ts` (built, unwired): accumulate each worker's spend from its
  own `turn.complete` usage (`e.agentId`, `e.usage`, the resolved model's price; cache reads and writes as
  cost.ts already prices them). The verdict row's `usd` and the ledger's `usd` use that number when it
  exists, else today's session delta, marked `~` in the row when it is the delta.
- **The warning.** When a worker's own spend first crosses its brief's `spend=`, the mod sends it one
  message through `$.session.send` (the same path a resume uses, but it does NOT count as a resume or
  against the budget): `chassis-delegation: you have spent about $<n> of a $<spend> ceiling; wrap up now and
  hand back with the report line`. Once per attempt.
- **The stop.** At twice the ceiling: if the engine lets the mod end the worker's running turn
  (`$.turn.abort` with the turnId its `turn.start` carried, when `turn.start` fires for a subagent with
  its agentId; check the types in `.claude-plugin/types/claude-code/index.d.ts`), do that; record the
  attempt with verdict `over-spend` and post a row `<task> attempt n/b over-spend · $<n> of $<spend> ·
  next=check the worktree (work may be present: /dispatch <id> --verify <sha>)`. If the engine gives no
  handle, post the same row without stopping and say so in the README. `over-spend` never escalates the tier.
- **Visible mid-run.** The status line and the queued-refusal line show each live worker's running cost:
  `(2 live: BE-310 $3.10, BE-314 $1.20; …)`.
- README (the spend field, the config key, the over-spend verdict, the cost formula section) and
  CHANGELOG (GH-106, closes public #15). Save red output to `.delegation/GH-106/red-1.txt`, name it `red=`.
