---
id: GH-17
title: A scope entry inside a forbid glob is warned at render and a hand-back scope+= into a forbid waits for approval
domain: mod
tier: standard
status: merged
scope: [hooks/lib/brief.ts, hooks/lib/dispatch.ts, hooks/lib/verify-native.ts, hooks/register.ts, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, agents/**, hooks/lib/handback.ts, hooks/lib/scheduler.ts]
red_test: a pure test in tests/brief.test.ts for a new scopeInsideForbid(scope, forbid) helper returning the covered entries (red because it does not exist), and an engine test in tests/hooks.test.ts where a hand-back [[amend scope+=shell/NOTES.md]] under forbid=shell/** is reported as needing approval, not applied
gate: node
budget: 2-attempts
---
## Why

Report GH-17, from a second adopter. Forbid
wins over scope, which is right. So a `scope+=` amendment for a path inside a forbid glob is a no-op,
and two cards in a row were refuted on scope after the brain had "approved" such amendments. The only
working fix was a `forbid-=` that removed the blanket glob and re-added an explicit list. The brain
discovered this only after the worker finished.

## Done when

- A pure helper in hooks/lib/brief.ts, `scopeInsideForbid(scope: string[], forbid: string[])`, returns
  the scope entries that are entirely covered by a forbid glob. Use the matcher semantics the verifier
  already uses (`pathMatchesAny` in hooks/lib/verify-native.ts: `*` crosses folders, `**` is `*`, `?` one
  char, a trailing `/` means everything under). "Entirely covered" means: the scope glob's literal prefix
  (up to its first wildcard) matches the forbid glob, or the scope entry is a literal path that the
  forbid glob matches. Keep it conservative: when unsure, do not warn.
- When `/dispatch` renders a brief header, each covered entry is named once in the dispatch output:
  `warning: scope entry X is inside forbid Y and can never be touched; shrink the forbid (forbid-=) to
  allow it`. The dispatch still proceeds.
- A hand-back `[[amend v=1 scope+=P …]]` where P lies inside a forbid glob of the effective brief is
  treated like a `-=` block: not applied, and the verdict row says
  `amend needs approval: scope+=P lies inside forbid Y; scope+= alone does nothing, shrink the forbid`.
  Today `amendNeedsApproval` in hooks/lib/brief.ts decides approval by operator only; extend it to take
  the effective forbid list.
- README.md, under Amend: one sentence, "to allow a path under a forbid glob you must shrink the forbid
  with forbid-=; scope+= alone does nothing", plus the warning line.
- CHANGELOG.md gets an Unreleased entry naming GH-17.
- Red then green; `claude plugin validate .`, the node suite and `claude plugin test .` are green in your
  worktree (quote their last lines in your hand-back; only `node` is in the gate map).
