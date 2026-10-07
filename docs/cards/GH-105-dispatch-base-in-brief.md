---
id: GH-105
title: A dispatch given --base <sha> writes base= into the brief, so the verifier diffs against the base the worktree was cut from
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/dispatch.ts, hooks/lib/verify-native.ts, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/lib/scheduler.ts, hooks/lib/gitguard.ts]
red_test: an engine test in tests/hooks.test.ts where /dispatch T-4 --base <40-hex sha> --scope a/** writes a brief whose header carries base=<sha>, and a hand-back whose branch adds one file on top of a base commit that itself changed a forbidden path is verified on scope and files (red: today the header has no base= and the verifier diffs against origin/main)
gate: validate,node,test
budget: 2-attempts
---
## Why

Public issue #14. A consumer card was stacked on an unpushed sibling: dispatched with `base=<sha>`, the
worktree was cut from that sha as asked, the worker changed only its own files, and the verdict was
`refuted on scope (out-of-scope path: <a file from the base commit>)`. The verifier took the delta
against `origin/main`, so everything in the base counted as the worker's change.

On main today: `runDispatch` passes `base=` into `renderHeader` only for repo=here. The verifier already
honours a brief's `base=` (GH-16: brief `base=` > `baseRef` > the origin/main chain), so the gap is only
that a worktree dispatch with `--base <sha>` never writes it.

## Done when

- `/dispatch <ID> --base <ref>` and the tool's `base` write `base=<ref>` into the header whenever the
  base is not the default `origin/main` (worktree mode and repo=here alike). A reused brief keeps its own
  header; when it has no `base=` and this dispatch names one, the dispatch output says
  `note: the reused brief has no base=; the verifier diffs against <chain>` rather than rewriting it.
- The verdict's scope line names the base it diffed against, e.g.
  `claim scope: held — every changed path since <base short> is within …`. Keep the wording otherwise.
- `--verify <sha>` (GH-104) takes its delta from the same base.
- README (the brief header fields, the `--base` flag) and CHANGELOG (GH-105, closes public #14).
- Save red output to `.delegation/GH-105/red-1.txt`, name it `red=`. The gate map runs the three gates.
