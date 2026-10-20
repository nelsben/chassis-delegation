---
id: MOD-104
title: bin/evidence.mjs turns delegation ledgers into one anonymized JSON summary of outcomes, cost and time
domain: mod
tier: standard
status: merged
scope: [bin/evidence.mjs, tests/node/evidence.node.mjs, tests/fixtures/evidence/**, docs/internals.md, CHANGELOG.md]
forbid: [hooks/**, .claude-plugin/**, README.md, docs/upgrading.md, docs/cards/**]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs (the new tests/node/evidence.node.mjs fails: bin/evidence.mjs does not exist)
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

The repo claims the mod works but shows no numbers. Six repos have run it for two weeks and each keeps .delegation/ledger.jsonl, so the evidence exists; it needs a reproducible extractor that anyone can run on their own ledgers and whose output is safe to commit to a public repo (no paths, task ids, shas or session ids).

## Done when

- `node bin/evidence.mjs <ledger.jsonl> [<ledger.jsonl>...]` prints one JSON object to stdout and exits 0; with no arguments it prints a one-line usage to stderr and exits 2. It reads only the files named, writes nothing, and needs only Node built-ins (no packages).
- Repos are labelled A, B, C… in argument order. The output never contains a path, task id, sha, session id, agent id, tool-use id, brief path or free text from the ledger (`next`, `description`, `how` values other than counts). A test asserts this by scanning the output of a fixture run for every such value in the fixture.
- Judged attempts are ledger rows that have a `verdict` and no `event` field; rows with `event: spawn` and rows with `kind: accept` or `kind: merged` are not attempts. When the same task/subtask/lineage/attempt is judged more than once, the last row by `at` counts. The legacy verdict `verified` counts as `consistent`.
- The JSON has: `window` (first and last day, YYYY-MM-DD UTC); `totals` (tasks, judged attempts, worker usd rounded to whole dollars, accepted, merged); `verdicts` (count of each final verdict, taking each task's last judged attempt); `attempts` (histogram of the highest attempt per task); `firstAttempt` (consistent / judged among attempt 1); `tiers` (per alias: n, mean usd, median and p90 minutes from `at` to `verdictAt`, consistent count); `days` (per UTC day: judged, refuted, usd); `repos` (per label: tasks, judged, verdict counts, usd, first and last day). Numbers are rounded: usd to 2 places (totals to 0), minutes to whole minutes.
- A malformed line is skipped and counted in `skippedLines`; a missing file is an error naming that argument's position (not its path) and exits 1.
- tests/node/evidence.node.mjs covers: the shape above on a fixture of two small ledgers in tests/fixtures/evidence/, the verdict fold, last-row-wins, spawn/accept/merged rows excluded from attempts, the anonymity scan, a malformed line, and the no-argument usage. It runs in the existing node suite.
- docs/internals.md gains a short `## Evidence` section (under 120 words) saying what the script reads, what it never emits, and the command line. CHANGELOG.md gets an entry under Unreleased.

## Review

Reviewed by the brain. bin/evidence.mjs (Node built-ins only) reads the ledgers named on the command line and prints one anonymized JSON summary. Repos are labelled A, B, C in argument order, and no path, task id, sha, session id, agent id or free text is emitted. Attempts are rows with a verdict and no event, excluding accept, merged and review rows; the last row per task/subtask/lineage/attempt wins, and the legacy verdict word folds into consistent. I ran it on six real ledgers: exit 0, 3.7 KB, a leak scan for paths, repo names, task-id prefixes and hex ids found nothing, and the totals match my own aggregation (684 tasks, 763 judged, $2,657, 271 accepted). Note for the evidence page: totals.merged counts only the merge tool's own rows (since MOD-75); accepted is the number of tasks landed. Attempt 1 was refuted on the engine gate because of machine load (every failure a 5 s timeout in an untouched test); /dispatch --verify with the machine quiet came back consistent. The CHANGELOG conflict with MOD-105 was resolved by hand, keeping both entries.
