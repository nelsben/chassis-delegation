---
id: GH-6
title: An inline [[brief]] header in an Agent prompt is verified from the header when no brief file exists
domain: mod
tier: frontier
status: merged
scope: [hooks/register.ts, hooks/lib/brief.ts, hooks/lib/dispatch.ts, tests/**, CHANGELOG.md, README.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, agents/**, hooks/lib/verify-native.ts]
red_test: a test in tests/hooks.test.ts where an Agent spawn carries a complete [[brief]] header inline and no brief file; its hand-back report is verified (a sha not on the branch is refuted), not posted as unverified with "no brief file named"
gate: node
budget: 3-attempts
---
## Why

Report GH-6. A follow-up worker spawned
with the Agent tool and a full `[[brief v=1 task=FE-232 subtask=e2e …]]` header inline was tiered
correctly, then on hand-back got `unverified (note: no brief file named in the prompt; verify skipped)`.
Its report carried a 40-hex sha that was a real short sha padded with invented digits; native
verification would have refuted it. Inline headers are the natural shape for a subtask and for any
brain that does not use cards.

## Done when

- When the spawn prompt carries a complete header (task, scope or scope_globs, and a gate or
  repo=none) and names no brief file, the spawn hook writes the header plus the prompt body to
  `<root>/.delegation/briefs/<task>.<subtask>.brief.md` (never overwriting an existing file) and
  records that path as the spawn's `briefPath`. Verification then runs as for any briefed spawn.
- An incomplete header keeps today's unverified line, which now says which field was missing.
- README.md's Contracts section says an inline header is enough and where its brief file lands.
- The red test goes red then green; `claude plugin validate .`, the node suite and `claude plugin test .` are green in
  your worktree (run validate and test by hand and quote their last line in your hand-back; only `node` is in the gate map).
- CHANGELOG.md gets an Unreleased entry naming GH-6.
