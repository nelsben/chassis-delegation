---
id: MOD-270
title: The brain picks each worker's model and effort together, each with a reason, backed by per-model-and-effort outcome data from the ledger
domain: mod
tier: standard
status: merged
scope: [hooks/**, tests/**, docs/**, CHANGELOG.md]
forbid: []
red_test: a new test in tests/node/choice.node.mjs: the card tool called with tierReason, effort high and effortReason writes tier_reason:, effort: high and effort_reason: to the card front matter; fails today because the tool has no such parameters
gate: validate, node, test
budget: 3-attempts
spend: 10
---
## Why

The brain already picks a card's tier (a classifier gives a second opinion) but records no reason and sees no record of how past choices did; effort comes only from a hand-written effort: field or the per-tier table. The brain should choose model and effort per card, say why, and see what each choice has cost per confirmed card, so the choice is auditable and departures from the defaults build the evidence for later tuning. Today model and effort are perfectly confounded in the ledger (haiku=low, sonnet=medium, opus=high), so the history mostly compares tiers until off-default runs accrue.

## Done when

- The card tool (not the dispatch tool, whose parameters are unchanged) accepts tierReason, effort (low, medium, high) and effortReason; each reason is one line, newlines and colons replaced by spaces, cut to 120 characters, and the tool writes tier_reason:, effort: and effort_reason: to the card front matter. An effort outside low/medium/high is refused with a line naming the allowed ones. A maxEffort clamp (MOD-271, may land later) is applied after this choice, not here.
- The card tool's dry run and the dispatch output print one choice line just before the existing 'card says X · classifier agrees|says Y' line, which stays unchanged: 'tier standard → sonnet (<tier_reason, or default>) · effort high (<effort_reason>)' or 'effort medium (tier default)'. The model shown is the final alias after finalAlias, not the raw tier map. A cardless (ad hoc) spawn prints neither line.
- A pure function in hooks/lib/ (no host calls) takes ledger rows and returns, per (alias, effort) pair, across the whole ledger (rows carry no domain; no domain filter): a card's pair is (alias, effort) from its earliest kind 'spawn' attempt-1 row that has a verdict and an effort (cards whose attempt-1 row has no effort are left out); the card is confirmed if any of its verdict rows is verified or consistent; its usd is the sum of usd over all its rows that carry usd (spawn, resume and review kinds); rows with no kind, and accept and merged rows, are skipped. Per pair: n cards, confirmed rate, and usd per confirmed card (sum of usd of the pair's cards divided by its confirmed cards). A card that escalates tier on a later attempt stays credited to its attempt-1 pair. Pairs with n under 5 are marked 'thin', n under 20 'low confidence'. Most-used first, at most 6. The dry run and dispatch print it as one line under the choice line, e.g. 'history: sonnet/medium 120 · 88% · $0.71/card; haiku/low 40 · 98% · $0.02/card; opus/high 9 thin · 78% · $6.10/card'; no rows prints 'history: none'. Rows marked usdApprox count in n and the confirmed rate but not in usd; a pair whose usd came from fewer than n rows is marked '~'. Cards refuted only on scope, files, branch or pr (heldClaim in hooks/lib/attempts.ts) are left out of the confirmed-rate denominator, since those are brief defects, not capability. This is the one history function, pairHistory(rows), and MOD-274 and MOD-275 read it.
- At dispatch, next to K.effort (register.ts, where /dispatch stores the card's effort:), the card's tier_reason and effort_reason are stored under new keys and cleared when the card has none. stepEffort patches { effort, effortSource, tierReason, effortReason } onto the attempt record, the reasons even when the effort resolves to the engine default; effortSource ('card', 'tier'; MOD-274 adds 'explore') is 'card' when the card's effort: decided it, else 'tier' (effortFor knows which). The record reaches verdict rows through appendLedger as today, so departures are visible in the ledger.
- Re-dispatching a refuted card after its effort: was changed runs the next attempt at the new effort (K.effort is re-stored at dispatch; the stepEfforts cache is per agent, so a new worker re-reads it); a resume of the same agent keeps the effort it started at, and the card's docs say so. A test shows attempt 1 at medium and attempt 2 at high after the card is edited and re-dispatched.
- The spawn row shows the reasons when set, after the effort, cut to 60 characters.
- No /delegation change and no new config option in this card.
- The card tool's description tells the brain: pick the model by the tier guide; effort defaults to the tier's level; raise it one level for an ambiguous or cross-cutting card, or after an attempt refuted for reasoning; lower one level for mechanical work (releases, renames, docs); the history line compares pairs that were given different kinds of card (easy cards go to haiku, hard ones to opus), so it is not by itself a reason to downgrade; any departure is an experiment, at most one level, and needs a tierReason or effortReason.
- At least 8 new tests: the pure function and the reason cleaning in tests/node/choice.node.mjs; the tool, the rows and the attempt record in tests/hooks4.test.ts or a new tests/choice.test.ts. Cover: accept and refuse effort; reason cleaning; front matter round-trip; the choice line with and without reasons and for a fable rewrite; the history function on seeded rows (no rows, rows without effort left out, multiple verdict rows on attempt 1, retries and review usd counted, thin and low-confidence marks, 6-pair cap); effortSource card vs tier; attempt 2 at a changed effort; reasons on the spawn row.
- CHANGELOG.md Unreleased has one entry and docs/guide.md names the three card fields.

## Review

Accepted. Line order is summary, choice, history, card-says (card said choice just before card-says; history under choice, so this order follows both). n=9 prints 'low confidence' per the rules, not the example's 'thin'. A resumed old agent keeps its first attempt's effort after a re-dispatch.
