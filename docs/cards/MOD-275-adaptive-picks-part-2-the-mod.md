---
id: MOD-275
title: Adaptive picks, part 2: the mod suggests the cheapest model and effort that passes for a card class (suggest mode, Wilson lower bound), proven by a simulation built to be able to fail
domain: mod
tier: standard
status: merged
scope: [hooks/**, tests/**, docs/**, .claude-plugin/plugin.json, CHANGELOG.md]
forbid: []
red_test: the simulation test in tests/node/: with the cheaper pair's true pass rate 15 points lower than the default's, the suggestion function returns none, and with an equal rate it returns the cheaper pair for the dominant class; fails today because no suggestion function exists
gate: validate, node, test
budget: 2-attempts
spend: 12
---
## Why

With classes and exploration recorded (MOD-274) the ledger can say which pair passes at the lowest cost per passed card, but only if the statistics hold at low n. On this repo cost per attempt has a coefficient of variation near 0.9 and a pair's pass rate at n=10 has a standard error near 9 points, so a raw-rate rule with n of 10 and a 5-point tolerance would select noise. The suggestion therefore uses a Wilson lower bound and a cost-gap test, ships as suggest only (the brain decides), and is proven by a simulation built to be able to fail. Apply mode is deferred until about four weeks of real suggestions have been replayed.

## Done when

- A pure function takes ledger rows and a class and returns a suggestion or none, with the numbers it used. Eligible rows: attempt-1 cards of the class that were eligible to explore under MOD-274's rule, so the default pair's cards are the same population as the explored pairs'. Pass rate is MOD-270's pairHistory confirmed-per-card rate, with scope, files, branch and pr refutes already left out. A pair qualifies when n is at least 20, its Wilson 90% lower bound on pass rate is at least the default pair's point rate minus 5 points, and its mean usd per confirmed card is below the default's by more than one standard error of its own mean. The cheapest qualifying pair is returned; the default pair is never suggested.
- A new repo option adaptive: off or suggest (default suggest). suggest: the card tool's choice line adds 'suggest sonnet/low for feature/large (n 24, lower bound 91% vs default 96%, $0.52 vs $0.89 per confirmed card)' and the brain decides. The value apply is reserved: naming it is refused with a line saying it is not shipped yet. off: no suggestion line.
- A simulation test in tests/node/ with a seeded generator under MOD-274's eligibility, budget and no-escalation rules: 5 classes with shares 0.9, 0.05, 0.03, 0.01, 0.01; per-attempt usd log-normal with a coefficient of variation of 0.9; 5% of cards refuted on scope regardless of pair; 300 cards. Seeds and shares are constants at the top of the test. It asserts: (i) cheaper pair with an equal true rate: the dominant class's suggestion is the true cheapest pair and the four minor classes return none; (ii) cheaper pair 15 points lower: none; (iii) cheaper pair 7 points lower: none, or, if suggested, the simulated overall pass rate had it been applied stays within 3 points of always-default; (iv) the cheaper pair's rate drops 20 points after card 150: the suggestion is withdrawn within 30 cards; (v) all pairs equal in rate and cost: none. The test states in a comment that the simulation models budget and no escalation of exploratory attempts.
- A replay script under tests/node/ runs the function over the real .delegation/ledger.jsonl when present (skipped when absent), prints per-class suggestions without failing; its output on this repo is pasted into the hand-back.
- The option is in configtable.ts, /config, plugin.json userConfig and docs/configuration.md; the pinned option count goes up by one. No /delegation change in this card.
- CHANGELOG.md Unreleased has one entry; docs explain suggest, that apply is not shipped, and that suggestions are expected for the one or two largest classes only.
