---
id: GH-107
title: A drained spawn that is refused keeps its place at the head of the queue, and the refusal reaches the brain as a row
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/scheduler.ts, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/lib/verify-native.ts, hooks/lib/gitguard.ts, hooks/lib/cost.ts]
red_test: engine tests in tests/hooks.test.ts: (a) maxWorkers=2, two live, two rows queued (A then B); one worker hands back; A starts, B stays queued at position 1; (b) the same, but A's drained spawn is refused by the spawn hook: A is still at the head of the queue afterwards, B has not started, and a session row (appendRow) names A and the refusal; red first
gate: validate,node,test
budget: 2-attempts
---
## Why

Public issue #16, seen on the pre-GH-101 build: at three hand-backs in a row the queue's head did not
start, the row behind it did, and the head vanished from the queue. The brain got no row, so the task sat
undispatched. On main today `drainQueue` still does `writeQueue(queue.slice(1))` BEFORE it spawns; when
the spawn is refused it only toasts (plus a row for work-present), so a refused head is lost. An
unattended brain never sees toasts.

## Done when

- `drainQueue` removes the head only after its spawn succeeds. On a refusal the row keeps its place
  (position 1) and its `at`, and the drain stops for this pass (no row behind it jumps ahead).
- Every drained-spawn refusal is posted as a session row through `appendRow`, not only a toast:
  `chassis-delegation: queued <task> not started: <reason>; it keeps its place (position 1)`.
- A refusal for budget (`budget exhausted`) or for a brief that cannot be read removes the row instead,
  with a row saying so, since retrying cannot succeed.
- Tests (a) and (b) above. README scheduler paragraph, CHANGELOG (GH-107, closes public #16).
- Save red output to `.delegation/GH-107/red-1.txt`, name it `red=`. The gate map runs the three gates.
