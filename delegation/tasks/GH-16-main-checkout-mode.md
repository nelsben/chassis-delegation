---
id: GH-16
title: repo=here, a main-checkout mode: no worktree, no fetch, a configurable base ref, the dirty-tree delta minus ignore= and other in-flight cards' files
domain: mod
tier: frontier
status: merged
scope: [hooks/lib/brief.ts, hooks/lib/dispatch.ts, hooks/lib/verify-native.ts, hooks/lib/verify.ts, hooks/lib/repoconfig.ts, hooks/lib/allow.ts, hooks/lib/norepo.ts, hooks/register.ts, templates/brief.md, types/**, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, agents/**, hooks/lib/handback.ts, hooks/lib/scheduler.ts, hooks/lib/gitguard.ts, hooks/lib/init.ts]
red_test: an engine test in tests/hooks.test.ts where /dispatch --here on a card writes a brief with repo=here, cuts no worktree, runs no fetch, and spawns with cwd=<root>; and a pure test in tests/verifynative.test.ts where a repo=here report's files= is compared against the dirty-tree delta minus ignore= globs and minus another in-flight card's files (red: neither exists)
gate: node
budget: 3-attempts
---
## Why

Three adopter issues are one feature seen from three sides:

- **GH-16**: local-only repos with no `origin`,
  code in a nested gitignored child repo, evidence (traces, results) that exists only in the main
  checkout and would vanish with a worktree. They never reached `/dispatch`; they rebuilt the protocol
  by hand in the main checkout. They ask for (1) an opt-in main-checkout mode: no worktree, no
  `origin/main`, base = current HEAD, files= checked against the dirty-tree delta minus ignore globs;
  (2) a configurable base ref when there is no remote; (3) a documented way to run in a nested child
  repo (dispatch from the child's root; the parent's config not consulted).
- **GH-19**: with two or three workers in one
  checkout, the whole-tree delta contains the other workers' files and the files= claim fails with
  "omits …". They added an `ignore=` header field (globs subtracted from the delta) and want the mod to
  also subtract the union of files= claimed by other in-flight cards, report what it subtracted, and fail
  loudly when two in-flight cards have overlapping scope globs.
- **GH-10**: the delta is always against
  origin/main, so a worker that rebased onto a sibling branch was refuted on scope for commits it did
  not make. They want the base the brief names, settable by the brain.

The existing `repo=none` (hooks/lib/norepo.ts: no git at all, gate only) is the far end of this; `repo=here`
is the middle. Read hooks/lib/norepo.ts, the verify-native base logic, and runDispatch first.

## Done when

- **Config.** `.chassis-delegation.json` and `/config` gain `baseRef` (string; default `""` = today's
  chain origin/main → main → origin/master → master; a value such as `main` or `HEAD` is used as given)
  and `ignore` (array of globs always subtracted from a repo=here delta; default `[".delegation/**"]`).
  hooks/lib/repoconfig.ts parses and validates them like the other keys.
- **Card and dispatch.** A card may say `repo: here`; `/dispatch` and the tool accept `--here` to force
  it. In that mode the dispatch writes the brief with `repo=here` (and `base=<ref>` when baseRef is set,
  and `ignore=<globs>` = config ignore ∪ the union of files= claimed so far by other in-flight cards
  from the store), runs NO fetch and NO worktree add, and spawns with cwd = the session root. The brief
  template tells a repo=here worker: you share the checkout with the brain and maybe other workers;
  touch only your scope; do not commit unless the card says so; report `branch=<current>` and
  `sha=HEAD` or the sha you committed. The output lines say `3. no worktree (repo=here): the worker
  shares <root>` instead of the worktree line.
- **Overlap check.** At dispatch, if any other in-flight card (store records without a verdict) has a
  scope glob that overlaps this card's scope (one glob's literal prefix matches the other glob, same
  conservative rule as scopeInsideForbid in hooks/lib/brief.ts), the dispatch is refused with a line
  naming both cards and both globs. `--force-overlap` lets it through with a warning.
- **Verify.** For `repo=here`: the tree is the session root (or `repo=<dir>` when given). The delta is
  `git status --porcelain=v1 --untracked-files=all -z` paths (both staged and unstaged, renames as the new
  path) when sha= is `HEAD` or `none`; when sha= is a real commit, the delta is `merge-base(base, sha)..sha`
  as today, with base = the brief's `base=` else baseRef else the chain. Then subtract the brief's
  `ignore=` globs (plus any `ignore+=` amend). Then subtract the union of files= of other in-flight
  cards (read from the store at verify time). Claims: `branch` held when it is the current branch;
  `sha` held when `HEAD`, `none`, or a resolvable commit; `scope` and `files` on the subtracted delta;
  `gate` runs at the root with the dirty tree allowed (the "dirty tree → unchecked" rule does not apply
  in repo=here; say so in the gate line). A new claim line `ignored: <n> paths by ignore=, <m> paths
  belonging to <CARD>, …` discloses every subtraction, before the files line.
- **Allowlist.** hooks/lib/allow.ts admits `git [-C <dir>] status --porcelain=v1 --untracked-files=all -z`
  and `git [-C <dir>] rev-parse --abbrev-ref HEAD` if not already; nothing else new.
- **Nested child repo.** README documents: run Claude Code with the child as the session root; the mod
  reads only `<root>/.chassis-delegation.json`; `init` there writes the child's files. One engine test
  shows the parent's config is not consulted when the root is the child.
- **Docs.** README: a "repo=here" section beside repo=none (what is and is not verified, the ignore and
  base rules, the overlap refusal, the nested-repo note), the config table rows, the brief header fields.
  CHANGELOG.md Unreleased entry naming GH-10, GH-16 and GH-19.
- Red then green; `claude plugin validate .`, the node suite and `claude plugin test .` are green in your
  worktree (quote their last lines; only `node` is in the gate map). Save your red output to
  `.delegation/GH-16/red-1.txt`.
