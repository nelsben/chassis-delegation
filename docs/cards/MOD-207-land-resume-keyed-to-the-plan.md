---
id: MOD-207
title: Land resume keyed to the plan: a task is reused only under this run's feature, land on confirm reuses its preview file and resumes, preview runs no gh, gh repo clone is a read
domain: mod
tier: standard
status: merged
scope: [hooks/lib/land.ts, hooks/lib/ghguard.ts, hooks/register.ts, tests/land.test.ts, tests/ghguard.test.ts, tests/node/land.node.mjs, CHANGELOG.md]
forbid: [hooks/lib/allow.ts, hooks/lib/version.ts, .claude-plugin/plugin.json, docs/cards/**]
red_test: claude plugin test . (tests/land.test.ts cross-plan, preview and confirm cases; tests/ghguard.test.ts clone case fail now)
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

A re-review of 0.9.36 found MOD-204's slug-only resume can attach the wrong issue: a later plan with a task (or feature) of the same title reuses the earlier plan's open issue, which sits under the old feature. It also found land with landAuto off orphans its preview file (the confirm call writes <slug>-2.md) and has no resume after a create that timed out, that the preview call of land_plan runs one gh read per item, and that the gh guard now blocks gh repo clone.

## Done when

- land_plan feature reuse: every landed file land_plan writes ends (before any issue: line) with a `plan: <key>` line, the key being the feature title's slug plus `-` plus the first 8 hex of a sha256 of the sorted feature paths joined by commas (a pure helper planKey in hooks/lib/land.ts). The feature's prior file is reused only when it carries the same plan: key and its issue is OPEN; otherwise a new feature is filed.
- land_plan task reuse: a task's prior file is reused only when its issue is OPEN and that issue number is among the sub-issues of this run's feature, read once per run with the existing allowlisted `gh issue view <feature> --repo <landRepo> --json number,title,state,labels,body,subIssues` shape (a new feature has none, so every task is filed anew). The open check comes from that same read where it can; no new gh shape is added.
- land_plan preview (no confirm) runs no gh at all: an item with a prior issue: line prints `may reuse #n (checked on confirm)`.
- land on confirm (landAuto off, confirm: true, or /delegation land --confirm): it reuses the newest <slug>[-n].md that has no issue: line and whose body equals the new body, instead of writing a new copy; if the newest file with the same body ends in an issue: line whose issue is OPEN, land reports `already filed #n url` and files nothing (resume after a create that timed out). landAuto on keeps today's behaviour except that same resume check.
- gh guard (hooks/lib/ghguard.ts): `gh repo clone` and `gh repo view` are reads; `gh repo create|delete|edit|fork|rename|archive|sync` stay writes. tests/ghguard.test.ts covers clone and view allowed and create denied.
- Tests in tests/land.test.ts: two plans with different features and a task of the same title, the second files a new task issue; two features with the same title and different paths, the second files a new feature; a partial-failure retry of the same plan reuses its filed items; a land_plan preview runs no gh; land preview then confirm leaves exactly one landed file and files from it; land confirm after a timed-out create with an OPEN issue on the file reports already filed and runs no create. The pure planKey has a node test in tests/node/land.node.mjs.
- CHANGELOG.md gains Fixed entries under a `## Unreleased` heading at the top naming MOD-207. validate, the node tests and the engine suite pass.

## Review

Consistent on attempt 1 (sonnet, $0.69). Feature reuse keyed to a plan: line (title slug + sha256 of sorted paths); task reuse needs the prior issue to be an open sub-issue of this run's feature; land_plan preview runs no gh; land confirm reuses its unfiled same-body preview and reports already filed on an open issue; gh repo clone/view are reads. The MOD-204 retry test was updated to return subIssues, which task reuse now needs.
