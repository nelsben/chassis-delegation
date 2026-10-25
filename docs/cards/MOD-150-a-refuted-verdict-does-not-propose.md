---
id: MOD-150
title: A refuted verdict does not propose resume when the worker's commits are already on the base: next= says the work is on <base> (a cherry-pick counts, by patch) and nothing is resumed
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/verify.ts, tests/**, CHANGELOG.md]
forbid: [docs/cards/**, bin/**, hooks/templates/**, .chassis-delegation.json, .claude-plugin/**, README.md, docs/upgrading.md, hooks/lib/verify-native.ts, hooks/lib/allow.ts]
red_test: engine test: a worker's commit is cherry-picked onto origin/main, then its hand-back is refuted on gate: the row's next reads `none` with `the work is already on origin/main (cherry-picked or merged); nothing to resume`; at base it reads `next=resume agent=<id>`. Red first
gate: validate, node, test
budget: 2-attempts
spend: 5
---
## Why

Follow-up on #222: refuted rows that arrived after the lead had cherry-picked the worker's commit onto the base still said `next=resume agent=<id>`, which would resume a worker whose correct work is already merged and spend another attempt. The verifier can see that every commit of the branch is already on the base and say so instead.

## Done when

- Before a refuted (or unverified) verdict's next step is chosen for a worktree task, the mod lists the branch's commits not on the base by patch: `git log --cherry-pick --right-only --no-merges --format=%H <base>...<sha>` (read-only; through run(), under the existing allowlist). When that list is empty and the branch has at least one commit of its own, the row's next is `none` with the clause `the work is already on <base> (cherry-picked or merged); nothing to resume`, and no resume or escalate is proposed.
- When any commit is not on the base, or the command is refused or fails, the next step is chosen as today (fail-open).
- If the allowlist refuses that log form, the worker hands back with an amend for hooks/lib/allow.ts naming the exact flags rather than finding another way round it.
- Tests in tests/: (1) a refuted-on-gate attempt whose single commit was cherry-picked onto origin/main gives next=none with the clause; (2) the same with the commit not on the base gives next=resume as today; (3) a merged (fast-forward) commit also gives the clause. CHANGELOG.md Unreleased gets one Fixed entry. Wording generic: no product, repo, person, path or session names.

## Review

Consistent on attempt 1. branchOnBase in verify.ts: `log --cherry-pick --right-only --no-merges <base>...<sha>` empty, plus a commit of the branch's own dated since the attempt began, says the work is on the base; anything unreadable is undefined and the advice stands. The allowlist already accepted the form, so allow.ts was untouched. register.ts applies it only to refuted/unverified worktree hand-backs whose advice would be resume or respawn, before the work-present probe; repo=here and repo=none are exempt. The `--since=<attempt start>` own-commit test is the one judgment call: it keeps a no-work hand-back naming an old base tip from being retired as merged (the MOD-60 lesson), at the cost of missing a worker whose only commit predates its attempt. workerTree is factored out and shared with the existing probe.
