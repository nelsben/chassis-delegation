---
id: MOD-234
title: Merge keeps gate output tail-only on pass, and old merge-gates.txt files are cut to their tail at session start
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/gaterun.ts, tests/merge.test.ts, tests/gaterun.test.ts, tests/harness.ts, tests/node/**, CHANGELOG.md]
forbid: []
red_test: tests/merge.test.ts: after a passing merge, merge-gates.txt is under 8 KB for a gate that printed 3000 lines (fails today: the full output is written)
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

93% of the 49 MB in .delegation/ is merge-gates.txt: the merge step writes the full stdout of every gate on pass (hooks/register.ts near 3025-3029), about 330 KB per merged card, and the host fs has no delete so nothing ever prunes it. The verifier already keeps only a tail on pass; merge should match.

## Done when

- On a passing gate (exit 0), merge-gates.txt holds for that gate: the `## <gate>: <argv>` header line, a line `(pass) <n> lines elided`, the last 40 lines of stdout+stderr, and `exit 0`.
- On a failing gate, and on a gate that did not run (`did not run: <why>`), merge-gates.txt keeps the full text as today.
- At session.start, a sweep lists .delegation/<ID>/ folders (examining at most 200 per run, rewriting at most 100) and, for each merge-gates.txt larger than 64 KB whose task has an accept or merged ledger row, overwrites the file with its first line, `(older file) <n> lines elided`, and its last 40 lines; a file already in that shape, or one $.fs.read refuses (over 4 MiB), is skipped; the sweep runs once per session, fails open, and never blocks start.
- The pure shaping functions (per-gate on write, whole-file for the sweep) live in hooks/lib/gaterun.ts with node tests; the merge path and the sweep have engine tests.
- CHANGELOG.md gets an Unreleased line.
- Gates validate, node and test are green.
