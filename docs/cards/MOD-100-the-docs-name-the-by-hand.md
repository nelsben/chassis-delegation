---
id: MOD-100
title: The docs name the by-hand acceptance gate for a hand-back with no trustworthy verdict, and the ledgerFile option says the ledger also holds spawn lines
domain: mod
tier: economy
status: merged
scope: [docs/review-and-merge.md, docs/configuration.md, hooks/lib/configtable.ts, .claude-plugin/plugin.json, CHANGELOG.md]
forbid: [docs/cards/**, hooks/register.ts, hooks/lib/verify-native.ts, hooks/lib/attempts.ts, hooks/lib/version.ts, README.md, docs/upgrading.md, docs/internals.md, bin/**, .chassis-delegation.json]
red_test: none
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

Issue #162, a went-well note: while the verifier was out, every card landed through a by-hand gate (red on base, green at head, in scope, suite green), and none had to be reverted. The docs should name it as the fallback, after the cheaper re-verify, so a brain that gets "no attempt recorded" or "unverified" knows what to do instead of resuming the worker. MOD-94 also made the ledger hold a spawn line per briefed spawn, and the ledgerFile option text still says one line per judged attempt.

## Done when

- docs/review-and-merge.md gains a section `## When the verdict is missing or not trustworthy`, placed directly after `## A gate that hits the verifier's time limit`. It says when it applies: the verdict tool says no attempt recorded, or the verdict is unverified for a reason the worker cannot fix (no brief, a gate timeout). It names two steps in this order. First, re-run the verifier on the same work with `/dispatch <id> --verify <sha>`, which spawns nothing and spends no attempt. Second, if that cannot judge it, use the by-hand gate, as a numbered list: (1) in a detached worktree at the worker's base, with the worker's test files copied in, the red test fails; (2) at the worker's head the same test passes; (3) every changed path is inside the card's scope and none is in forbid; (4) the repo's full gate suite passes at the head. Then the card is merged with a Review section saying it was verified by hand and why. Plain words, the same voice as the rest of the page; no product, repo or person names.
- The `ledgerFile` description reads `Keep a log of every spawn and judged attempt inside the repo` in hooks/lib/configtable.ts, and the matching description in .claude-plugin/plugin.json and the docs/configuration.md row say the ledger holds one JSON line per briefed spawn and one per judged attempt. Nothing else in those files changes.
- CHANGELOG.md gets one entry under `## Unreleased` naming #162, below the entries already there.
- tests/node/docs.node.mjs is green (links and anchors), and validate, node and test pass.

## Review

Reviewed by the brain. docs/review-and-merge.md gains a "When the verdict is missing or not trustworthy" section after the gate time-limit section: re-verify with /dispatch <id> --verify <sha> first, then the four-step hand check, then merge with a Review section saying so. Only the ledgerFile text changed in plugin.json, configtable.ts and configuration.md, and it now names spawn rows as well as judged attempts. No names or local paths in the diff. Closes #162.
