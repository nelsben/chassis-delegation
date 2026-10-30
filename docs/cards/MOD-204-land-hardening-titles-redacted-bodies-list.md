---
id: MOD-204
title: Land hardening: titles redacted, bodies list only overlapping cards, land_plan resume matches by slug and open issue, verdict comments deduped across reloads
domain: mod
tier: standard
status: merged
scope: [hooks/lib/land.ts, hooks/register.ts, tests/land.test.ts, tests/verdicttool.test.ts, CHANGELOG.md]
forbid: [hooks/lib/ghguard.ts, tests/ghguard.test.ts, hooks/lib/allow.ts, hooks/lib/landnudge.ts, docs/cards/**]
red_test: claude plugin test . (tests/land.test.ts and tests/verdicttool.test.ts: the redacted-title, overlap-only body, changed-cards resume and reload dedupe cases fail now)
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

A review of 0.9.34-0.9.35 found four defects in land and the status comments. Issue titles go to gh unredacted while bodies are redacted. Every landed body lists every open card, which leaks unrelated work titles into public issues and makes the MOD-198 resume compare unequal whenever a card changes between preview and confirm, so a retry after a partial failure files duplicates (the -2/-3 landed files from the #291 tree are the symptom). The verdict comment dedupe is an in-memory Set, so a reload re-posts it.

## Done when

- Titles: landWith and planWith in hooks/register.ts pass every title through redact(title, rules) with the same rules as the body before fileOne, before the printed dry-run gh line, and before the slug is computed. A test files a land whose title holds a redact-list word and asserts the gh argv title has it replaced.
- Bodies: landedBody in hooks/lib/land.ts lists under `## Landed from` only the open cards whose scope holds one of the item's paths (the contained() overlap parentHint uses), and omits the section when none overlaps or the item has no paths. Unrelated open cards never appear. land.test.ts covers both.
- Resume: in planWith, before writing an item's body, the mod looks for the item's slug file and its `-<n>` copies under .delegation/landed/; when the newest of them ends in an `issue: #n url` line and that issue is still OPEN (read with the existing allowlisted `gh issue view <n> --repo <landRepo> --json number,title,state,labels,body,subIssues` shape), the item is reused (`already filed #n url title`) whatever the body now says; a CLOSED or unreadable issue means the item is filed anew as today. A test changes the open cards between a partial-failure call and the retry and asserts no second create for the items already filed.
- Verdict comment dedupe: before posting a verdict status comment the mod checks whether `.delegation/status/<id>-attempt-<n>-verdict.md` already exists and ends in a `posted:` line; after a successful comment it appends `posted: <ISO time>` to that file. The in-memory Set may stay as a fast path. A test posts once, simulates a reload (fresh module state, same files), calls the verdict again and asserts one gh issue comment in total. The started comment gets the same file check.
- A short comment beside the module-level landRepo in register.ts says it is set by land, tree, status and merge finish, persists for the session, and that the worker gh guard (not the allowlist) is what keeps workers from the close and comment shapes.
- CHANGELOG.md gains Fixed entries under `## Unreleased` naming MOD-204. validate, the node tests and the engine suite pass.

## Review

Attempt 1 refuted on scope (tests/node/land.node.mjs, the pure test pinning the old body); amend approved after reading it, re-verified consistent. Titles redacted, bodies list only overlapping cards, resume matches by slug and an open issue, status comments deduped by a posted: line in their file. CHANGELOG conflict with MOD-203 resolved by keeping both entries. Accepted limits: the reload test seeds files instead of re-registering; an unfiled item whose body changed still gets a -2 copy.
