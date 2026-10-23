---
id: MOD-126
title: allow= rides inside the verdict row before next= (next= stays last), /delegation config shows briefLocal's default as "none: no local rules", and a test pins that a repo with neither briefLocal nor allow: gets a byte-identical brief
domain: mod
tier: standard
status: merged
scope: [hooks/lib/quiet.ts, hooks/lib/verify.ts, hooks/lib/brieflocal.ts, hooks/lib/configcmd.ts, hooks/register.ts, tests/**, CHANGELOG.md]
forbid: [bin/**, docs/cards/**, hooks/lib/verify-native.ts, hooks/lib/allow.ts, hooks/lib/dispatch.ts, hooks/templates/**, .claude-plugin/**, .chassis-delegation.json, README.md, docs/upgrading.md]
red_test: pure test in tests/node/: quietLine({..., allow: ['live-reads'], next: 'accept'}) must end with ' · next=accept' and contain ' · allow live-reads · '; at base quietLine ignores allow, so the clause is missing; plus the configcmd test expecting the briefLocal note 'none: no local rules', which is undefined at base. Red first
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Three rough edges left by MOD-124 (#188). The quiet verdict row's contract is that next= stays last, but the allow clause is appended after it, so a reader scanning for next= sees it mid-row. The config view shows briefLocal with no default note, unlike briefTemplate. And the promise that adopters without the new keys see no change is only checked by reading the code.

## Done when

- quietLine in hooks/lib/quiet.ts takes an optional allow list (QuietInput gains `allow?: readonly string[]`) and, when non-empty, adds one clause `allow <a,b>` after the amend clauses and before `next=`; the full verdict line from verdictLine in hooks/lib/verify.ts likewise carries ` · allow=<a,b>` before ` · next=` (verdictLine gains `allow?: readonly string[]`). hooks/register.ts passes the brief header's allow ids into both calls and no longer appends allowText after them; allowClause in hooks/lib/brieflocal.ts goes if nothing else uses it. With no allow ids both rows are byte-identical to today's.
- hooks/lib/configcmd.ts's default note for briefLocal reads `none: no local rules` when the value is empty, in the same switch that gives briefTemplate its note.
- Tests: pure tests in tests/node/ for quietLine and verdictLine with allow (clause before next=, next= last) and without (unchanged); an engine test in tests/brieflocal.test.ts asserting the verdict row of an allow: card ends with `next=accept` and holds `allow live-reads` (or `allow=live-reads` for the full line) before it; an engine test that dispatches the same card in a repo without briefLocal and asserts the brief text equals the brief the same card renders with briefLocal pointing at a missing file and equals a stored expectation built from renderBriefChecked with the plain briefExtra (byte-identical); a configcmd test for the briefLocal note. CHANGELOG Unreleased gets one entry naming MOD-124's follow-up. Wording generic: no product, repo, person, path or session names.

## Review

Attempt 1 (sonnet) accepted. The red run is tests/node/allowrow.node.mjs failing 4 of 6 at base (quietLine and verdictLine ignore allow; the briefLocal config note is undefined). quietLine adds `allow <ids>` after the amend clauses and before next=; verdictLine writes ` · allow=<ids> · next=` when the brief allowed any (the card's literal separator), else its old ` next=`; register.ts passes the brief header's ids into both and no longer appends after next=; allowClause is gone. The config view notes briefLocal's default as "none: no local rules". An engine test pins that a brief with no briefLocal equals one with briefLocal pointing at a missing file and equals renderBriefChecked with the plain briefExtra. Gates green: validate, node 1025/0, plugin 1535/0.
