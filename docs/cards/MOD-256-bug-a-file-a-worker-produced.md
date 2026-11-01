---
id: MOD-256
title: Bug: a file a worker produced through a script it ran is not read as a foreign write
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/norepo.ts, hooks/lib/gitguard.ts, tests/norepo.test.ts, tests/scopesize.test.ts, tests/harness.ts, tests/node/**]
forbid: []
red_test: tests/norepo.test.ts or tests/scopesize.test.ts: a repo=here worker that logged one Edit and then wrote out-of-scope x.txt via a script is refuted on scope (fails today: read as foreign)
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Since MOD-217 scope is charged only for paths in the worker's write log (Edit/Write/MultiEdit/NotebookEdit plus bashWrites). Once a worker has logged any write, a file it produced only through a script the Bash lexer cannot see (a build step, a generator, `node script.mjs`) reads as 'changed during the run, not by this worker' and is not refuted, so an out-of-scope write by the worker can pass. Worktree cards are unaffected; repo=here and outside deltas are.

## Done when

- When a worker's Bash command is one the lexer cannot attribute writes for (it runs a script or binary rather than a recognised file-writing command), the mod snapshots the delta paths (git status --porcelain for repo=here, the outside listing for outside roots) before and after that command and adds paths that appeared or changed in between to that worker's write log.
- The snapshot is taken only for repo=here and outside cards, and only around non-read-only commands, so read-only Bash still does zero git.
- A path changed while no Bash of this worker ran is still listed as 'changed during the run, not by this worker'.
- Engine tests: a repo=here worker that writes an out-of-scope file via `node gen.mjs` after an earlier in-scope Edit is refuted on scope; another session's change during the run is not charged.
- Gates validate, node and test are green.
