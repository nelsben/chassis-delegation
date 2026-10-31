---
id: MOD-217
title: Scope is charged only for paths the worker wrote: .delegation/** never counts, and a refute resting on others' changes costs no attempt
domain: mod
tier: standard
status: merged
scope: [hooks/lib/verify-native.ts, hooks/lib/norepo.ts, hooks/lib/attempts.ts, hooks/register.ts, tests/*.test.ts, tests/node/*.mjs, docs/contracts.md, CHANGELOG.md]
forbid: [hooks/lib/allow.ts, hooks/lib/version.ts, .claude-plugin/plugin.json, docs/cards/**]
red_test: claude plugin test . (the attribution cases fail now)
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Adopter feedback from 9 parallel cards: the outside-path snapshot and the shared-checkout delta are diffed at verdict time, so an edit the brain (or the mod itself) makes during a run lands on every running worker. A brain edit to a shared spec file refuted 8 cards on scope; the mod's own .delegation/<other-task>/files.txt counted as a forbid hit on another card; and each refute burned an attempt, exhausting a 2-attempt budget on a card whose output was correct.

## Done when

- Per-worker write log: the tool.call hook that already sees a worker's calls (e.agentId → spawnByAgent) records every path the worker writes — Edit, Write, MultiEdit, NotebookEdit file_path, and the paths bashWrites finds in a Bash command, resolved against the worker's cwd — into a store record keyed by the spawn, capped at 2000 paths. Reviewer spawns are unchanged.
- `.delegation/**` (under the repo root and under any worktree) is left out of every scope, forbid and outside delta, always.
- Attribution at verdict: for the outside delta (norepo outsideCheck) and for a repo=here (shared checkout) git delta, a changed path counts against scope or forbid only when it is in that worker's write log. Changed paths not in the log are listed on one line `changed during the run, not by this worker: <paths>` and never refute. A worktree card's in-repo git delta is unchanged (the worktree is the worker's own).
- A scope refute whose every offending path is unattributed cannot happen; a scope refute that rests on attributed paths still charges an attempt as today. When the log is empty but the delta shows writes (a worker whose writes were all through scripts the lexer cannot see), the paths are attributed to the worker as today, so nothing slips through unseen.
- Tests (engine): a brain edit to an outside file during a run does not refute the worker; the worker's own outside write still refutes; another task's .delegation/<id>/files.txt never counts; repo=here: a sibling worker's edit is listed as not by this worker and does not refute, the worker's own out-of-scope edit does and charges an attempt. A node test covers the pure attribution helper.
- docs/contracts.md (the verify section) says how attribution works in three sentences. CHANGELOG.md gains Fixed entries under `## Unreleased` naming MOD-217. validate, the node tests and the engine suite pass.

## Review

Consistent on attempt 1 after approving one amend (scope+=hooks/lib/retention.ts, 3 lines so the new delegation.writes.<agentId> key is pruned with its agent). Per-agent write log from Edit/Write/MultiEdit/NotebookEdit and bashWrites; .delegation/** never judged; outside and repo=here deltas charge only attributed paths, others listed as "changed during the run, not by this worker"; empty log attributes everything as before. Also leaves unattributed paths out of the files= comparison in repo=here. Residual risk: once a worker has logged any write, a file it produced only through a script the lexer cannot see (a build step) reads as foreign and is not refuted; worktree cards are unaffected.
