---
id: MOD-62
title: A wake held during the brain's open turn is not sent at the turn's end when a later step of that turn already carried its row, so the brain is not woken to repeat what it just read
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/templates/**, bin/**, hooks/lib/verify.ts, hooks/lib/verify-native.ts, hooks/lib/allow.ts, hooks/lib/gitguard.ts]
red_test: the new engine test in tests/wakes.test.ts where a held consistent wake is followed by a main-loop turn.step before the turn ends fails on main because the wake is submitted; red first
gate: validate, node, test
budget: 2-attempts
spend: 8
---
## Why

Every wake comes after a row. The row is appended to the conversation (listed at once), and then the same text is submitted as a plugin message. While the brain's turn is open, MOD-42 holds the submit until the turn's end. If the turn makes another model step after the row lands, the brain has already read it and usually acted on it. The held wake then starts a second turn whose only content is the same row. In a dogfood session, the debrief's post question was appended, and the brain relayed it to the person in that turn. Four seconds after the turn ended, the held wake started a new turn that repeated the question. Other sessions get the same spam from verdict rows they already handled.

Why the wake exists, and why this card keeps it for some cases: MOD-15 wakes the brain because an idle brain never reads a row. MOD-42 holds the submit, rather than dropping it, because the engine delivers a mid-turn submit only after the turn ends. Neither card needs the wake when a later step of the same turn carried the row. A row that lands during the turn's last step was never read, and it must still wake the brain.

## Done when

- hooks/register.ts: each held wake entry records whether a main-loop model step began after it was held. A main-loop step is a turn.step with no agentId. A subagent's step (agentId set) never counts.
- At the end of the turn, flushWakes drops every held entry that a later main-loop step carried. That covers its verdict text, its ready lines (they were appended in the same row) and a wake with no spawn, such as the debrief's post question. Each drop writes a debug line, `wake skipped: <task label, or 'row'> read in the turn`. A dropped entry's row stays in the conversation and the ledger, as today.
- A held entry with no main-loop step after it is submitted at the turn's end exactly as today, after MOD-51, MOD-57 and MOD-60's checks. Example: the row landed during the turn's last step and the turn ended. A wake submitted while no turn is open is unchanged.
- Engine tests in tests/wakes.test.ts: (1) A consistent verdict is held, then a main-loop turn.step, then the turn ends: nothing is submitted, the skip is logged and the row was appended. (2) A verdict is held and the turn ends with no step after it: it is submitted. (3) A verdict is held and only a subagent's turn.step follows: it is submitted. (4) Two verdicts: one held before a main-loop step, one after the turn's last step. Only the second is submitted. (5) A ready line held with its verdict, then a main-loop step: neither is submitted.
- An engine test beside the MOD-31 ask-mode tests in tests/hooks.test.ts: the debrief's post question lands while the brain's turn is open and a main-loop step follows, so no wake is submitted and the question row was appended. The same question with no later step is submitted.
- README.md: the paragraph on held wakes says a held wake is not sent when a later step of the brain's turn already read its row, and names the case that still wakes (the row landed in the turn's last step).
- CHANGELOG.md: an entry under a new `## Unreleased` heading above `## 0.9.3 — 2026-10-11`. If another card has already added that heading on main by the time you rebase, put the entry under it.
- The three gates pass: validate, node and test.

## Review (attempt 2)

Attempt 1's rule and tests (1), (2), (3) and (5) were right. Its test (4) passed on main as well: the second verdict was attempt 2 of the same task, so MOD-51's supersede check dropped the first wake whether or not it was read. Attempt 2 gives the second verdict its own task (T-5), and on main's register.ts the test fails with both lines submitted. The README paragraph was rewrapped with no word changes.
