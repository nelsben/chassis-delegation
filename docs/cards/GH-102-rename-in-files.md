---
id: GH-102
title: A moved file is listed once, at its new path: the verifier's delta collapses a rename
domain: mod
tier: standard
status: merged
scope: [hooks/lib/verify-native.ts, hooks/lib/allow.ts, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/register.ts]
red_test: a case in tests/node/verify-native.git.node.mjs where a worker commit does `git mv a/x.md b/x.md` and reports files=b/x.md: held (red because the delta today lists a/x.md and b/x.md); and a table case in tests/verifynative.test.ts for the diff output with a rename line
gate: validate,node,test
budget: 2-attempts
---
## Why

Public issue #6, seen on this repo (GH-100 moved five folders with `git mv`). The worker listed every
moved file at its new path. The verifier's delta (`git diff --name-only <base>..<sha>`) listed each
rename as the old path and the new path, so every old path read as omitted and the hand-back was
refuted while the work was right.

## Done when

- The delta uses git's rename detection and names a moved file once, at its new path:
  `git diff --name-only -M <merge-base>..<sha>` (or `--name-status -M` parsed so an `R` line yields the
  new path). hooks/lib/allow.ts admits the `-M` flag on `diff` (and `--name-status` if used), nothing
  else new. The repo=here dirty-tree path already treats a rename as its new path; keep both consistent.
- A worker that lists BOTH old and new paths is not refuted either: an old path of a detected rename is
  dropped from `files=` before comparing, and the held line says `(1 rename collapsed)`.
- README: the `files` row says a moved file is listed at its new path. CHANGELOG (GH-102, closes public #6).
- Save red output to `.delegation/GH-102/red-1.txt`, name it `red=`. Three gates with {worktree}.
