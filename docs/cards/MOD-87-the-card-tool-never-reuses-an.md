---
id: MOD-87
title: The card tool never reuses an id that already owns a brief or a ledger row, so a deleted card's old brief, tier and attempts never come back
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/card.ts, tests/dispatchtool.test.ts, tests/hooks.test.ts, tests/card.test.ts, CHANGELOG.md]
forbid: [docs/**, hooks/lib/norepo.ts, hooks/lib/mergecmd.ts, hooks/lib/allow.ts, hooks/lib/setup.ts, hooks/lib/init.ts, hooks/lib/version.ts, hooks/templates/**, bin/**, .claude-plugin/**, .chassis-delegation.json, README.md, tests/norepo.test.ts, tests/research.test.ts, tests/merge.test.ts, tests/allow.test.ts, tests/setup.test.ts]
red_test: a new engine case: card folder holds MOD-1 and MOD-2, the brief folder holds MOD-3.brief.md and the ledger has a MOD-4 row; the card tool must write MOD-5; on main it writes MOD-3; red first
gate: validate, node, test
budget: 2-attempts
spend: 4
---
## Why

When a card is deleted and the card tool writes a new one, nextNumber reads only the card folder, so the new card can take the deleted card's id. Dispatch then reuses the old brief (it never overwrites one) with the old tier and scope, and the ledger and store carry the old attempts. The comment above the names list in runCard already says the ledger, the briefs and the store are keyed by the id alone; the list does not yet hold them.

## Done when

- TAKEN IDS. In runCard (hooks/register.ts) the names given to cardsFromFields also hold the file names in the session root's brief folder (briefDirFor(root, cfg.briefDir); and, when no briefDir is set, the session scratchpad brief folder existingBrief also reads) and one name per task id found in the session root's .delegation/ledger.jsonl (for example `<ID>.ledger`), so nextNumber skips every id that owns a brief or a ledger row. A ledger line that is not JSON, or has no task, is skipped. A card for another repo (MOD-44) skips the same ids, since those folders are the session root's.
- UNCHANGED. A card file that exists is still never overwritten; dispatch's reuse of an existing brief for the same card (a retry, amend lines) is unchanged; the card-folder names still count as today.
- TESTS. Engine cases in tests/dispatchtool.test.ts (or tests/hooks.test.ts, where the card tool's engine tests are): with MOD-1 and MOD-2 cards in the card folder, MOD-3.brief.md in the brief folder and a ledger row for MOD-4, the card tool writes MOD-5; a garbage ledger line beside them changes nothing. Existing card-tool tests pass unchanged.
- CHANGELOG.md has an entry under `## Unreleased` above the latest version heading (create it if there is none). The three gates pass.

## Review

Attempt 1 (sonnet, $0.34) accepted as handed back. runCard now passes cardsFromFields the card-folder names plus the brief folder's file names (and the scratchpad brief folder when no briefDir is set) and one `<ID>.ledger` name per ledger task, so nextNumber skips them; the never-overwrite check still reads the card-folder names only. The engine case sits in tests/hooks.test.ts beside the other card-tool cases.
