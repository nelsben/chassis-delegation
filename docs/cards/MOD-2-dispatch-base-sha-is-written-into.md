---
id: MOD-2
title: dispatch base=<sha> is written into the brief header even when the brief already exists, so the worktree's cut point and the verifier's base are always the same ref
domain: mod
tier: standard
status: merged
scope: [hooks/lib/dispatch.ts, hooks/lib/brief.ts, hooks/register.ts, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/lib/verify-native.ts, hooks/lib/gitguard.ts, hooks/lib/card.ts, hooks/lib/setup.ts, hooks/lib/scheduler.ts, hooks/lib/attempts.ts]
red_test: pure tests: setting base on a header text without base= and on one with base=<old> each yield exactly one base= carrying the new value with the rest of the text byte-identical; engine tests in tests/hooks.test.ts: a dry run writes a brief without base=, a dispatch of the same task with base=<sha> leaves the header carrying base=<sha> and prints the reuse line naming it, and a hand-back whose delta holds a file changed between origin/main and <sha> holds scope; red first
gate: validate, node, test
budget: 2-attempts
spend: 8
---
## Why

Public issue #37 (the first adopter, 2026-10-10): a stacked task was dispatched with base=<sibling branch head> after its card had been dry-run, so its brief existed and was "reused, not overwritten"; dispatch printed a note that the reused brief has no base= and the verifier would diff against origin/main, then cut the worktree from the requested base anyway. Both attempts were refuted on scope for the sibling's own files, the whole budget went, and the brain took correct work by hand. Dispatch knows the base it cut from; a reused brief must not make the verifier forget it. Today the base reaches the header only when dispatch writes the brief (hooks/lib/dispatch.ts) and the verifier reads header.fields.base (hooks/register.ts).

## Done when

- dispatch with a base (the tool's base, or --base on the command) against an existing brief sets or replaces base=<sha> in that brief's header and says so on the reuse line ("reused, base= set to <sha>" or "reused, base= replaced <old> → <new>") in place of the note that the verifier diffs against origin/main; amend blocks and the body of the brief are left byte-identical
- dispatch with no base against a reused brief that carries base= cuts the worktree from that base, so the cut point and the verifier's base are the same ref in every case
- at hand-back the verifier diffs merge-base(<base>, sha)..sha from the header's base, so a file changed between origin/main and <base> is not an out-of-scope path
- the header rewrite is a pure function (set or replace one field in a brief header, everything else untouched) in hooks/lib/brief.ts or hooks/lib/dispatch.ts
- README's dispatch section names the rule: the brief's base= is the cut point and the diff base, and a dispatch that names a base writes it
