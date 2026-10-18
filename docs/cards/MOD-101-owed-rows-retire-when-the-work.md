---
id: MOD-101
title: Owed rows retire when the work lands by cherry-pick on the current branch, and /delegation accept takes several ids or --owed
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/attempts.ts, tests/hooks.test.ts, tests/attempts.test.ts, docs/guide.md, docs/internals.md, CHANGELOG.md]
forbid: [docs/upgrading.md, .claude-plugin/plugin.json, package.json]
red_test: npx tsx --test tests/hooks.test.ts (new tests for the cherry-pick retire and multi-id / --owed accept fail on main)
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

In a repo whose default branch is guarded, work lands on a long-lived working branch by cherry-pick, so the worker's sha never reaches origin/main and its owed row never retires (#158). The person then has to type /delegation accept once per row, 22 times in the reported case. The retire check should count a patch already on the current branch, and accept should clear many rows in one command.

## Done when

- The retire check (retireCheck / retirePatch) counts a worker sha as landed when its patch is on the session's current branch: `git cherry <current branch> <sha>` (or a patch-id match) shows no '+' line for the worker's commits since its base. A sha in origin/main still counts as before.
- A card whose status reads merged or landed in the working tree's card file retires its row, not only one read at origin/main.
- `/delegation accept A B C [note]` retires each named id's owed row and prints one line per id. An unknown or already-retired id says so on its line, and the others still retire.
- `/delegation accept --owed [note]` retires every owed row of the session and says how many it retired.
- Anything that is not a task id is read as the note, as today: `/delegation accept OPS-1 landed by hand` still means one id with the note 'landed by hand'. An id is a token shaped like an existing task id (PREFIX-N).
- Tests cover: a cherry-picked patch on the current branch retires; a sha whose patch is not on the branch stays owed; a working-tree card reading merged retires; multi-id accept; --owed; the single-id-with-note form unchanged.
- docs/guide.md (where /delegation accept is documented) and CHANGELOG.md (an entry under Unreleased naming #158) are updated.

## Review

Reviewed by the brain. retireProbe now also counts a worker sha as landed when its patch is on the session's current branch. git cherry is not allowlisted, so it uses `git log --cherry-mark --right-only --no-merges --format=%m%H HEAD...<sha>`: landed means at least one `=` and no `>`, and an empty list proves nothing. I checked the marks in a scratch repo: with one of two commits picked the output is `>`/`=`, and with both picked it is `=`/`=`. Like the ancestry check, it runs only for a consistent verdict, and only for the session's own repo. A card reading merged or landed retires its row, read from origin/main and then the working tree. /delegation accept takes leading id-shaped tokens plus a note and prints one line per id; `--owed` retires every owed row of the session. A first word that is not id-shaped is still the one id, as before. The brief's npx red command cannot load the engine-only test module; the red run is `claude plugin test .`, which has 4 new tests failing on main. The CHANGELOG conflict with MOD-102 was resolved by hand, keeping both entries. Closes #158.
