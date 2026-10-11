---
id: MOD-35
title: A verdict wake is skipped when the task is already merged, an accept is recorded on the ledger when the brain merges or accepts a task, and each verdict row is written once
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/attempts.ts, hooks/lib/scheduler.ts, hooks/lib/compaction.ts, hooks/lib/gitguard.ts, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/templates/**, hooks/lib/allow.ts, hooks/lib/verify-native.ts, hooks/lib/brain.ts, hooks/lib/version.ts, hooks/lib/legacy.ts, hooks/lib/redact.ts, bin/**]
red_test: engine tests in tests/hooks.test.ts: a consistent hand-back whose sha the harness reports as an ancestor of origin/main submits no wake and logs the skip, while one not yet merged submits it as today; /delegation accept T-1 appends one accept row with how accepted, and a second accept appends none; a hand-back delivered twice (tool result and notification) leaves exactly one verdict row on the ledger; the brain's `gh pr merge agent/mod/T-1 --rebase` seen by the guard appends an accept row with how merged; red first
gate: validate, node, test
budget: 2-attempts
spend: 8
---
## Why

Public issue #84 (the first adopter, 0.7.0), seen in this repo too: a background worker's verdict reaches the brain in its hand-back, the brain merges in that turn, and then MOD-15's wake submits the same verdict as a new turn with a stale next=accept for a task already on main; every background card costs one empty turn and the person asked whether the mod had alerted on something false. The adopter's ledger also holds every verdict row twice with identical fields, and nothing on the ledger ever says a task was accepted or merged, so neither the wake nor the debrief nor the tier picker can see a closed outcome. MOD-4 already knows how to tell a merged task (its sha an ancestor of origin/main, or its card reading merged); the wake and the ledger should use it.

## Done when

- before submitting a verdict wake, the mod runs MOD-4's merged check for the task (last attempt sha an ancestor of the base ref, or the card on the base ref reading status: merged, or an accepted row already on the ledger since the verdict); when it is merged the wake is not sent and the debug log says `wake skipped: <id> already merged`; a wake for a refuted, over-spend or ready: row is never skipped by this rule
- an accepted row is appended to the ledger (kind accept, task, attempt, sha, at, how: merged | accepted) when MOD-4's retire check finds the task merged, when /delegation accept <id> runs, and when the git guard's tool.call hook sees the brain run `gh pr merge` naming the task's PR or branch or `git merge agent/<domain>/<id>`; one accept row per task attempt, never two
- every verdict row is written to the ledger exactly once: find why the adopter saw each row twice (the hand-back hook and the task notification both posting, or the wake path re-appending) and close it with a per-attempt write guard keyed on (task, attempt, sha, verdict); an engine test replays a hand-back that arrives both as a tool result and as a notification and counts one row
- README (Waking the brain: the skip rule; the ledger: the accept row and its fields) and CHANGELOG
