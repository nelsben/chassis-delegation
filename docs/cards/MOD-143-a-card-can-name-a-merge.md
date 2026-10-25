---
id: MOD-143
title: A card can name a merge check: `merge_check:` in the card (or a repo `mergeCheckMap` entry for one of its gate ids) is a command merge runs in the worktree before it rebases, with {card}, {sha} and {worktree} filled in, and a non-zero exit refuses the merge naming the command and its output tail
domain: mod
tier: standard
status: merged
scope: [hooks/lib/card.ts, hooks/lib/mergecmd.ts, hooks/lib/repoconfig.ts, hooks/lib/configeff.ts, hooks/lib/configtable.ts, hooks/lib/gates.ts, hooks/register.ts, tests/**, docs/review-and-merge.md, docs/configuration.md, CHANGELOG.md]
forbid: [docs/cards/**, bin/**, hooks/templates/**, .chassis-delegation.json, .claude-plugin/**, README.md, docs/upgrading.md, hooks/lib/verify-native.ts, hooks/lib/allow.ts]
red_test: engine test: a card with `merge_check: node fail.cjs {card}` whose script exits 1 gets, from merge, `MOD-…: merge check failed: node fail.cjs {card} exited 1; nothing was rebased or committed`; at base the field is ignored and merge rebases and commits. Red first
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Issue #231, part 2: a card whose real proof is a device run (screenshots and a log the worker writes) can only say "merge refuses without the evidence folder" in prose, and the worker rightly cannot build that, because the merge path is the mod's. A per-card check that merge runs at the branch sha keeps the rule beside the proof and makes merge refuse on it.

## Done when

- hooks/lib/card.ts: a card's frontmatter may hold `merge_check: <command>` (one line); the card tool takes an optional `mergeCheck` string and writes it as that field; the dry run prints `merge check: <command>` after the gate line when one applies. A command that checkGateEntry (hooks/lib/allow.ts) would refuse as a gateMap entry is refused the same way at card write and at merge, with its reason.
- Repo config: `mergeCheckMap` (gate id → command) in hooks/lib/repoconfig.ts REPO_KEYS and types, hooks/lib/configeff.ts MAP_FIELDS (so it merges per key like gateMap), hooks/lib/configtable.ts (group Checking the work, a map, repo scope) and wherever gateMap's checker runs on load (entries it refuses are dropped with a load note, as gateMap's are). The card's own merge_check wins; else every mergeCheckMap entry whose id is in the card's gate list applies, in gate order.
- hooks/register.ts merge prepare (not --finish): before the rebase, each applicable check is split into words, `{card}`, `{sha}` (the worktree HEAD, full) and `{worktree}` (its absolute path) are replaced inside each word, and it runs by argv with cwd = the worktree and a 10-minute timeout. Exit 0 lets merge go on and its success line gains `merge check passed (<command as written>)`. Non-zero, a timeout or a spawn error refuses: `<ID>: merge check failed: <command as written> exited <code>; nothing was rebased or committed` plus the last 15 output lines, and the worktree, branch and card are untouched.
- Tests: pure tests in tests/node for placeholder filling (several in one word, none, an unknown `{x}` left as is) and the card-vs-map choice; engine tests in tests/ for (1) a card with `merge_check: node check.cjs {card} {sha}` whose script exits 0: merge proceeds and names the check, and the script saw the card id and the 40-hex sha; (2) the same exiting 1: refused with the output tail, nothing rebased (the worktree HEAD is unchanged); (3) a mergeCheckMap entry for gate id `smoke` applies to a card with gate `test, smoke` and not to one with gate `test`; (4) a card's own merge_check overrides the map; (5) a refused command is named at card write.
- docs/review-and-merge.md (a `### Merge checks` section: what runs, when, the placeholders, refusal) and docs/configuration.md (mergeCheckMap) describe it; CHANGELOG.md Unreleased gets one Added entry. Wording generic: no product, repo, person, path or session names.

## Review

Attempt 1 was consistent but its gate was red: the new mergeCheckMap /config row had no matching userConfig entry in .claude-plugin/plugin.json, which the card forbade (a scoping miss: a new option needs its manifest entry). An amend put plugin.json in scope, and attempt 2 added the entry, the options case and the 57 → 58 count fix; gate green at b1448f6. The merge check runs in mergePrepare after the card read and before the fetch and rebase. It is refused by the gate map's rule (checkGateEntry, with {card} and {sha} read as samples; no && chains). The allowlist takes exactly the one filled argv, only while that check runs (mergeCheckArgvs, cleared in finally); allow.ts is untouched. {worktree} is filled after the check, from the mod's own worktree path.
