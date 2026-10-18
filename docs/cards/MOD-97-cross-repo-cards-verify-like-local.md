---
id: MOD-97
title: Cross-repo cards verify like local ones: attempts and verdicts are kept apart per repo, a resumed attempt is checked against its brief, and the delta is taken in the card's own repo
domain: mod
tier: frontier
status: merged
scope: [hooks/register.ts, hooks/lib/attempts.ts, hooks/lib/verify-native.ts, hooks/lib/verify.ts, hooks/lib/retention.ts, hooks/lib/crossrepo.ts, tests/crossrepo.test.ts, tests/hooks.test.ts, tests/retention.test.ts, tests/verifynative.test.ts, CHANGELOG.md, docs/internals.md]
forbid: [docs/cards/**, hooks/lib/serial.ts, hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, docs/upgrading.md, hooks/lib/allow.ts, bin/**, .chassis-delegation.json]
red_test: the new cross-repo engine tests (in tests/crossrepo.test.ts or tests/hooks.test.ts): the same id in two repos counting one attempt each, a resumed cross-repo worker verified with scope checked, and a cross-repo in-scope delta judged consistent; all fail on origin/main (attempt 2/n, `no brief`, `unverified on scope`); save that run as the red evidence first
gate: validate, node, test
budget: 2-attempts
spend: 15
---
## Why

Three issues from one setup, a lead session that dispatches cards into a second local repo with repo=<path>. #163: attempt numbers and verdict rows of the two repos share one key space by card id, so a first run says attempt 2/4 and a verdict names a sha and model from another row. #155: a resumed worker's second attempt is unverified on scope with "no brief", because the verifier loses the brief fields. #164: every cross-repo verdict is unverified on scope, naming an outside delta in a folder that belongs to neither the card's repo nor its worktree. Together they mean no cross-repo card ever gets a trustworthy verdict.

## Done when

- ONE KEY SPACE PER REPO (#163). An attempt's records, its spawn record and its verdict are found by repo plus id, never by id alone: a task OPS-15 dispatched into repo B and an OPS-15 known from repo A (this session or another, the store is shared) never read or count each other's attempts. Start rows, budgets, the verdict tool, /delegation and the owed list all name the attempt of the right repo. Records written before this change (no repo on them) are read as today: they belong to the session repo they name in `root`, or to any repo when they name none. Pick the smallest change that does this (for example a repo-qualified tasks key for a task whose repo is not the session's, with the bare key read as the fallback), say which in docs/internals.md, and leave retention's per-task families working: a new key shape must still be pruned by hooks/lib/retention.ts's family rules, or the card adds it there.
- RESUME KEEPS ITS BRIEF (#155). A resumed attempt (SendMessage to the same worker after a verdict, the MOD-41 path) is verified against the same brief as the attempt it follows: the verifier reads the brief path the dispatch wrote (the cross-repo brief lives under the session root's .delegation/briefs/, the worktree beside the other repo), and never reports `no brief: no scope=/gate=/red_test= to check against` while that file exists. An engine test resumes a cross-repo worker and gets a consistent second verdict with scope checked.
- DELTA IN THE CARD'S REPO (#164). For a card whose repo is another local repo, the verifier takes the delta in that repo's worktree against that card's base in that repo, and a path outside the card's repo and worktree is not part of the delta unless the card's scope names it (an absolute scope or output folder). An engine test with a cross-repo card whose work is in scope gets `consistent`, not `unverified on scope`; one with a real out-of-scope file inside the other repo is still refuted on scope.
- TESTS. Engine tests for each of the three, red on origin/main and green at the head, using a fake host with two repos (session repo A, target repo B) and one shared store; include the collision case (same id in A and B, the B dispatch says attempt 1/n and its verdict names B's sha).
- DOCS. CHANGELOG.md gets one entry under `## Unreleased` naming #155, #163 and #164, below the entries already there. docs/internals.md says how a cross-repo task's records are keyed and where its brief and delta are read; drop any Known issues line this fixes.
- GATES. validate, node and test are green.

## Review

Reviewed by the brain. Attempt records are keyed by repo plus id (delegation.tasks.<ID>@<repo> for another local repo, bare key for the session repo). A bare-key read takes the session repo's records and legacy ones with no root; a bare-key write keeps other repos' records. Id-only doors resolve the repo from delegation.taskRepo. The spawn hook no longer repoints an agent id that names a briefed spawn at the ad hoc spawn a SendMessage resume raises, so a resume is verified against its brief at the brief's budget. This fixes the same-repo "attempt 2/3 unverified (no brief)" seen on MOD-99. The outside listing is keyed per repo and dropped when a brief names no absolute root. Retention folds <ID>@<repo> into <ID>. Red runs reproduce all three symptoms plus the same-repo resume. The rebase onto MOD-98/99/100 was resolved by hand: the foreground test now also counts a resume call, and it sits alongside MOD-99's wait check; CHANGELOG keeps every entry. Known, left as is: delegation.taskRepo.<ID> is not cleared when the same id is later dispatched locally. Closes #155, #163, #164.
