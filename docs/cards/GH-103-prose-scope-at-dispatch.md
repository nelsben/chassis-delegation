---
id: GH-103
title: A prose scope is caught at dispatch, not after the worker ran: dispatch stops and asks for globs, and a prose scope that slips through is unchecked, never a refusal of the whole brief
domain: mod
tier: standard
status: merged
scope: [hooks/lib/dispatch.ts, hooks/lib/verify-native.ts, hooks/register.ts, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/lib/scheduler.ts, hooks/lib/gitguard.ts]
red_test: an engine test in tests/hooks.test.ts where /dispatch of a card with a prose scope and no --scope writes the brief, prints the header and the prose, and does NOT spawn (red: today it spawns); and a pure test in tests/verifynative.test.ts where a brief with a prose scope and no scope_globs yields scope=unchecked and the other claims checked (red: today the brief is refused)
gate: validate,node,test
budget: 2-attempts
---
## Why

Public issue #8, from the first adopter, whose cards all carry a prose scope. `dispatch` copies the prose
into the brief, prints its own warning that the verifier will refuse it, spawns anyway, and after the
worker's $4.55 the verdict is `refused · next=fix the brief`. A refusal that is predictable at dispatch
should happen at dispatch, and a worker's finished work should not be thrown away over the scope line.

## Done when

- **Dispatch stops.** When the card's `scope:` reads as prose (`scopeLooksProse`) and no `--scope` / tool
  `scope` was given, `/dispatch` and the tool write the brief, print the header and the prose scope, and
  stop before the worktree and the spawn with: `stopped: the card scope is prose; pass --scope <globs>
  (or scope on the tool) and dispatch again`. The brief is reused on the second dispatch. `--dry-run`
  behaves as today. Document on the tool's `scope` argument that it must be globs and that it replaces
  the card's scope in the header.
- **The verifier degrades instead of refusing.** `briefContract` with a prose `scope=` and no
  `scope_globs=` returns ok with `scope: []` and a flag `scopeProse: true`; the verifier then marks the
  scope claim `unchecked — scope= reads as prose; add scope_globs= to the brief to check it` and checks
  everything else, so the verdict is unverified at worst and the work stands. The refusal
  `BRIEF-SCOPE-PROSE` remains only for a brief with no `scope=` at all (BRIEF-UNPARSEABLE stays).
- README: the Contracts paragraph on `scope_globs=` and the dispatch section say this. CHANGELOG
  (GH-103, closes public #8). Save red output to `.delegation/GH-103/red-1.txt`, name it `red=`.
