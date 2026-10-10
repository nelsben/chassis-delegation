---
id: GH-115
title: A scope or files refute holds the tier and advises the amend; only a red-test, gate or sha refute escalates
domain: mod
tier: standard
status: merged
scope: [hooks/lib/verify.ts, hooks/lib/attempts.ts, hooks/lib/quiet.ts, hooks/register.ts, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/lib/verify-native.ts, hooks/lib/gitguard.ts, hooks/lib/scheduler.ts]
red_test: pure tests in tests/verify.test.ts: escalationSource over a refuted attempt whose first failed claim is scope (or files) returns undefined, over one whose first failed claim is gate, red or sha returns the attempt's tier; advise() on a scope refute reads "next=resume agent=<id> — amend: [[amend v=1 scope+=<path> reason=…]] (the path is outside scope; a scope refute never escalates)"; red first
gate: validate,node,test
budget: 2-attempts
spend: 8
---
## Why

Public issue #34, ask 3. Since GH-104 any refute earns the next tier up on respawn. The adopter's ledger
shows most refutes were scope refutes (a path outside the globs, or a stacked base diffed against
origin/main before GH-105): a scope artefact then turned a Sonnet card into an Opus respawn. A scope or
files refute says the brief's globs are wrong, not that the worker was out of its depth.

## What to build

- The attempt record keeps `firstFailed` (the first failed claim's name: branch, sha, scope, files, gate,
  red, pr). `finalizeOnce` already has the claim lines; parse the first `claim <name>: failed`.
- `escalationSource` (hooks/lib/attempts.ts) escalates only when `firstFailed` is `sha`, `gate` or `red`
  (or the record predates the field). `scope`, `files`, `branch` and `pr` refutes hold the tier.
- `advise()` on a scope refute: `next=resume agent=<id> — amend: [[amend v=1 scope+=<path> reason=<why>]]`
  with the first out-of-scope path filled in and the reason left for the brain; on a files refute:
  `next=resume agent=<id> — list the paths named above in files= (or revert the extras)`. A later respawn
  for these stays at the same tier, and the verdict row says `(held: a <scope|files> refute)`.
- README (escalation paragraph) and CHANGELOG (GH-115).

Save red output to `.delegation/GH-115/red-1.txt`, name it `red=`. The gate map runs the three gates.
