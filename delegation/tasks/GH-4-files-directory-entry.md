---
id: GH-4
title: A trailing-slash directory in files= matches the files under it instead of refuting
domain: mod
tier: standard
status: merged
scope: [hooks/lib/verify-native.ts, hooks/lib/verify.ts, tests/**, CHANGELOG.md, README.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, agents/**, hooks/register.ts]
red_test: a case in tests/verifynative.test.ts (and the node suite if filesClaim is reached there) where files=docs/img/ against a delta of docs/img/a.png,docs/img/b.png holds
gate: validate,node,test
budget: 2-attempts
---
## Why

Report GH-4. FE-230's worker listed a
folder, `files=…,docs/prfaq/img/,…`, for 27 images. `filesClaim` in `hooks/lib/verify-native.ts`
compares the list to the delta path by path and refuted on files while everything else held.

## Done when

- In `filesClaim` (or just before it), a `files=` entry ending in `/` expands to every delta path under
  that folder before the set comparison. A folder entry with nothing under it in the delta is still an
  invented path and is named. Everything else about the claim is unchanged: a missing or extra path is
  named, exact match holds.
- The held line says how many folder entries were expanded when any were, e.g.
  `claim files: held — files= matches the sha delta exactly (1 folder entry expanded)`.
- README.md's `files` row in the verification table says a trailing `/` stands for the files under it.
- CHANGELOG.md gets an Unreleased entry naming GH-4.
- The red test goes red then green; validate, the node suite and `claude plugin test .` stay green
  (the three 5D git-guard tests already failing on `{ text }` vs `{ result }` are not yours).
