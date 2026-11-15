---
id: MOD-382
title: merge refuses a baseRef that is a local branch with no origin copy, saying to push it first, instead of quietly merging onto main
domain: mod
tier: standard
status: merged
issue: 515
scope: [hooks/lib/mergecmd.ts, hooks/register.ts, docs/configuration.md, CHANGELOG.md, tests/node/localbase.node.mjs, tests/*.test.ts, tests/node/*.node.mjs, tests/harness.ts]
forbid: [bin/**, docs/cards/**, docs/mockups/**, hooks/lib/verify-native.ts, hooks/lib/verify.ts, hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, docs/upgrading.md]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/localbase.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Issue #515: a repo works on a long-lived local branch that is not pushed, and sets it as `baseRef`. Merge lands through a PR on origin, so it cannot land onto a branch origin does not have. Today `mergeTarget` (hooks/lib/mergecmd.ts) reads that branch as "not a branch", notes `merging onto main`, and goes on. The repo then hits the main-checkout check, or worse, lands onto main. We are not adding a landing mode with no PR: the PR is where the mod's merge record lives. Instead merge stops at once and says what to do: push the branch, and it works as a `baseRef` today (MOD-118).

## Before you start

- `hooks/lib/mergecmd.ts`: `defaultBranchOf`, `mergeTarget`, and `mainBranchLine` for the shape of a refusal line.
- `hooks/register.ts`, `mergeCommand` (search `async function mergeCommand`): the `probe` of `refs/remotes/origin/<name>` and the call to `mergeTarget`.
- The tests that pin `mergeTarget` today (search `mergeTarget` under `tests/`).
- `docs/configuration.md`, the `baseRef` row.

## Design (decided by the brain; build it, do not redesign it)

- `mergeTarget(baseRef, isBranch, isLocalOnly = false)` gains a third argument: whether `refs/heads/<name>` exists in the main checkout while origin has no branch of that name.
  - When `isBranch` is false and `isLocalOnly` is true, it returns `{ baseRef: 'origin/main', def: 'main', refuse: localBaseLine(name) }`.
  - Every other case returns what it returns today, with no `refuse`. A sha, a tag, an unset value, and a name that is neither on origin nor local keep today's note and target.
- `export const localBaseLine = (name: string): string` returns `baseRef ${name} is a local branch with no copy on origin; merge lands through a PR on origin, so push it first (git push -u origin ${name}), then merge again`. Mark both `MOD-382 (#515)`.
- `hooks/register.ts`, `mergeCommand`: when the origin probe does not find the branch and the name is not a sha, run a second read-only probe, `git -C <root> rev-parse --verify --quiet refs/heads/<name>`, and pass its success as `isLocalOnly`. When the result has `refuse`, return `${id}: ${refuse}` before anything else, for both prepare and finish. Nothing is read, moved or removed first.
- `docs/configuration.md`, the `baseRef` row gains one sentence: a branch must be on origin, because merge lands through a PR there; a local-only branch is refused with a line saying to push it first.
- `CHANGELOG.md`, `## Unreleased` (make it above `## 0.9.62` when absent), `### Changed`: one bullet `(MOD-382, #515)`.

## Tests

- `tests/node/localbase.node.mjs` (new, the red test), on `mergeTarget`:
  - A local-only name (`isBranch` false, `isLocalOnly` true) gives `refuse` with the push line that names the branch.
  - The same name on origin (`isBranch` true) is the target, with no `refuse`.
  - `origin/<name>` written with the prefix behaves the same as the bare name.
  - A name that is neither, and the empty value, keep today's result.
- An engine test beside the existing merge `baseRef` tests: with `baseRef` set to a branch that exists only locally, `merge task=<ID>` returns the refusal line, and the worktree and the main checkout are left as they were.

## Left to you

- Fixture texts and test names.

## Done when

- A `baseRef` that names a local branch with no origin copy makes merge, prepare and finish, refuse at once with the push-it-first line.
- Every other `baseRef` merges as before.
- The config row and the changelog say so, and gate validate, node and test are green.

## Review

Brain review (Opus 5.5): Built as designed. mergeTarget gains isLocalOnly and returns the push-it-first refusal. mergeCommand probes refs/heads/<name> only when baseRef is set, origin lacks the branch and the name is not a sha, so the default path makes no extra git call. It refuses before prepare or finish touches anything. The engine test asserts no fetch, rebase, push, checkout or worktree removal on either path. Defaulting the test helper's refs/heads probe to "no" was needed, and it keeps the old tag case honest. The config row and changelog match.
