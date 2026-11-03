---
id: MOD-281
title: Blocked-by-environment fires only when every Bash call of the attempt was refused as changed after review, never on an ordinary failed command
domain: mod
tier: standard
status: merged
scope: [hooks/lib/identity.ts, hooks/register.ts, hooks/templates/brief.md, tests/automode.test.ts, CHANGELOG.md]
forbid: [hooks/lib/attempts.ts, hooks/lib/version.ts, .claude-plugin/plugin.json, docs/cards/**]
red_test: claude plugin test <worktree> (tests/automode.test.ts) — the new default-mode 'Permission denied (publickey)' test fails on main (the attempt is shown as blocked by environment) and passes after
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

MOD-279 counts any Bash result with isError whose text matches "permission ... denied", "denied by ..." or "auto mode" as a host refusal, in every permission mode. A failed `git push` ("Permission denied (publickey)"), an EACCES, or a failing test run that prints "auto mode" is enough. One such result plus a report with sha=unknown or none, or no report at all, turns the attempt into "blocked by environment": uncharged, unescalated, with the verifier's scope and files findings thrown away. That is a free, unjudged attempt obtainable with one refused call.

## Done when

- In hooks/lib/identity.ts, hostRefusalText returns text only when the result carries a deny string, or isError is true and the text says the input was changed after review (saysInputChanged). The regexes for 'auto mode', 'permission/request ... denied/refused' and 'denied by user/classifier/permission' are removed.
- The bottom Bash hook in hooks/register.ts (the one that fills hostRefusals) also counts every Bash call the agent attempted; hostRefusals holds { n, attempted, first }. The blocked-by-environment branch in finalizeOnce fires only when n >= 1 and n === attempted (every Bash call of the attempt was refused); otherwise the attempt is judged as before, with the verifier's lines kept. The no-report case stays no-report unless every Bash call was refused.
- recordResume clears the agent's hostRefusals entry as it does now; nothing else about resume changes.
- hooks/templates/brief.md: the line saying the mod exports CHASSIS_SESSION_ID, CHASSIS_TASK and CHASSIS_ATTEMPT in every Bash call gains the clause 'except in auto mode, where your Bash runs as typed'.
- tests/automode.test.ts gains: (a) default mode, one Bash result { isError: true, result: 'git@github.com: Permission denied (publickey).' } then real work and a report with sha=unknown: the verdict row does not contain 'blocked by environment' and the attempt counts against the budget; (b) one refused-as-changed call followed by one call that ran, report sha=none: not blocked, judged as before; (c) the existing all-refused test still passes. The 'deny from the host latches' test is kept as it is.
- CHANGELOG.md Unreleased gains one line for this change. No other file changes.

## Review

Brain review: hostRefusalText narrowed to a deny or an "input changed" error; every Bash call counted, blocked only when all were refused; brief line notes auto mode. Refuted four times on load-driven 5 s timeouts only; after MOD-282 the brain rebased onto main (CHANGELOG conflict, both Unreleased lines kept) and the re-verify at 7da31c8 was green. Live check: this attempt ran in auto mode with permissionMode=auto on its record and its Bash ran unrefused.
