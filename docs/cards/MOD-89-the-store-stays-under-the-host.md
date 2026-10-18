---
id: MOD-89
title: The store stays under the host's 4 MiB cap: closed records older than 7 days are pruned, spawn records drop the prompt text, and a refused store write is said out loud
domain: mod
tier: frontier
status: merged
scope: [hooks/register.ts, hooks/lib/retention.ts, tests/retention.test.ts, tests/hooks.test.ts, docs/internals.md, CHANGELOG.md]
forbid: [docs/cards/**, hooks/lib/allow.ts, hooks/lib/version.ts, .claude-plugin/**, hooks/templates/**, bin/**, .chassis-delegation.json, README.md, docs/upgrading.md]
red_test: write tests/retention.test.ts first (it imports hooks/lib/retention.ts, which does not exist yet) and run `claude plugin test {worktree}`: the suite fails on the missing module; save that run as the red evidence; red first
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Issue #157: for five hours every new worker went unrecorded, so the verdict tool said "no attempt recorded" and no verifier ran. The cause is the host's store cap: `$.store.set` rejects once the plugin's store passes 4 MiB of JSON text in all (see the `store.set` doc in .claude-plugin/types/claude-code/index.d.ts). The mod never deletes a record, so the one store shared by every repo and session grew to 5748 keys and 3.999 MiB compact. From then on, a set that grows the store is refused while a get still reads, and storeSet swallows the refusal into a debug line. By key family: delegation.spawn 2.7 MiB in 1102 records (each keeps the full prompt, about 1.4 KB), delegation.tasks 0.5 MiB, delegation.cost 0.17 MiB, delegation.recent 0.15 MiB, delegation.handoff 76 KiB, delegation.postedRow 75 KiB, delegation.adhoc 70 KiB in one key, delegation.agent 55 KiB. 875 spawn records are older than 3 days and 424 older than 7. #159 (maxWorkers not enforced) is the same fault: liveState counts a worker only when its spawn record can be read.

## Done when

- A pure module hooks/lib/retention.ts decides what to delete: given the store's keys and values, the open task labels (running worker, pending verdict, queued spawn) and now, it returns the keys to delete, oldest first. A per-task record (delegation.spawn, delegation.agent, delegation.agentName, delegation.cost, delegation.tasks, delegation.handoff, delegation.classifier, delegation.effort, delegation.posted, delegation.postedRow, delegation.outside, and any other per-task or per-agent family the worker finds) is deleted when its newest timestamp is more than 7 days old and its task is not open. A record of an open task is never deleted, whatever its age. Records with no timestamp are left alone. Session-level keys (delegation.debrief, delegation.friction, delegation.brain, delegation.recent and the like) are kept to their newest entries (bounded lists), not deleted.
- When the store's compact JSON text (the sum over its keys, measured as the host would) is over 3.5 MiB, the plan also deletes closed records younger than 7 days, oldest first, until the store is under 3 MiB. Open tasks are still never touched.
- The mod runs the plan at session.start and after each verdict, through `$.store.delete` only. When it deletes anything it writes one debug line and, at session.start only, one session row: `store: pruned <n> records (<x> MiB to <y> MiB of 4 MiB)`. It never reads or writes the store file directly.
- A new spawn record no longer keeps the full prompt text when nothing reads it back; it keeps what is read later (the brief path, the prompt key, the description). The worker checks every reader of SpawnRecord before dropping a field, and says in the report which fields were dropped.
- A refused `$.store.set` is said out loud: the first refusal in a session makes a toast and a session row `store write failed: <key> (<reason>); new workers may have no verdict until the store is pruned`, and later ones only count. `/delegation` shows `store: <x> MiB of 4 MiB` always, and `store: <n> writes refused this session (last <key>)` when any were.
- No new option. docs/internals.md's Store and ledger section says the cap, the 7-day retention, the 3.5/3 MiB rule and the two lines. CHANGELOG.md gets one entry under a new `## Unreleased` heading at the top, naming #157 and #159.
- tests/retention.test.ts covers the plan as pure cases (old closed deleted, old open kept, fresh kept, no-timestamp kept, the over-3.5 MiB rule, oldest first). tests/hooks.test.ts gets engine cases for the prune at session.start against a mock store, and for a rejected set producing the row once. The three gates pass.

## Review

Attempt 1 (opus) accepted by hand. The store was at the host's cap when the worker started, so its spawn record was refused and the verdict tool had no attempt to judge (the fault this card fixes). Verified by hand at 77ebdc8: red is the engine run before any source change, failing on the missing hooks/lib/retention module; validate passed; node 904/0; the engine suite 1378/9, all 15 MOD-89 tests green, and the 9 failures are 5 s timeouts in files the change does not touch, under a load average near 30 where passing neighbours took 3.5 to 4.9 s each; the diff is inside scope. Read the plan end to end: it deletes only through $.store.delete; per-task records go after 7 days closed, and over 3.5 MiB closed records go oldest first down to 3 MiB; open tasks, and any task with a pending attempt younger than 7 days (a worker of another session), are never touched; session-level keys are never deleted. Spawn records drop only prompt, which nothing read back. One addition beyond the card (the pending-attempt guard) is accepted.
