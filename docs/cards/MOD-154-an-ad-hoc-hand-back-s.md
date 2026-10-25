---
id: MOD-154
title: An ad hoc hand-back's owed row names how it clears: `owed: <ID>: check the diff (ad hoc: clears with /delegation accept <ID>)`
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/verify.ts, hooks/lib/compaction.ts, tests/**, docs/review-and-merge.md, CHANGELOG.md]
forbid: [docs/cards/**, bin/**, hooks/templates/**, .chassis-delegation.json, .claude-plugin/**, README.md, docs/upgrading.md, hooks/lib/verify-native.ts, hooks/lib/allow.ts]
red_test: engine test: a cardless ad hoc hand-back judged `check the diff` leaves the owed row `<ID>: check the diff (ad hoc: clears with /delegation accept <ID>)`; at base it reads `<ID>: check the diff`. Red first
gate: validate, node, test
budget: 2-attempts
spend: 4
---
## Why

#246: 17 `owed: <ID>: check the diff` rows from cardless ad hoc hand-backs that commit nothing sat on the board; the retire sweep has no sha, no patch and no card to match them by, so they never clear on their own, and nothing on the row said `/delegation accept` was the way out. Naming it on the row makes the documented path findable.

## Done when

- When a cardless ad hoc hand-back (the verify.ts case `input.adhoc && input.cardless` that gives next `check the diff`) leaves an owed row, the owed text stored and shown reads `<ID>: check the diff (ad hoc: clears with /delegation accept <ID>)`. The verdict row's own `next=` text is unchanged, so anything that parses next= still reads `check the diff`.
- Owed rows for carded tasks, and every other next, are unchanged. The retire sweep and `/delegation accept` (single id and `--owed`) work on the new rows as before.
- Tests in tests/: (1) an ad hoc cardless hand-back with a non-consistent verdict leaves the owed row with the hint (red first: at base it reads `<ID>: check the diff`); (2) a carded task's `check the diff` owed row has no hint; (3) `/delegation accept <ID>` clears the hinted row. docs/review-and-merge.md, where it describes owed rows or `/delegation accept --owed`, says one sentence that an ad hoc hand-back with no commit never retires on its own and clears with `/delegation accept`. CHANGELOG.md Unreleased gets one entry naming #246. Wording generic: no product, repo, person, path or session names.

## Review

Consistent on attempt 1. register.ts adds `(ad hoc: clears with /delegation accept <ID>)` to the owed text only where a cardless ad hoc hand-back's advice is check with next `check the diff`; the verdict row's next= and the ledger keep `check the diff`. /delegation accept <id> and --owed clear the hinted row. The carded no-hint test uses T-4's `verify sha=…` row, since a carded task never produces `check the diff`.
