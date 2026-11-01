---
id: MOD-261
title: "Bug: a sibling's write during a repo=here worker's Bash command is charged to that worker"
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/norepo.ts, tests/norepo.test.ts, tests/harness.ts, tests/node/**, CHANGELOG.md]
forbid: []
red_test: "tests/norepo.test.ts: two recorded repo=here workers on one checkout; while worker A's non-read-only Bash command runs, worker B writes out-of-scope-for-A y.txt; A is not refuted on scope for y.txt (fails today: MOD-256's delta charges y.txt to A)"
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

MOD-256 snapshots a repo=here checkout (and outside roots) before and after a recorded worker's non-read-only Bash command, and adds every path that appeared or changed to that worker's write log. When two workers share one checkout and run at once, a path a sibling writes during A's command (an Edit, or B's own Bash) lands in A's delta and can refute A on scope though A never touched it. Cards run serially today, so it has not fired; parallel repo=here workers would hit it.

## Done when

- A delta path is charged to the worker whose command produced the delta only when no other recorded worker on the same checkout or outside root wrote during that command's window: a sibling's logged write (Edit/Write/NotebookEdit path, or its own Bash delta) whose time falls inside A's before/after snapshot window is not charged to A.
- A path in A's delta that a sibling also logged in that window is charged to the sibling only (it is already in the sibling's log); a path in A's delta during an overlapping sibling Bash command whose owner cannot be told is charged to neither and is listed in the verdict as "changed while <A> and <B> both ran", not as a scope refutation.
- With no sibling running, MOD-256's behaviour is unchanged: its three engine tests in tests/norepo.test.ts still pass untouched.
- Worktree cards and read-only Bash still take no snapshot (no extra git calls).
- The red test above, plus a test that a sibling's Edit during A's command is charged to B and not A.
- CHANGELOG.md gets an Unreleased line. Gates validate, node and test are green.
