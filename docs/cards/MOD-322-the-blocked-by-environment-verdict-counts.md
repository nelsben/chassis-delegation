---
id: MOD-322
title: The blocked-by-environment verdict counts a host refusal the tool.call chain never returned through: n at or above attempted, not equal
domain: mod
tier: economy
tier_reason: A one-token comparison change and one engine test modelled on existing cases; the site and the shape are named
status: merged
scope: [hooks/lib/identity.ts, hooks/register.ts, tests/node/blockedcount.node.mjs, tests/automode.test.ts, CHANGELOG.md]
forbid: [hooks/lib/allow.ts, hooks/lib/scheduler.ts, hooks/lib/verify-native.ts, hooks/templates/**, docs/cards/**]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/blockedcount.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

MOD-321 feeds hostRefusals from classic.PostToolUseFailure, which bumps n but not attempted, while the MOD-279 last-link hook counts attempted only after next(e) returns. A host refusal that never comes back through the chain (the case MOD-321 was cut for) therefore leaves n above attempted, and the verdict in hooks/register.ts (the `refused.n === refused.attempted` test beside blockedByEnvironment) still reads an uncommitted hand-back as unverified fabrication instead of blocked by environment.

## Done when

- hooks/lib/identity.ts exports `allRefused(n: number, attempted: number): boolean`, true when n is at least 1 and n is at or above attempted (a refusal seen only by classic.PostToolUseFailure bumps n and not attempted).
- hooks/register.ts: the blocked-by-environment condition at the verdict calls `allRefused(refused.n, refused.attempted)` in place of `refused.n >= 1 && refused.n === refused.attempted`; the rest of the condition (first set, no rate limit, no usable sha) and the note line are unchanged, and the note's count stays refused.n.
- tests/node/blockedcount.node.mjs (new) covers allRefused: (1,1) and (2,1) and (1,0) true; (0,0) and (1,2) false.
- tests/automode.test.ts gains one engine case: a worker spawned in default mode, one `$.classic.PostToolUseFailure` with the verbatim host refusal error for its agent id (as the MOD-321 PostToolUseFailure case does, with the same answerClassic bottom), no tool.call Bash from that worker, then a hand-back report with `sha=unknown` and `gate=pass`; the verdict row carries `blocked by environment` and the note line says `1 Bash call refused`. Model it on the existing MOD-279/281 blocked-verdict cases in tests/automode.test.ts.
- The existing MOD-281 case (one refused call and one that ran is not blocked) still passes unchanged.
- CHANGELOG.md gains one bullet under `## Unreleased` / `### Fixed` naming MOD-322, directly after the MOD-321 bullet with no blank line between them.
- The validate, node and test gates are green.

## Review

Diff read in full. identity.ts allRefused(n, attempted) = n >= 1 && n >= attempted; register.ts verdict condition calls it in place of the equality; the rest of the condition and the note are unchanged. Node test covers the five pairs; one engine case drives a classic PostToolUseFailure with no chain call and asserts blocked by environment with 1 Bash call refused; the MOD-281 cases are untouched. CHANGELOG bullet sits directly after MOD-321's. Verdict consistent at 6f6bdb0.
