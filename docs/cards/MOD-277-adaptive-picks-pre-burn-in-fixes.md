---
id: MOD-277
title: Adaptive picks, pre-burn-in fixes: both sides counted the same way, reporting defects left out, classes backfilled from card files, and exploration aimed at one target pair per class
domain: mod
tier: standard
status: merged
scope: [hooks/**, tests/**, docs/**, .chassis-delegation.json, CHANGELOG.md]
forbid: []
red_test: a new node test: an explored card refuted on attempt 1 and confirmed on attempt 2 counts as confirmed in cardOutcomes; fails today because explored cards count attempt 1 only
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

A Fable review of MOD-274/275 found that the default pair is judged on any attempt (97% on the real ledger) while an explored card counts only by attempt 1 (the default's own attempt-1 rate is 83%). That makes the comparison unfair by about 14 points and makes a good cheap pair need 32 or more flawless cards. No-report attempts count against the candidate only. No ledger row has a class, so the about 180 past default cards are thrown away. Standard cards split about 2 explored cards a day across two candidates. Fixing these before the burn-in month means the data gathered counts in full.

## Done when

- hooks/lib/choice.ts cardOutcomes counts an explored card and a default card the same way: confirmed when any of its attempts confirmed, usd summed over all its attempts (the rescue cost of a failed exploration lands on the explored pair). The two `(!explored || r.attempt === 1)` guards are gone. The budget and escalation exemptions for exploratory attempts in hooks/lib/attempts.ts are unchanged.
- A card that never confirmed and whose every verdict is a held-claim refute (scope, files, branch, pr), no-report or unverified is counted=false, in both arms alike.
- Class backfill: a new pure function maps a task id to a class from its card file's fields (kind:, title, scope, and the same size rule MOD-274 uses) with the existing cardKind/cardSize/cardClassName. cardOutcomes takes an optional `classOf(task)` used when a row has no `class`. register.ts builds it from the repo's card folder (docs/cards) once per ledger read and passes it wherever pairHistory/suggest/explorePlan read history. tests/node/adaptive-replay.mjs uses it too, so a replay on the real ledger reports classes for past cards. A card file that is missing leaves the row unclassed (unchanged).
- Single-target exploration in hooks/lib/explore.ts: for a standard card the target is the tier-down pair (economy at the same effort) until that pair has 30 counted explored cards in the class, then the effort-down pair. Frontier keeps its one effort-down candidate. The least-tried alternation is gone. The skip-not-clamp rule and all the eligibility rules are unchanged.
- This repo's .chassis-delegation.json sets explore 0.3 with a `_explore` comment saying it is raised for the burn-in month. The shipped default stays 0.2.
- The simulation in tests/node/adaptivesim.mjs models a rescue (a failed card retries at the default pair, the card confirms if the retry does, and the usd sums), so the counting change is exercised. Existing assertions (i) to (v) still pass. One new scenario on a standard-tier class with two candidates asserts every explored card goes to the tier-down pair until it has 30, then to the effort-down pair.
- Tests (node): an explored card refuted on attempt 1 and confirmed on attempt 2 counts confirmed with both attempts' usd; a no-report-only card is uncounted in both arms; classOf fills a classless row and a row's own class wins; single-target ordering for standard and frontier.
- docs/configuration.md (the explore and adaptive rows) and CHANGELOG.md Unreleased say this in one entry. The decision rule (Wilson, the cost test, withdrawal) is NOT changed by this card.
