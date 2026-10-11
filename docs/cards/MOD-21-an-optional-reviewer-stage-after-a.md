---
id: MOD-21
title: An optional reviewer stage: after a consistent verdict, a fresh read-only reviewer labels each claim of the hand-back confirmed, refuted or unverifiable before next=accept
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/verify.ts, hooks/lib/attempts.ts, hooks/lib/tier.ts, hooks/lib/repoconfig.ts, hooks/lib/review.ts, hooks/lib/quiet.ts, hooks/templates/**, .claude-plugin/plugin.json, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/types/**, .chassis-delegation.json, docs/**, hooks/lib/allow.ts, hooks/lib/verify-native.ts, hooks/lib/gitguard.ts, hooks/lib/card.ts, hooks/lib/dispatch.ts, hooks/lib/version.ts, hooks/lib/legacy.ts, bin/**]
red_test: pure tests in a new tests/review.test.ts: parsing [[review v=1 task=T confirmed=3 refuted=1 unverifiable=0]] gives the counts, a malformed block gives none; the advice for a consistent verdict with review on is next=review with a spawn block whose model is one tier below the worker's, and with review off is next=accept; engine tests in tests/hooks.test.ts: with review on, a consistent hand-back prints next=review; the reviewer's Write call is refused; a review hand-back with refuted=1 gives next=resume naming the worker and quoting the refuted row; with refuted=0 gives next=accept with the counts; the reviewer attempt does not use up budget=; red first
gate: validate, node, test
budget: 2-attempts
spend: 12
---
## Why

Public issue #1, second half. `consistent` (MOD-19) says the report matches git; nothing reads the diff. Two adopters added their own second layer: a fresh reviewer agent that labels each factual claim in the hand-back confirmed, refuted or unverifiable with the command or file and line that decides it, and never fixes anything. In its first week it changed the outcome on roughly one hand-back in three. Since 0.7.0 the brain makes every spawn, so the reviewer is one more Agent call the mod prints, and its tool calls are under the mod's hooks, so the mod can keep it read-only.

## Done when

- a new option review (off | on | on-frontier; repo file and /config; default off): on reviews every consistent verdict, on-frontier only frontier and premium cards; off changes nothing anywhere
- with review on, a consistent verdict's advice is next=review instead of next=accept and carries a spawn block for the reviewer: the brief's task, kind review, a model one tier below the worker's (floor economy; a reviewTier option overrides), and a prompt built from a new hooks/templates/review.md (read the brief, the report and the diff at the sha; one row per factual claim in the hand-back with confirmed, refuted or unverifiable and the command or file:line that decides it; edit nothing; end with [[review v=1 task=<ID> confirmed=N refuted=N unverifiable=N]])
- the agent.spawn hook records the reviewer as an attempt of kind review that never counts against budget=; while it runs, the mod's tool.call hook refuses its Edit, Write, MultiEdit and NotebookEdit calls and any Bash command the delegateOnly lexer counts as a write, with one line saying a reviewer never edits
- at the reviewer's hand-back the mod parses [[review]]: refuted=0 gives next=accept with `review: n confirmed, n unverifiable`; refuted>0 gives next=resume agent=<the worker> with the refuted rows quoted as the resume message; a missing or malformed review block gives next=accept with `review: no review block` (the review never blocks on its own failure); the row and ledger carry the counts
- README: a Review section (what it checks, what it never does, the option, the reviewer's tier, cost), the verdict table gains next=review; CHANGELOG; the manifest declares review and reviewTier
