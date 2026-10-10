---
id: MOD-4
title: Owed rows retire by themselves when the task's work is on origin/main, /delegation accept <id> closes one by hand, and the compaction block keeps the live rows in full and counts the rest
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/compaction.ts, hooks/lib/attempts.ts, hooks/lib/quiet.ts, hooks/lib/allow.ts, hooks/lib/dashboard.ts, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/lib/verify-native.ts, hooks/lib/gitguard.ts, hooks/lib/card.ts, hooks/lib/setup.ts, hooks/lib/scheduler.ts, hooks/lib/dispatch.ts, hooks/lib/brief.ts, hooks/lib/live.ts, hooks/lib/pane.tsx, hooks/lib/band.tsx]
red_test: pure tests in tests/compaction.test.ts or tests/attempts.test.ts: a record whose sha is reported an ancestor of origin/main retires, one whose card reads status: merged retires, a fresh one stays, and the block renders the live rows then the count line; engine test in tests/hooks.test.ts: after an owed attempt whose sha the harness reports as an ancestor, /delegation prints no row for it; /delegation accept GH-1 records accepted by hand and the next /delegation has no GH-1 row; red first
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Public issue #23 (the first adopter): about 38 owed: lines (resume, respawn, check by hand) rode through every compaction of a long session for tasks merged hours earlier, and each new brain had to work out again that they were noise while the one live worker hid among them. This repo shows it today: /delegation still prints owed rows for GH-4, GH-5, GH-2, GH-3, GH-17, GH-16, GH-100 and GH-102, all merged days ago, plus three for GH-116, merged this afternoon. Nothing retires a row whose next step the brain resolves outside the mod.

## Done when

- an owed row retires when the task's work is on the default branch: its last attempt's sha is an ancestor of origin/main (git merge-base --is-ancestor, an allowed form) or its card on origin/main reads status: merged (read through an allowed git form that accepts the configured cardDir, not only agents/tasks/); a retired row leaves the compaction block, the prompt section and /delegation, and the attempt records retired: merged
- /delegation accept <id> [note] records accepted by hand plus the note on the task's last attempt, retires its row and prints one line; an unknown id prints one line and changes nothing
- the compaction KEEP VERBATIM block and the prompt.compose section print the live rows in full (running, pending verdict, and owed rows not yet checked or younger than 24 hours) and then one line, n older owed rows: <ids>; the existing line cap stays
- the retire check runs at most once per 15 minutes per task (one merge-base, one card read) and a failed check leaves the row as it is
- README's delegation-state section names the three rules
