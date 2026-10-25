---
id: MOD-152
title: The worker's worktree is locked while the verifier judges it: `git worktree lock` before the verify, `unlock` after, so a plain `git worktree remove --force` refuses mid-gate; finish unlocks before it removes
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/allow.ts, tests/**, docs/review-and-merge.md, CHANGELOG.md]
forbid: [docs/cards/**, bin/**, hooks/templates/**, .chassis-delegation.json, .claude-plugin/**, README.md, docs/upgrading.md, hooks/lib/verify-native.ts]
red_test: engine test: verifying a worktree hand-back records `git -C <root> worktree lock --reason \"chassis-delegation: verifier running; land after the verdict\" <worktree>` before the gate argv and `git -C <root> worktree unlock <worktree>` after it; at base no lock argv is recorded. Red first
gate: validate, node, test
budget: 2-attempts
spend: 6
---
## Why

#246: on the manual route the lead cherry-picked a hand-back and ran `git worktree remove --force` on the worker's worktree while the verifier's gate was still running there; the gate lost its directory and seven tasks were refuted on a false gate RED. MOD-149 now marks that run unchecked, but the lock stops the race itself: a locked worktree needs `remove -f -f`, so it cannot be pulled away by accident.

## Done when

- In hooks/register.ts runVerify, for a worktree task (not repo=here, not repo=none), the mod runs `git -C <task repo> worktree lock --reason "chassis-delegation: verifier running; land after the verdict" <worktree>` through run() before verifyNative is called, and `git -C <task repo> worktree unlock <worktree>` in a finally after it returns or throws. The unlock runs only when this verify's own lock succeeded (a worktree already locked by someone else is left locked). A lock that fails or is refused is written to debug and the verify goes on as today (fail-open). <task repo> is the repo the worktree was cut from (the session root, or the task's other repo per MOD-44).
- hooks/lib/allow.ts passes exactly these two shapes and no other `worktree lock` / `worktree unlock` form: one `-C <root>`; the worktree path must be the one worktreePath gives for a task id, under the same root rules as `worktree add` (the session's own repo, or a repo taskRepos names for that task); for lock, `--reason` with exactly that string. Any other lock/unlock argv, another path, another reason or a missing -C is refused with a reason that names it. The file's header comment lists the two new shapes.
- `/delegation merge --finish` (and any other mod path that runs `git worktree remove` on a task's worktree, e.g. --discard) first runs the same unlock, ignoring its failure, so a lock left by a crashed or killed verify never stops finish. If the merge context in allow.ts needs the unlock shape too, it is allowed there bound to that one task, as its other shapes are.
- Tests in tests/: (1) an engine verify of a worktree hand-back records a lock argv before the gate argv and an unlock argv after it, and with the gate throwing the unlock still runs; at base no lock argv is recorded (red first); (2) repo=here and repo=none verifies run no lock; (3) a lock that exits non-zero still gives the verdict and runs no unlock; (4) allow.ts tests: the exact shapes pass, a wrong path, a wrong reason, `--force` or no -C is refused; (5) merge --finish on a locked worktree unlocks then removes.
- docs/review-and-merge.md gains one or two sentences: while the verifier runs, the worker's worktree is locked, `git worktree remove --force` refuses it, and the lead lands after the verdict; `git worktree unlock <path>` frees one left behind. CHANGELOG.md Unreleased gets one entry naming #246. Wording generic: no product, repo, person, path or session names.

## Review

Consistent on attempt 1. runVerify locks a worktree task's worktree (`git -C <task repo> worktree lock --reason '<LOCK_REASON>' <worktree>`) before verifyNative and unlocks in a finally only when its own lock took; lock/unlock failures go to debug (fail-open); repo=here and repo=none are exempt. allow.ts checkWorktreeLock passes exactly the two shapes: one -C, the path must be worktreePath for a task id under the worktree-add root rules (another repo only for a task taskRepos names, no replay), and the lock reason must be LOCK_REASON; the merge context also passes `worktree unlock <that worktree>`, which finish runs before remove. Reviewed the allow.ts diff by hand. Gap: no test forces verifyNative itself to throw; the finally covers it in code.
