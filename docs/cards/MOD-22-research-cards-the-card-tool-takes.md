---
id: MOD-22
title: Research cards: the card tool takes repo none or here, scope may name an output folder outside the repo, the verifier checks that folder by a before-and-after listing, gates get {outdir}, and the report can carry artefacts= and metrics=
domain: mod
tier: standard
status: merged
scope: [hooks/lib/card.ts, hooks/lib/dispatch.ts, hooks/lib/brief.ts, hooks/lib/handback.ts, hooks/lib/verify-native.ts, hooks/lib/verify.ts, hooks/lib/norepo.ts, hooks/lib/gates.ts, hooks/lib/allow.ts, hooks/lib/paths.ts, hooks/register.ts, hooks/templates/**, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/lib/gitguard.ts, hooks/lib/brain.ts, hooks/lib/version.ts, hooks/lib/legacy.ts, bin/**]
red_test: pure tests: the card tool's card text carries repo: here; a scope list with /out/a/** and src/x.py yields outdir /out/a; a before/after listing that adds /out/a/n.txt and /out/b/m.txt with scope /out/a/** fails the scope claim naming /out/b/m.txt from the outside delta; a gate command with {outdir} is filled and allowed, one with any other change is refused; parsing a report with artefacts=a.gltf,b.png metrics=\"tris=1200,len_s=2.4\" gives both; the artefacts claim fails naming a missing file; engine tests in tests/hooks.test.ts: a repo=none card whose worker writes only under its outdir and names its artefacts is consistent, and one that also writes a file outside every scope entry is refuted on scope; red first
gate: validate, node, test
budget: 2-attempts
spend: 15
---
## Why

Public issues #32 and #33 (two adopter repos, 2026-10-09/10): research and extraction lanes write their outputs outside the repo (an exported model, renders, a sound file, notes), often need the live checkout and its running apps, have no test to turn green and nothing to commit. Neither fits a card today: the card tool reads as code, takes only repo-relative scope, and only dispatch knows repo=here. So those lanes ran as ad hoc Agent spawns, and claims nobody could check passed unchallenged: a report said a glTF validator passed when no validator was installed, and a hair lane claimed byte-identical output that nobody ran, and left scratch files inside the repo. A card with an output folder, artefact assertions and a gate run against that folder would have refuted both.

## Done when

- the card tool takes repo (worktree, the default; here; none) and writes it on the card; dispatch reads it from the card exactly as it reads --here today; the card tool's description gains one clause: research or extraction with outputs outside the repo: repo none or here, scope = the output folder
- scope and forbid may hold absolute paths and globs (a tilde is expanded); the first absolute scope entry is the card's outdir unless the card names outdir: itself; the brief header gains outdir=<abs> and scratch=<abs> (default: the system temp dir under chassis-delegation/<task>), and the brief template tells the worker to put helper files in scratch and never in the repo
- at dispatch the mod records a listing (relative path, size, mtime) of every absolute scope and forbid root; at hand-back it lists them again, and the scope claim covers both deltas: every git path within the repo scope and every changed outside path within an absolute scope entry and outside every absolute forbid entry; the claim names which delta a refute came from; a root that cannot be listed leaves the claim unchecked, never held
- a gate-map command may carry {outdir}, filled with the card's outdir at verify time, and the allowlist accepts it word for word with only {outdir} and {worktree} filled
- the report grammar gains optional artefacts=<comma list of paths, relative to outdir or absolute> and metrics="k=v,…"; an artefacts claim holds when each named path exists and is non-empty, fails naming the first missing one, and is absent when the report names none; metrics are recorded on the attempt and shown in the verdict detail, never judged
- repo=none and repo=here cards go through the same claims; README (a Research cards section with the hair-lane card from #33 as the worked example, scrubbed of personal paths), the contracts (brief outdir= scratch=, report artefacts= metrics=) and CHANGELOG
