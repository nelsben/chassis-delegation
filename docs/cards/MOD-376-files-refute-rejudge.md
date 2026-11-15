---
id: MOD-376
title: a refute on files alone, with the gate reported green, advises a by-hand re-judge at the same sha, which spends no attempt, instead of a resume that spends one
domain: mod
tier: standard
status: merged
issue: 516
scope: [hooks/lib/verify.ts, docs/guide.md, CHANGELOG.md, tests/node/filesrejudge.node.mjs, tests/verify.test.ts, tests/*.test.ts, tests/node/*.node.mjs]
forbid: [bin/**, docs/cards/**, docs/mockups/**, hooks/register.ts, hooks/lib/verify-native.ts, hooks/lib/attempts.ts, hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, docs/upgrading.md]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/filesrejudge.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Issue #516: a worker was resumed only to add one missing path to its report's `files=`. No file changed, but the resume counted as attempt 2 of 2. The tree was right and only the report was wrong. That case already has a free path: `dispatch task=<ID> verify=<sha>` re-judges the tree with a synthetic report that names the real delta. `verifyTarget` (hooks/lib/attempts.ts) puts a re-judge at the same sha on the same attempt, so no attempt is spent. The advice just never points there. This card changes the advice and leaves budget accounting alone. Re-labelling a resume as "not an attempt" after the fact would blur the first-attempt measures (MOD-338).

## Before you start

- `hooks/lib/verify.ts`, `advise`: the MOD-170 block (a refute on scope alone with a held amend, before the `attempts >= budget` check), `firstFailedClaim`, `parseClaimLine`, and the GH-115 `held === 'files'` resume branch.
- `hooks/lib/verify-native.ts`: the `claim files: failed — files= does not match the actual delta (omits or invents a path): …` line. Read it only; do not change it.
- `tests/verify.test.ts`: the GH-115 test, which pins today's files advice.
- `docs/guide.md`: step 3 of the walk-through near the top, whose example row is a files refute with `next=resume agent=agent-7`.

## Design (decided by the brain; build it, do not redesign it)

- In `advise`, inside the existing `if (input.verdict === 'refuted')` block and after the MOD-170 check, so it also comes before the `attempts >= budget` stop:
  - When exactly one claim failed, it is `files`, `input.reportGate === 'pass'` and `input.sha` is set, return `{ kind: 'check', next }`.
  - `next` is `files= is wrong, not the tree: check the paths named above are the worker's, then dispatch task=${task} verify=${sha} (re-judges this attempt against the delta; no attempt spent)`, followed by `; else resume agent=${agentId} — revert the extras` only when `input.agentId` is set and `attempts < budget`.
  - Mark it `MOD-376 (#516)`.
- In every other case the advice is unchanged: a files refute with a gate fail or no sha, or several failed claims, takes the paths it takes today, the GH-115 resume included.
- `docs/guide.md`, step 3: change the example files-refute row's `next=` to the new advice, cut with `…` the way the row already cuts its reason. Add one sentence after the rows: a refute on files alone means the report was wrong, not the work; check the delta and re-judge with `dispatch verify=<sha>`, which spends no attempt.
- `CHANGELOG.md`, `## Unreleased` (make it above `## 0.9.61` when absent), `### Changed`: one bullet `(MOD-376, #516)`.

## Tests

- `tests/node/filesrejudge.node.mjs` (new, the red test), on `advise`:
  - A files-only refute with gate pass and a sha gives kind `check`, with the verify step naming the task and sha.
  - With an agent id and budget left, the resume clause is there; at budget it is not, and the advice is not `exhausted`.
  - A files refute with `reportGate: 'fail'`, or with no sha, keeps today's advice.
  - A refute on files and scope together keeps today's advice.
- `tests/verify.test.ts`: update the GH-115 files expectation to the new text (give that call a sha and gate pass), and keep a case for the old resume path, such as gate fail.

## Left to you

- Fixture lines and test names.

## Done when

- A refute on files alone, with gate pass, advises the by-hand re-judge at the same sha. The other refutes advise as before.
- The guide's example and its sentence match, and the changelog names it.
- Gate validate, node and test are green.

## Review

Brain review (Opus 5.5): Built as designed. The files-only branch sits after the MOD-170 check, inside the refuted block, so it runs before the budget stop. It needs gate pass and a sha. The resume clause is added only when an agent id is set and budget is left. Every other files refute keeps the GH-115 path. The no-agent-id choice is sound. The guide row and its sentence match the advice.
