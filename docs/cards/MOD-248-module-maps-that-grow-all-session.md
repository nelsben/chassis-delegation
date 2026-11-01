---
id: MOD-248
title: Module maps that grow all session are bounded, the per-worker write log is smaller, and the gate-output cap check has a fast path
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/cut.ts, tests/hooks.test.ts, tests/cut.test.ts, tests/harness.ts, tests/node/**, CHANGELOG.md]
forbid: []
red_test: tests/hooks.test.ts: after 10x the cap of distinct task ids pass through handedBackPosted, taskRepos, offered, glyphLogged, handbacks and gateTails, each map's size is at most its cap (fails today: unbounded)
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Several module-level maps in hooks/register.ts grow for the life of the session: handedBackPosted, taskRepos, offered, glyphLogged and handbacks have no bound (messaged is reset per turn near 2355-2356 and remembered is capped at 500; those stay as they are). On a session that runs for days with hundreds of tasks they hold stale entries. Separately, cutToBytes walks the whole text even when it is already under the limit, and fullOut is kept for every gate run when it is only written when an outDir is set.

## Done when

- Each of the six unbounded maps gains a bound, documented beside it: handedBackPosted 200, taskRepos 200, offered 200, glyphLogged 500, handbacks 200, gateTails 200 (added by MOD-253, one entry per task label); on overflow the oldest-inserted entry is dropped (Map insertion order).
- cutToBytes returns the input unchanged when its byte length is already under the limit, measured once, before any walk.
- fullOut is kept only when an outDir is set; otherwise only the tail the verdict needs is kept.
- The write log (WRITE_LOG_CAP) is left as it is: lowering it would make a worker's own later writes read as foreign.
- CHANGELOG.md gets an Unreleased line.
- Gates validate, node and test are green.
