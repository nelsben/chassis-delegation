---
id: MOD-144
title: Dispatch reads the session's own card first: a task id with a queued card in the session's card folder is dispatched from it even when the store remembers that id as a task for another repo, which only wins when the session has no card with that id
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, tests/**, CHANGELOG.md]
forbid: [docs/cards/**, bin/**, hooks/templates/**, .chassis-delegation.json, .claude-plugin/**, README.md, docs/upgrading.md, hooks/lib/verify-native.ts, hooks/lib/allow.ts]
red_test: engine test: with taskRepo(OPS-17) stored as a second repo whose OPS-17 card says status merged, and a queued OPS-17 card in the session's own folder, dispatch --dryRun writes the brief from the session's card; at base it answers `OPS-17 is status merged; /dispatch takes a queued or claimed card`. Red first
gate: validate, node, test
budget: 2-attempts
spend: 6
---
## Why

Issue #234: in one repo, five new queued cards were all refused as `status merged` because the store's task-to-repo record (delegation.taskRepo, written when an id was once delegated into another repo, or carried over by the bare-key migration) sent dispatch to the other repo's merged card of the same id. The card on disk in the session's own folder must win; the remembered repo is only a way to find a card the session does not hold.

## Done when

- hooks/register.ts locateTask, with no repo argument and not a replay: the session's own card folder (cfg.cardDir, then the .delegation/cards/<board> folders as today) is searched first. A card found there is the one dispatched; the stored taskRepo for that id is read only when the session's folders hold no card with the id.
- When the session's own card is used and a stored taskRepo names another repo, dispatch adds one note line `note: <ID> was once a task for <that repo path>; this dispatch is for the card in <tasks dir> (pass repo=<that path> for the other)` and overwrites nothing; when that dispatch cuts a worktree for the session's own repo, the stale taskRepo record for the id is deleted, so the verdict, merge and status paths stop resolving the id to the other repo.
- A dispatch that names repo= explicitly, a card whose own `repo:` field names a path, and a task with no card in the session's folders and a stored taskRepo all behave as today (the existing cross-repo tests stay green).
- The card tool's dry run follows the same order (it shares locateTask), so a freshly written queued card is never refused as merged because of another repo's history.
- Tests in tests/: (1) the #234 case: the store holds taskRepo(OPS-17) = a second repo whose card folder has OPS-17 with status merged, the session's own folder has OPS-17 queued: the card tool's dry run and dispatch both succeed on the session's card and print the note; (2) after that dispatch the stored taskRepo for OPS-17 is gone; (3) no session card and the stored taskRepo: dispatch goes to the other repo as today; (4) repo= given explicitly: unchanged. CHANGELOG.md Unreleased gets one Fixed entry. Wording generic: no product, repo, person, path or session names.

## Review

Consistent on attempt 1. With no repo= and a stored taskRepo, locateTask reads the session's own cfg.cardDir first; a card there wins, and the stored path comes back as staleRepo for the note. The worker deliberately left the .delegation/cards/<board> folders out of that first look: a board holds other repos' cards, so searching it first would break the no-session-card cross-repo case. The stale record is deleted only when a new worktree is cut for the session's own repo; reusing an existing worktree leaves it. The card tool's dry-run test passed at base too, so it guards against a regression rather than showing the fix; the dispatch dry-run test is the red. The rebase conflicted in CHANGELOG.md with MOD-146's entry; resolved by keeping both.
