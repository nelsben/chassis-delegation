---
id: MOD-118
title: merge targets the configured base: with baseRef naming a branch, the main checkout must be on that branch and the card rebases onto it; the default branch is the target only when no base is set
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/mergecmd.ts, tests/**, docs/review-and-merge.md, CHANGELOG.md]
forbid: [bin/**, hooks/templates/**, .claude-plugin/**, docs/cards/**, .chassis-delegation.json]
red_test: the new engine test with baseRef set to a branch and the checkout on it fails at the base: merge answers that the checkout is not on the default branch
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Issue #186. mergePrepare in hooks/register.ts compares the main checkout's branch with the default branch only (if onBranch !== def), even when the repo's baseRef names the branch every card was cut from. A repo working off a long-lived branch had to merge a whole batch by hand, skipping the card-merged commit and the gate re-run merge does.

## Done when

- When baseRef (repo config) names a branch (with or without an origin/ prefix), merge requires the main checkout to be on that branch; the refusal line names it (… is on X, not <that branch>; switch it to <that branch> first); the rebase, the printed gh pr create --base and the finish pull all use that branch.
- A baseRef that is a sha or tag, not a branch, keeps today's default-branch behaviour, and the merge output says so in one line.
- Unset baseRef: behaviour unchanged.
- Tests (engine): baseRef branch and checkout on it → the PR block names --base <branch>; checkout on the default branch → refused naming baseRef's branch; sha baseRef → default branch as today; unset → unchanged. CHANGELOG gains an Unreleased entry naming #186; docs/review-and-merge.md says which branch merge targets.
- No machine paths, user, product or repo names. The validate, node and test gates pass.

## Review

Attempt 1 (sonnet) accepted. A new pure mergeTarget picks the branch: a baseRef that origin has as a branch (bare or origin/-prefixed) is the target for the checkout check, rebase, PR --base and finish; a sha, a tag or unset keeps main, and a set-but-not-a-branch baseRef prints one line saying so. One read-only rev-parse probe, only when baseRef is set and not a sha. Red: bare baseRef work refused at base. Gates green: validate, node 987/0, plugin 1503/0.
