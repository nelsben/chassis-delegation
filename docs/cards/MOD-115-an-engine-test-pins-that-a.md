---
id: MOD-115
title: An engine test pins that a resumed started row carries no down nudge, while the next fresh start does
domain: mod
tier: standard
status: merged
scope: [tests/rows.test.ts]
forbid: [hooks/**, bin/**, docs/**, CHANGELOG.md, README.md, .claude-plugin/**, .chassis-delegation.json]
red_test: delete the `i.kind === 'resumed' ? undefined : ` guard in postStarted in hooks/register.ts locally, run the new test with claude plugin test and see it fail on the resumed row carrying 'lead: back to medium'; save that run as the red evidence, then restore register.ts exactly
gate: validate, node, test
budget: 2-attempts
spend: 5
---
## Why

MOD-114 skips the 'lead: back to medium' clause on a resumed started row (postStarted in hooks/register.ts, the `i.kind === 'resumed'` check), so a resume of the task whose cards are being judged does not say the judgment is over. No test covers that branch; a later edit could drop it silently.

## Done when

- tests/rows.test.ts, in the describe block 'MOD-114: the nudge on the rows (engine)', gains one test: a hand-back whose report names a cards artefact nudges up; its verdict is not accept (next=resume); the resume's started row says 'resumed' and has no 'lead: back to' clause; a later fresh started row of another task does end with 'lead: back to medium'. Reuse that block's helpers and OPTIONS.
- Only tests/rows.test.ts changes. No source change. No machine paths, user names or product names.
- The validate, node and test gates pass.

## Review

Attempt 1 (sonnet) accepted. One engine test in the MOD-114 engine block: a cards hand-back nudges up, its verdict is next=resume, the resumed started row has no down clause, and a later fresh start of another task ends `lead: back to medium`. Red run: the test fails with the resume guard removed from postStarted (the resumed row carried the down clause). Only tests/rows.test.ts changed. Gates green: validate, node 987/0, plugin 1497/0.
