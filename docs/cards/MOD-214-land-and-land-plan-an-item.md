---
id: MOD-214
title: land and land_plan: an item can be filed as already done, closed at once with its evidence
domain: mod
tier: standard
status: merged
scope: [hooks/lib/land.ts, hooks/register.ts, tests/land.test.ts, tests/node/land.node.mjs, docs/guide.md, CHANGELOG.md]
forbid: [hooks/lib/allow.ts, hooks/lib/version.ts, .claude-plugin/plugin.json, docs/cards/**]
red_test: claude plugin test . (tests/land.test.ts closed-item cases fail now)
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Adopter feedback: backfilling an existing codebase means most stories are already shipped, but land and land_plan file everything open, so a backfill opens about 100 issues and then needs about 100 manual closes.

## Done when

- land (`--closed <evidence>`) and each land_plan item (`close: "<evidence>"`) take an optional evidence text. On confirm the issue is filed as today, then closed with the existing allowlisted `gh issue close <n> --repo <landRepo> --comment <text>` shape, the comment being `done before filing: <evidence>` passed through the redact rules. No new gh shape; the mod writes nothing to the Project (GitHub's built-in closed → Done workflow moves the item).
- In land_plan, children are filed and closed first; a parent item with close is closed only when every child of it in the plan is closed, else it stays open and the result says `#n left open: k open children`. A child with close under a parent without close leaves the parent open.
- The preview marks such items `(filed closed: <evidence>)` and runs no gh. A retry after a partial failure reuses an already-filed item (MOD-207 rules) and closes it if it is still open and the plan says close; a closed one is left as is.
- A failed close is reported once in the result (`close #n failed: ...`) and not retried silently; the landed file gains a `closed: <ISO time>` line after a successful close.
- Tests in tests/land.test.ts cover: land --closed files then closes with the redacted comment; land_plan with all children closed closes the parent; one open child keeps the parent open; preview runs no gh; a retry closes an open reused item; a failed close is reported.
- docs/guide.md documents both forms in one short paragraph. CHANGELOG.md gains Added entries under `## Unreleased` naming MOD-214. validate, the node tests and the engine suite pass.

## Review

Consistent on attempt 1 (sonnet, $0.56). land --closed / closed and land_plan close: file, then close with the existing shape and a redacted "done before filing: <evidence>"; children closed before the parent, a parent with close stays open while any task is open; preview runs no gh; a retry closes an open reused item and reuses an already-closed one when the plan says close (extends MOD-207's open-only reuse for that case only); landed file gains closed:. Empty or non-string evidence refused.
