# Task cards

One file per task: `docs/cards/<ID>-<slug>.md`, YAML frontmatter, then the spec
in markdown. `<ID>` is `<PREFIX>-<number>[letter]`: OPS-12, BE-101, FE-7b. The
brain (the main model) dispatches a card with the `dispatch` tool, or you do
with `/dispatch <ID>`; chassis-delegation writes the brief, cuts the worktree,
picks the model tier, spawns the worker and verifies what it reports.

```yaml
---
id: OPS-12
title: One line that says what done looks like
domain: ops
tier: standard
status: queued
scope: [src/feature/**, docs/feature.md]
forbid: [src/secrets/**]
red_test: npm test -- feature.test.ts
gate: test
budget: 2-attempts
---
```

| Field | What it means |
| --- | --- |
| `id:` | the task id; the file name starts with it |
| `title:` | one line, the outcome |
| `domain:` | one of the repo's domains (`domains` in .chassis-delegation.json; default frontend, backend, ops, dispatcher, cross, shared); the branch is `agent/<domain>/<id>` and `agentTypes` maps it to the subagent type |
| `tier:` | economy, standard or frontier: haiku, sonnet, opus by default (`tierMap`) |
| `status:` | `/dispatch` takes `queued` or `claimed`; anything else (`template`, `merged`) is refused |
| `scope:` | globs the worker may change (`*` crosses folders; a trailing `/` means everything under it) |
| `forbid:` | globs it must not touch |
| `red_test:` | the test that fails before the change and passes after |
| `gate:` | gate ids from `gateMap` (comma-separated); the verifier re-runs them in the worker's worktree |
| `budget:` | `<n>-attempts`: spawns plus resumes before the task is handed back to you |

Below the frontmatter, write the card as you would brief a colleague: why, what,
and how you will know it is done. The worker reads it verbatim inside its brief.

A worker ends its hand-back with one line,
`[[report v=1 task=<id> subtask=main branch=<branch> pr=none sha=<sha> gate=pass|fail files=<a,b>]]`,
and when it had to touch a file outside its scope, an amend block on its own line,
`[[amend v=1 scope+=<path> reason=<one line>]]`, which the mod appends to the brief
before verifying (`scope-=` / `forbid-=` wait for your approval).
