---
id: MOD-19
title: The verdict says what it checked: `verified` becomes `consistent` everywhere the mod writes it, the old word is still read for one minor version, and the README says the brain still reads the diff
domain: mod
tier: standard
status: merged
scope: [hooks/**, bin/**, tests/**, .claude-plugin/plugin.json, README.md, CHANGELOG.md]
forbid: [.claude-plugin/types/**, .chassis-delegation.json, docs/**, hooks/lib/version.ts]
red_test: a new pure test that greps hooks/ and bin/ for an emitted verified (outside the legacy reader) fails today; a pure test that a verdict row for a fully held report reads consistent fails today; an engine test that a ledger and store written before the rename (verdict verified) still retire an owed row and count as a success passes before and after; red first
gate: validate, node, test
budget: 2-attempts
spend: 12
---
## Why

Public issue #1, reported by two adopters independently: when every claim holds the row says `verified` and `next=accept`, which reads as review, yet nothing reads the diff; a worker that cleanly builds the wrong thing gets the same row. The founder chose `consistent` (2026-10-11): the report is consistent with git. The row text is a contract adopters parse, so the old word stays readable for one minor version. This card is the rename alone; the optional reviewer stage is the next card, written against the new word.

## Done when

- every verdict the mod writes says consistent where it said verified: the verdict row (`attempt 1/2 consistent · sonnet · $0.19 · next=accept`), the long verdict line (verdict=consistent), attempt records and ledger rows, the dashboard and its text fallback, the compaction and prompt state sections, the debrief prompts and template classification rubric, bin/chassis-hook.mjs's row, and the `(report gate=fail)` form; the TypeScript verdict type gains consistent and keeps verified only as a legacy input
- everything that reads a verdict accepts both words until 0.9.0: a stored attempt record or ledger row saying verified is treated exactly as consistent (escalation, owed rows, accept, the spend and success counts, the dashboard), and a test proves a pre-rename ledger and store still read correctly
- a pure test greps hooks/ and bin/ and fails on any emitted verified other than the legacy reader and its deprecation comment
- README: the verdict table names consistent and says in one plain paragraph that consistent means every machine-checkable claim of the report matches git (branch, sha, files, scope, gate, red evidence), that it is not a review, and that the brain still reads the diff; a deprecation note says verified is read until 0.9.0; an honestly declared gate=fail is still never accepted; CHANGELOG entry
- the three gates pass; no file under docs/ changes (card titles keep their history)
