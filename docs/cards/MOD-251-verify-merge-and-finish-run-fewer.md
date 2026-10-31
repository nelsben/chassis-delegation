---
id: MOD-251
title: Verify, merge and finish run fewer git processes, and finish stops walking every ignored file
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/verify.ts, hooks/lib/mergecmd.ts, tests/verify.test.ts, tests/merge.test.ts, tests/harness.ts, tests/node/**, CHANGELOG.md]
forbid: []
red_test: tests/verify.test.ts: a verify of a clean passing hand-back runs at most 8 git processes (fails today: about 12)
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

One passing card costs about 22 git spawns plus a fetch: ~12 in the verifier (hooks/lib/verify-native.ts near 695-856, the probe and lock around hooks/register.ts 5277-5286), ~10 at merge plus `git fetch origin` (near 2959), and finish adds a second fetch (near 3079) and `git status --porcelain --ignored --untracked-files=all` (near 3098), which walks node_modules and every ignored file.

## Done when

- Verify's working-tree checks come from one `git status --porcelain=v1 -z --untracked-files=all` whose output is parsed once for modified, untracked and leftover files; the leftover wording is unchanged (--ignored=matching is not added, it changes pinned wording).
- rev-parse calls that take the same answer are merged: the sha^{commit} and HEAD check into one `git rev-parse <sha>^{commit} HEAD`; the ref and --abbrev-ref HEAD into one call; each merged call is named in a code comment.
- Merge's finish step keeps its own fetch (a push happens between merge and finish, so the merge fetch cannot be reused).
- tests/harness.ts canned argv answers are updated for the merged calls, not deleted; every existing verify and merge test stays green.
- CHANGELOG.md gets an Unreleased line.
- Gates validate, node and test are green.
