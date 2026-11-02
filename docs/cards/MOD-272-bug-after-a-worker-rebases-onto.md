---
id: MOD-272
title: Bug: after a worker rebases onto a newer main, the verdict's scope check counts only the worker's own changes, not files other cards merged
domain: mod
tier: standard
status: merged
scope: [hooks/lib/verify-native.ts, hooks/lib/verify.ts, hooks/register.ts, tests/**, CHANGELOG.md]
forbid: []
red_test: a new test in the verify-native tests: after rebasing the worker branch onto a main that gained a forbidden file from another branch, the delta does not include that file; fails today because merge-base(recorded base, sha) is the old dispatch sha
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

verify-native.ts takes the delta from merge-base(base, sha) where base is the brief's base= sha recorded at dispatch; after the worker rebases onto a main that already holds other cards' merges, that merge-base is still the old sha, so their files show in the delta and a file on this card's forbid list refutes the attempt, burning an attempt and sending the worker to fix a non-problem. Reported by an adopter on a repo with no remote and local branches only.

## Done when

- When the recorded base is an ancestor of the branch, the delta is taken from the newest of: merge-base(recorded base, sha) and merge-base(ref, sha) for each of BASE_REFS that resolves (origin/main, main, origin/master, master) and for the config's baseRef, where newest means the candidate that has every other candidate as an ancestor; with no such single newest candidate the recorded base is kept as today.
- A worker that did not rebase gets exactly today's delta (the newest candidate is the recorded base or an equal commit).
- When the delta base moved past the recorded one, the scope line names it, e.g. 'since main (rebased past abc1234)'.
- Works with no remote: a repo with only a local main and the worker branch.
- repo=here (working-tree delta) and replay bases are unchanged.
- A test reproduces the report: dispatch at X, another branch adding forbidden file F merged into main (main at Y), the worker branch rebased onto Y; the verdict's delta excludes F and the attempt is not refuted on scope; a second test shows a worker that itself adds F is still refuted.
- CHANGELOG.md Unreleased has one entry.

## Review

Accepted. Known nit: the scope line always says 'main' even when the newer base came from origin/main or baseRef. pathsAtBase in register.ts (MOD-170) still uses the recorded base.
