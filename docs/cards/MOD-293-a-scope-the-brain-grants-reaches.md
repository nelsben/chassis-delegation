---
id: MOD-293
title: A scope the brain grants reaches the verifier: dispatch takes amend= to append scope+=/forbid-= to the brief, a hand-back amend already in scope is reported granted, and a scope+= under a forbid entry is refused at the brief naming the entry
domain: mod
tier: standard
status: merged
issue: 389
scope: [hooks/register.ts, hooks/lib/brief.ts, hooks/lib/dispatch.ts, hooks/lib/verify.ts, hooks/lib/verify-native.ts, hooks/lib/verdicttool.ts, hooks/lib/quiet.ts, .claude-plugin/plugin.json, docs/configuration.md, docs/guide.md, tests/node/grant.node.mjs, tests/grant.test.ts, tests/harness.ts, CHANGELOG.md]
forbid: [hooks/lib/allow.ts, hooks/lib/ghguard.ts, hooks/lib/scheduler.ts, hooks/lib/configeff.ts, docs/cards/**]
red_test: node --test tests/node/grant.node.mjs (fails now: the file does not exist; passes when a brain grant rewrites the header and a scope+= under a forbid is refused naming the entry)
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

The brain told a resumed worker in a message that two more files were in scope; the worker edited them and the verifier refuted the attempt on scope, because nothing said in a message is visible to it (#389). Separately, an amend the brain appended to a brief added a path under a directory the card's forbid still named; the parser accepted it and the verifier refuted attempt 2 on the forbid (#393). The brief is the only channel the verifier reads, so grants must be written there and checked there.

## Done when

- The dispatch tool and /dispatch take `amend` (a string of amend tokens, e.g. `scope+=hooks/lib/x.ts forbid-=hooks/lib/**`): it is parsed with parseAmends in hooks/lib/brief.ts, appended to the task's brief as one `[[amend v=1 ...]]` line with `reason=brain grant`, the brief header is rewritten with the new scope= and forbid=, and the tool prints the lines it appended; with `verify` or a spawn in the same call it is applied first. No worker is spawned by amend alone
- A hand-back `[[amend v=1 scope+=<p>]]` whose path is already inside the brief header's scope (because the brain granted it) is reported `amend granted: <p> already in scope` and the attempt is not refuted on scope for that path; a path not granted is still held for approval and refuted as today
- A `scope+=<p>` (from the brain's amend= or a hand-back amend the brain approves by appending) whose path sits under a forbid entry of the brief is refused at the brief with `scope+=<p> is under forbid <entry>; add forbid-=<entry> to lift it`, and nothing is appended; with the matching forbid-= in the same line it is accepted and the header's forbid= loses the entry
- The verdict tool's refute-on-scope line, when the touched path is in a hand-back amend, ends `grant it: dispatch task=<ID> amend="scope+=<p>" then dispatch verify=<sha>`
- Pure helpers (the grant check against the header's scope, the forbid-under check, the header rewrite) live in hooks/lib/brief.ts and are tested in a new tests/node/grant.node.mjs: a grant updates the header; a later hand-back amend for that path is granted; a path under a forbid without forbid-= is refused naming the entry; with forbid-= it is accepted
- An engine test in tests/ covers the dispatch amend= wiring once; every engine test imports test from tests/harness.ts; docs/configuration.md or docs/guide.md gains two sentences on dispatch amend=; the CHANGELOG gains one line under Unreleased / Added (#389, #393)
- hooks/lib/allow.ts, hooks/lib/ghguard.ts and hooks/lib/scheduler.ts are untouched; the validate, node and test gates are green

## Review

Brain review: applyGrant in brief.ts parses the tokens as one amend with reason=brain grant, computes the effective scope and forbid with the brief's held amends, refuses a scope+= under a forbid entry the same line does not lift (grantUnderForbidLine), else rewrites the header's scope=/forbid= and appends the block; grantedPaths lets a hand-back scope+= block whose paths are all already in the header's scope print `amend granted` instead of being held; dispatch gains amend= (tool and --amend) applied before the body, alone it spawns nothing, allowed beside verify; the scope-refute advice now also names the grant line. Amend approved: tests/dispatchtool.test.ts pins the tool schema. Known gap, by design of the card: a brief the brain appends to by hand is not checked against forbid, only dispatch amend= is; the guide now points at amend=. First attempt, $0.63.
