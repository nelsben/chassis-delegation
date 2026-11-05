---
id: MOD-308
title: Each spawn and verdict ledger row carries the brief's hash, and a brief append writes an amend row, so a reader can tell which brief an attempt was judged against
domain: mod
tier: standard
status: merged
issue: 395
scope: [hooks/lib/brief.ts, hooks/lib/storeloss.ts, hooks/lib/attempts.ts, hooks/register.ts, tests/node/briefhash.node.mjs, tests/ledger.test.ts, tests/grant.test.ts, tests/harness.ts, docs/internals.md, CHANGELOG.md]
forbid: [hooks/lib/allow.ts, hooks/lib/scheduler.ts, hooks/lib/verify-native.ts, hooks/templates/**, docs/cards/**]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/briefhash.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

A brief can be appended to while its worker runs (a grant, or a by-hand append the worker picks up on a message), and nothing in the ledger says which version of the brief an attempt used. Issue #395. Today a spawn row records only briefPath, the verdict row spreads the attempt record, and appendAmends in hooks/lib/brief.ts writes the file silently.

## Done when

- hooks/lib/brief.ts exports `briefHash(text: string): string`: the first 12 hex characters of sha256Text (already exported by hooks/lib/land.ts, which is not changed) over the brief text.
- The attempt record (hooks/lib/attempts.ts) gains `briefHash?: string`, set at spawn from the brief text read then; spawnRow in hooks/lib/storeloss.ts adds `briefHash` only when set, like its other optional fields (tests/storeloss.test.ts line 222 asserts the row with toEqual and keeps passing).
- The verdict ledger row (the appendLedger call in finalizeOnce, hooks/register.ts line 7062 today) sets `briefHash` after the spread of the attempt record, from the brief re-read for that judgement (line 6301, after hand-back amends are applied), so a spawn row and its verdict row differ when the brief changed between them.
- Exactly two sites append an amend ledger row, right after they write the brief: applyHandbackAmends (hooks/register.ts line 6543 today, source worker) and the dispatch grant in dispatchOnce (line 8008, source brain). The row is `{kind:'amend', task, subtask, attempt, briefHash:<hash of the file after the append>, tokens:<the amend tokens as one string>, source, at, sessionId}`; `attempt` is the open attempt, else the latest, else omitted; the ledger dedupe key for an amend row is `amend|task|subtask|briefHash`. The dispatch re-render and rewrite of a brief writes no amend row.
- The verdict row text printed to the person is unchanged.
- tests/node/briefhash.node.mjs (new, required) covers briefHash determinism and length and the amend row key; tests/grant.test.ts gains one engine case: a grant appended between spawn and verdict gives a spawn row, an amend row and a verdict row, with the spawn and verdict hashes different and the amend hash equal to the verdict hash; tests/ledger.test.ts gains one case that a plain spawn and verdict with no amend carry the same hash.
- docs/internals.md, the ledger row shapes (lines 80 to 90 today), names briefHash on the spawn and verdict rows and adds the amend row.
- CHANGELOG.md gains an `### Added` heading above `### Fixed` under `## Unreleased` (if absent) with one bullet naming MOD-308 and #395.
- The validate, node and test gates are green.

## Review

Diff read in full. briefHash reuses sha256Text and takes the first 12 hex; the spawn record and spawn row carry the hash of the brief read at the spawn, the verdict row the hash of a re-read at the judgement, and a hand-back amend or a dispatch grant appends an amend row keyed by task, subtask and brief hash right after the write, with source worker or brain and the open attempt. The re-render writes no row and verdict text is unchanged. Pure node test plus grant and ledger engine cases. Verdict consistent at ebcfcda.
