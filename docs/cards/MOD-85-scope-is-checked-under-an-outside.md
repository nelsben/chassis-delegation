---
id: MOD-85
title: Scope is checked under an outside folder too big to list: past 10000 files the dispatch records a time, and the hand-back flags every file and folder modified since
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/norepo.ts, tests/norepo.test.ts, tests/research.test.ts, tests/hooks.test.ts, docs/contracts.md, CHANGELOG.md]
forbid: [docs/cards/**, hooks/lib/allow.ts, hooks/lib/mergecmd.ts, hooks/lib/card.ts, hooks/lib/setup.ts, hooks/lib/init.ts, hooks/lib/version.ts, hooks/templates/**, bin/**, .claude-plugin/**, .chassis-delegation.json, README.md, docs/review-and-merge.md, docs/install.md, docs/guide.md, tests/merge.test.ts, tests/dispatchtool.test.ts, tests/allow.test.ts, tests/setup.test.ts]
red_test: a new case in tests/norepo.test.ts: outsideClaim given a dispatch watermark `{ root, since, files }` for a forbid root and an after-walk holding one file with mtime later than since fails the claim naming that file; on main RootListing has no watermark form and the claim is unchecked, so it fails; red first
gate: validate, node, test
budget: 2-attempts
spend: 6
---
## Why

Cards that forbid a large folder outside the repo come back unverified on scope (#146): listRoot stops at OUTSIDE_MAX_ENTRIES because the dispatch listing is kept in the store, so a forbid root of 30000 files is never compared and about seventeen cards in one session needed a by-hand review. Walking such a folder is fast; only storing its full listing is not. A dispatch time per big root, and a walk at hand-back for anything newer, checks the claim without storing the list.

## Done when

- WATERMARK AT DISPATCH. When a root's walk in listRoot passes OUTSIDE_MAX_ENTRIES at dispatch, recordOutside stores a watermark for that root instead of an error: a new RootListing form in hooks/lib/norepo.ts, `{ root, since, files }`, where `since` is the ms time taken just before that root's walk began and `files` the count walked (no per-file entries). The dispatch line names it: `<root> holds more than 10000 files, so changes there will be found by modification time`. A root under the cap is listed exactly as today, and a reused brief keeps whatever was recorded at its first dispatch (watermark included).
- HAND-BACK. For a root whose dispatch record is a watermark, outsideCheck walks it again with no 10000 cap but a hard ceiling of 1000000 entries (past it: the claim is unchecked, naming the root and the ceiling), links not followed, and takes as changed every file whose mtime is later than `since` and every folder whose mtime is later than `since` (a folder's time moves when an entry in it is added, removed or renamed, so a deletion shows as its folder). Those absolute paths go through the same forbid/scope classification as a listed root's delta; a changed folder counts as touching an absolute forbid or scope glob when the folder path, or the folder path plus `/x`, matches it (so `<root>/**` covers the folder). Nothing changed since: the claim holds for that root, with a detail that says it was checked by modification time.
- TESTS. Pure cases in tests/norepo.test.ts for outsideClaim/outsideCheck with a watermark root: a file newer than since under a forbid root fails the claim naming it; only a newer folder (a deletion) under a forbid root fails naming the folder; nothing newer holds; a walk past the hard ceiling is unchecked. An engine case in tests/research.test.ts: a brief whose absolute forbid root holds 10001 files at dispatch, then one file in it changed after dispatch, is refuted on scope naming that file; with nothing changed the scope claim holds instead of being unchecked. Existing outside-delta tests pass unchanged.
- DOCS. docs/contracts.md's sentence about a root that `holds more than 10000 files` says what happens now. CHANGELOG.md has an entry under `## Unreleased` above the latest version heading (create it if there is none). The three gates pass.

## Review

Attempt 1 (sonnet, $0.74) accepted as handed back. Read the watermark path end to end: at dispatch a root past 10000 files is stored as { root, since, files } with since taken before its walk; at hand-back the walk keeps only files and folders newer than since (the root itself included), folders are matched as the folder and as folder/x so root/** covers them, and a walk past 1000000 entries is unchecked. Same sensitivity as a full listing: anything else that writes under a forbid root during the run (an app, Finder's .DS_Store) refutes the card, so a card should forbid the narrowest folder that matters. The engine cases went to tests/hooks.test.ts, where the engine world helper lives. Rebased by hand onto MOD-87 (CHANGELOG: both Unreleased entries kept).
