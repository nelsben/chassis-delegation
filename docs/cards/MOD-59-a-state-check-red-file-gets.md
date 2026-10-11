---
id: MOD-59
title: A state-check red file gets a marker line from the brief, and a red file with no failure marker is advised as a check by hand, not a resume that cannot help
domain: mod
tier: standard
status: merged
scope: [hooks/lib/verify.ts, hooks/lib/verify-native.ts, hooks/templates/brief.md, tests/**, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/register.ts, bin/**, hooks/lib/allow.ts, hooks/lib/gitguard.ts]
red_test: the new advise case for a red claim unchecked only for a missing failure marker (gate=pass) fails on main because advise returns resume agent=… — prove: red; red first
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Issue 117: a card's red test was a CLI query whose correct red output was "Total number of records retrieved: 0." with no fail, error or expected word in it, so the red claim came back unchecked and the verdict said resume agent=… — prove: red. Resuming cannot help, because the same query prints the same bytes and a byte-identical red file is refuted. The brief should tell the worker how to mark a state check's red file, and the verdict should not send a worker back for a red file it cannot change.

## Done when

- hooks/templates/brief.md: the red evidence rule gains a sentence: when the red test is not a test runner (a query, a CLI listing, a file or state check), end the red file with one line `expected: <the green condition>; got: <what the output shows>`, written when the file is saved; RED_MARKER in hooks/lib/verify-native.ts already matches `expected`, so the regex itself does not change
- hooks/lib/verify-native.ts: redClaim's no-marker detail keeps its prefix `no failure marker found in red=<path> (N bytes)` and adds `; a state check's red file ends with an "expected: …; got: …" line`
- hooks/lib/verify.ts advise: an unverified verdict whose only unchecked claim is red with that no-marker detail, with the report's gate=pass, returns kind check with next `check red by hand — no failure marker in <path>; if it shows the red state, accept; else resume agent=<id> — prove: red` (without an agent id, the part after accept is left out); every other unverified case, including red unchecked for another reason (no red= named, unreadable, unhashed) or red unchecked alongside another unchecked claim, is advised as today
- tests: an advise case for the no-marker red claim alone (check, the next above), one for no-marker red plus an unchecked gate (resume prove as today), one for red unchecked with no red= named (resume as today); a redClaim case that a red file holding `Total number of records retrieved: 0.` plus an `expected: …; got: …` line is held; the existing no-marker test updated for the new detail; a brief render test that the rendered brief carries the expected/got sentence
- a CHANGELOG entry under a new `## Unreleased` heading above `## 0.9.2 — 2026-10-11`; the three gates pass
