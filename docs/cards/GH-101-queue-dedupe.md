---
id: GH-101
title: The queue never holds a phantom: entries dedupe by task, a refused dispatch releases its token, a by-hand spawn of a queued task takes its place, and the refusal line says what is live and what is queued
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/scheduler.ts, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/lib/verify-native.ts, hooks/lib/gitguard.ts]
red_test: engine tests in tests/hooks.test.ts: (a) with maxWorkers=2, two live workers, a dispatch of T-9 queued, then both workers hand back: T-9 is spawned from the queue before the turn ends, with a toast naming it; (b) a second dispatch of T-9 while it is queued answers "already queued since <time>" and spawns nothing, and the queue still holds ONE entry; (c) an inline-header Agent spawn of a task that is queued consumes the queue entry and spawns (no refusal); (d) the queued refusal line reads "(1 live: BE-310; 1 queued: BE-314)"; red first
gate: validate,node,test
budget: 2-attempts
---
## Why

Public issues #4 and #7, from the first adopter on the 0.2.0 copy. With two workers live a dispatch was
queued; both workers finished and the queued spawn never started. A second dispatch of the same task was
refused as "2 running: FE-237, FE-237": the stale queue entry and the new dispatch's own starting token
both counted, so the task blocked itself with nothing running. A by-hand Agent spawn with an inline
header for a queued task was refused the same way, so the brain had no way past the gate but a restart.
GH-5 already stops a dispatch counting its own token; the rest is still open on main.

## Done when

- **Dedupe.** `enqueue` in hooks/lib/scheduler.ts refuses a second entry for the same task and subtask;
  the dispatch tool and `/dispatch` then print `already queued since <HH:MM> (position <n>)` and spawn
  nothing. A refused dispatch (queued or denied) releases its own `starting` token before it returns.
- **Drain everywhere.** `drainQueue` runs after every hand-back (it does today), after every dispatch
  call that did not spawn, and at the start of every dispatch call. One toast per queued task started:
  `started queued <task> (waited <m> min)`.
- **A by-hand spawn takes the queued place.** In the spawn hook, when the header's task and subtask
  match a queue entry, the entry is removed and the spawn proceeds against the real live count.
- **The refusal explains itself.** The queued line names live agents and queued rows separately:
  `<task> starts when a worker slot frees (1 live: BE-310; 1 queued: BE-314)`. `queuedDeny` in
  scheduler.ts changes shape; update its tests and the README line that quotes it.
- **Live count = live agents.** `claimSlot` counts `$.agent.list()` running workers plus starting tokens
  of OTHER tasks, never queue rows.
- README (scheduler paragraph) and CHANGELOG (GH-101, closes public #4 and #7). Save red output to
  `.delegation/GH-101/red-1.txt`, name it `red=`. The gate map runs the three gates with {worktree}.
