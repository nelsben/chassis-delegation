---
id: GH-104
title: Spend guards: no tier escalation on no-report, a retry looks at the worktree before spawning, and the spawn notice shows the model and the attempt
domain: mod
tier: frontier
status: merged
scope: [hooks/register.ts, hooks/lib/verify.ts, hooks/lib/attempts.ts, hooks/lib/tier.ts, hooks/lib/dispatch.ts, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/lib/gitguard.ts, hooks/lib/handback.ts]
red_test: engine tests in tests/hooks.test.ts: (a) attempt 1 no-report then a respawn stays at the same tier (red: today it goes one tier up); (b) a respawn or resume of a task whose worktree has commits ahead of base and a clean tree is NOT spawned; the row says "work present at <sha>: verify it" with next=verify; (c) the spawn notice reads "tier=standard → sonnet (brief) · attempt 2/3"; red first
gate: validate,node,test
budget: 3-attempts
---
## Why

Public issue #10 (P1, spend), from the first adopter on the 0.2.0 copy. One Sonnet-sized task cost about
$15: the first worker finished it but its report was read as no-report (fixed in 0.3.0); the retry was
spawned one tier up at Opus as attempt 2 because of that misread; the queue drained two refused by-hand
spawns as well, three workers in one worktree, one editing the test file under another. The brain only
saw the Opus spawn in the verdict, after $9.98.

## Done when

- **No escalation on no-report.** `escalationSource` in hooks/lib/attempts.ts and `advise` in
  hooks/lib/verify.ts treat `no-report` as a reporting defect: the first no-report advises a resume (as
  today), a second advises a respawn at the SAME tier, never one up. Escalation stays for `refuted` and
  for a confirmed `gate=fail`.
- **Look before you respawn.** Before any respawn or auto-resume of a briefed task, read the worker's
  worktree (worktree mode) through the allowlisted git reads: commits ahead of the base and a clean tree.
  When both hold, do not spawn; post `work present at <short sha> on <branch>: verify it (next=verify
  sha=<sha>)` and record the attempt as `work-present`. The brain can then hand the report line to the
  verifier by hand or dispatch `--verify <sha>` (add that flag: it runs the native verifier on the
  branch head with a synthetic report naming the delta, no spawn). In repo=here mode, skip this check.
- **The notice says what it is spawning.** `noticeText` in hooks/lib/tier.ts appends ` · attempt <n>/<b>`
  for a briefed spawn, and the dispatch output line 4 reads `spawned <type> agent <id> on <model> ·
  attempt <n>/<b>`. The debug line keeps the tier source.
- **Drain dedupe is GH-101's**; do not duplicate it. If GH-101 is not yet on your base, note the
  dependency in your hand-back.
- README (escalation paragraph, the new `--verify` flag) and CHANGELOG (GH-104, closes public #10). Save
  red output to `.delegation/GH-104/red-1.txt`, name it `red=`. Three gates with {worktree}.
