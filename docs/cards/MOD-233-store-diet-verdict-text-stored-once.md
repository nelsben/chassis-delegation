---
id: MOD-233
title: Store diet: verdict text stored once, the outside fallback capped, session keys aged out — the store stays well under its 4 MiB cap
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/retention.ts, hooks/lib/norepo.ts, hooks/types/index.d.ts, tests/retention.test.ts, tests/norepo.test.ts, tests/harness.ts, tests/node/**, docs/internals.md, CHANGELOG.md]
forbid: []
red_test: tests/retention.test.ts: a recent.<old sid> key whose newest row is 15 days old is in the prune plan's delete list, and the live session's recent key is not (fails today: session keys carry no ts and are never planned)
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

The cross-session store is 3.94 MiB of a 4 MiB host cap: already past the 3.5 MiB pressure valve, so the valve is deleting young closed records. Measured: spawn records 1.26 MB (verdictBlock 681 KB + verdictLine 272 KB), postedRow 386 KB, two inline outside.* listings 614 KB, session-level keys (recent 177 KB of which ~117 KB is older than 14 days, friction 135 KB, merged 33 KB) that retention.ts never prunes because metas() gives them no timestamp. Only 2 of the 5 verdict write sites store the same text twice (register.ts near 2476 and 5683); the others store a full block and a different quiet line, so a blanket dedupe gains little. The mass is posted verdict text kept forever.

## Done when

- After a spawn's verdict has been posted (K.posted true) and its verdict is older than 24 h, the full prune drops verdictBlock, verdictLine and the postedRow value from that spawn record, leaving a one-line `verdictSummary` (the first line of the block); renderedOf and postedOf fall back to that summary. A record not yet posted, or younger than 24 h, keeps all three, so a repeat hand-back still replays the full block with its spawn text.
- At register.ts near 2476 and 5683, where verdictBlock and verdictLine are the same string, only verdictBlock is stored and the readers take the line from it; the sites near 5702, 5968 and 6042 are left as they are.
- The inline outside.* fallback (register.ts near 5164-5173, taken only when the listing file write fails) stores at most 200 entries per root and sets truncated: true; hooks/lib/norepo.ts RootListing gains that variant and outsideClaim treats a truncated listing as unchecked, never as clean or as newly added files.
- retention.ts metas() gives a timestamp to recent (newest array at), debrief (lastAt), merged (newest array at), notes (at) and friction (max of events[].at: ownTs learns to descend into events); these families use the 14-day RATION_RETAIN_MS branch. brain, postAsk and freshSession are left out of this card. RetentionInput gains keep: string[] (the live session's keys) which the plan never deletes.
- merged.<sid> gets a cap like recent's (newest 50 entries).
- The existing test 'a record with no timestamp is left alone, and so is every session-level and global key' (tests/retention.test.ts near 71) is rewritten for the new rule; adhoc, evals, alias and updateCheck stay in the never-pruned set.
- The spawn-record rewrite runs inside the full prune scan (not a separate scan at session.start) and is idempotent; MOD-243 later decides when that scan runs.
- docs/internals.md's line about session keys being 'kept and capped where written' says they are also aged out after 14 days; CHANGELOG.md gets an Unreleased line.
- Gates validate, node and test are green.
