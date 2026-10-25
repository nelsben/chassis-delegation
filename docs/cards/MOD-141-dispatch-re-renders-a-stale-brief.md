---
id: MOD-141
title: Dispatch re-renders a stale brief: an existing brief is rewritten from the card when the card or the --scope/--forbid flags would change it (refused, with the reason, while a worker on the task is live), and the forbid/done-when warning prints the forbid list to pass back
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/card.ts, hooks/lib/dispatch.ts, tests/**, docs/guide.md, CHANGELOG.md]
forbid: [docs/cards/**, bin/**, hooks/templates/**, .chassis-delegation.json, .claude-plugin/**, README.md, docs/upgrading.md, hooks/lib/verify-native.ts, hooks/lib/brief.ts]
red_test: engine test: write a card, dispatch --dryRun (brief written), edit the card's scope, dispatch again: step 2 reads `brief … rewritten: the card changed` and the brief header carries the new scope; at base it reads `exists — reused, not overwritten` with the old scope. Red first
gate: validate, node, test
budget: 2-attempts
spend: 8
---
## Why

Issue #232: dispatch reuses an existing brief and says only "(--scope/--forbid not applied to it)", so the flags meant to fix a card's scope do nothing and the worker starts from the stale header; the only remedy is editing the brief by hand (the brain in this repo deletes the brief after every card edit for the same reason). A brief is a rendering of the card plus the dispatch flags, so it should follow them.

## Done when

- hooks/register.ts runDispatch, worktree and repo=none modes (repo=here keeps today's path): when a brief exists, the brief the current card and flags would render is computed; when its text differs from the file (header or body) and no worker on this task is live (running, starting or pending a verdict in the live state), the file is overwritten and step 2 reads `2. brief <path> rewritten: <reasons>`, reasons from `the card changed`, `--scope applied`, `--forbid applied`, comma-joined. When the text is the same, step 2 reads as today, `exists — reused, not overwritten`, with no `(--scope/--forbid not applied to it)` suffix.
- With a worker on the task live, a dispatch whose brief would differ is refused before the worktree step with `<ID>: a worker on <ID> is live and reads <brief path>; its brief is not rewritten under it. Wait for its hand-back, then dispatch again` and nothing else is done; a dispatch whose brief would not differ behaves as today.
- The MOD-2 base= rewrite of a reused brief keeps working (a base flag on an otherwise unchanged brief still only sets base=), and a brief written by hand with no card behind it (the manual route) is never rewritten: only a brief whose header task= names a card dispatch can read is re-rendered.
- hooks/lib/card.ts: when forbid covers paths the done-when names, the warning gains one more line, ` fix: forbid=<the forbid list with each glob that covers a named path removed, comma-joined>` (or `fix: forbid= (none left)` when every glob goes), so the brain can pass it back to dispatch as --forbid.
- Tests: engine tests in tests/ for (1) a card edited after its brief was written: dispatch rewrites it and says `the card changed`; (2) --scope and --forbid on an existing brief: both applied and named, and the brief header carries them; (3) the same card and no flags: reused, not overwritten, no suffix; (4) a live worker on the task and a changed card: refused with the line above, no worktree cut; (5) a hand-written brief with no card: reused, never rewritten; (6) a base flag on an unchanged brief: only base= changes. A pure test in tests/node for the `fix: forbid=` line, including the none-left case.
- docs/guide.md (Dry-run warnings and the dispatch step) and CHANGELOG.md Unreleased (one Fixed entry, closing the same-repo stale-brief case) say the brief follows the card and the flags, and when it is refused. Wording generic: no product, repo, person, path or session names.

## Review

Attempt 1 consistent at e847c89; the brain resumed it before merge because the re-render took budget= from the card and so undid the hand-raised budget the stop line advises (verify.ts "raise budget= in <brief> to continue"). Attempt 2 consistent at 17bce95 (validate, node 1084, engine 1596): the existing brief's budget= is carried into the re-rendered header, so a budget-only difference is no rewrite. The brief re-renders for worktree and repo=none modes when the card or --scope/--forbid change it, refuses while a pending attempt is live, keeps appended amend blocks, and never rewrites a brief whose header task= is not this task. forbidFix prints `fix: forbid=…`. Flags absent mean the card's values: a brief once written with --scope is re-rendered back to the card's scope on a flagless dispatch (the guide says to pass the same flags). GH-103 and crossbrief (c) tests updated to the new behaviour.
