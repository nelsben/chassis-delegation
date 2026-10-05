---
id: GH-5
title: The dispatch tool's own starting token is not counted against it, and the 5D guard tests return { result }
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/scheduler.ts, tests/**, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, agents/**, hooks/lib/verify-native.ts]
red_test: a test in tests/scheduler.test.ts or tests/dispatchtool.test.ts with maxWorkers=2 and one worker live where the dispatch tool's spawn starts at once instead of being queued
gate: validate,node,test
budget: 2-attempts
---
## Why

Report GH-5. With `maxWorkers=2` and one
worker live, `mcp__chassis-delegation__dispatch FE-232` was refused as "queued … (2 running: BE-320,
FE-232)". The second "running" worker was FE-232's own `starting` token: the dispatch path claims a
slot, then the spawn hook runs `claimSlot` again and counts that token. The status-timer drain started
it a minute later, so concurrency was right and the line and the minute were wrong.

Also in this card: three tests in tests/hooks.test.ts (5D: the git guard on Bash: "on an agent branch
the commit passes through", "the words inside a heredoc body never trigger it", "gitGuard off") stub
Bash with `{ text: 'ran' }`; the 2.1.288 engine reports "returned neither { result } nor { deny }".
Change the stubs to `{ result: 'ran' }` (or whatever the engine's ToolCallResult wants) so the suite is
all green.

## Done when

- The spawn hook's claim excludes the token the current dispatch already holds (pass the token or
  label through; `token === undefined` is the existing branch in `decideSpawn`). With `maxWorkers=2`
  and one live worker, a dispatch spawns at once; with two live it still queues with a line that
  names only the real workers.
- The red test goes red then green. The 5D tests pass. validate, the node suite and
  `claude plugin test .` are fully green in your worktree.
- CHANGELOG.md gets an Unreleased entry naming GH-5.
