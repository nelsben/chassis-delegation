---
id: MOD-64
title: Wakes are off by default, so a verdict no longer starts a turn of its own; in the hand-back turn the brain waits for its verdict with a new verdict tool
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/dashboard.ts, hooks/lib/compaction.ts, hooks/lib/dispatch.ts, hooks/lib/verdicttool.ts, .claude-plugin/plugin.json, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/types/**, .chassis-delegation.json, docs/**, hooks/templates/**, bin/**, hooks/lib/verify.ts, hooks/lib/verify-native.ts, hooks/lib/allow.ts, hooks/lib/gitguard.ts]
red_test: the new engine test that a background worker's hand-back with default options submits no wake fails on main because the wake is submitted; red first
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

The person wants the bump message gone. That is the "The chassis-delegation plugin sent a message" turn that wakeBrain submits (MOD-15). In practice it mostly repeats something the brain already handled: a verdict it read in the hand-back turn, a task it already merged, or a question it already relayed. Each one starts a turn in the person's place. MOD-62 trimmed one case, but other sessions still get them.

The wake exists for one reason. A worker's hand-back starts the brain's turn before the verifier finishes, so a brain that ends that turn early sits idle on an unread verdict. The person once asked why the brain kept hanging waiting for the verdict row. The fix is to keep the waiting inside the hand-back turn: a tool the brain calls that returns the verdict once it lands.

## Done when

- `wakeOnVerdict` defaults to false. - In `.claude-plugin/plugin.json` its default is false, and its description says it is off by default and what on does. - `hooks/register.ts` treats it as on only when it is set to true. - With it on, the behaviour is unchanged. Every existing test that expects a submitted wake sets `wakeOnVerdict: true` in its options and still passes.
- A new tool, `verdict`, is registered beside dispatch and card and served by a `tool.call` hook. - **Input:** `{ task: string, subtask?: string, waitSeconds?: number }`. `waitSeconds` defaults to 600, with a maximum of 900. - **Already judged:** when the task's latest attempt has been judged, it returns at once. The text is the verdict row exactly as posted, with any `ready:` lines posted beside it. - **Still verifying:** it waits through `$` clock waits of about 5 seconds each, so the hook's own 10-second budget is not spent, and returns as soon as the verdict lands. - **Timed out:** it returns `<task>: still verifying after <n>s; call verdict again`. - **No such attempt:** for a task with no attempt it says so. - **The waiting reads the mod's own records** (the attempt record or the ledger), never a shell command.
- The brain is told to use the verdict tool. - With wakes off, the dispatch tool's text under the spawn block says: when this worker hands back, call the verdict tool with `task=<id>` in that turn, before ending it. - The "Delegation state" section, while any background worker is running or being verified, carries one posture line saying the same. - `hooks/lib/dashboard.ts`'s "the verdict lands on its own" wording names the verdict tool instead when wakes are off.
- With wakes off, nothing calls `$.prompt.submit`. Verdict rows, `ready:` lines and the debrief's post question are still appended as rows.
- Engine tests: - With default options, a background hand-back submits no wake and its row is appended. - The verdict tool returns an already-judged verdict at once. - Called while the verifier is still running (test clock), it returns the verdict when it lands. - It returns the still-verifying line on timeout. - It says so for an unknown task. - The dispatch text and the state posture line name the verdict tool when wakes are off, and do not when wakes are on.
- README.md: - The options table shows `wakeOnVerdict` with default `false`. - The "Waking the brain" text says wakes are off by default and why: they repeated rows the brain had already read, and each started a turn in the person's place. - It documents the verdict tool and the hand-back-turn rule. - Every other README line that says a verdict wakes the brain is made true for the new default.
- CHANGELOG.md: an entry under a new `## Unreleased` heading above `## 0.9.4 — 2026-10-11`.
- The three gates pass: validate, node and test.

## Review (attempt 2)

Attempt 1 met the card. Review found one defect in the verdict tool: an attempt whose row was posted before this change has `posted` set but no `postedRow`, because the store outlives a reload, so the tool waited out its whole 600 seconds and said "still verifying" for a verdict already in. Attempt 2 waits on a missing `postedRow` only within 30 seconds of the verdict (the race between the claim and the store write in one hook), with a test that timed out on attempt 1's head. Attempt 2's report named a placeholder sha and was refuted on it; the verifier was re-run on the real head (13b5557) with `dispatch verify` and found it consistent.
