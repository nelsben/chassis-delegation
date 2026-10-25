---
id: MOD-147
title: dispatch verify=<sha> at the last attempt's own sha judges the newest red file: when the worktree's .delegation/<ID>/ holds a red-N.txt newer than the one the attempt recorded, the re-judge reads it and says so
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/verify.ts, tests/**, CHANGELOG.md]
forbid: [docs/cards/**, bin/**, hooks/templates/**, .chassis-delegation.json, .claude-plugin/**, README.md, docs/upgrading.md, hooks/lib/verify-native.ts, hooks/lib/allow.ts]
red_test: engine test: attempt 1 recorded red-1.txt and was unverified on red; the worktree gains red-2.txt; dispatch verify=<the attempt's sha> reports red=.delegation/T-1/red-2.txt in its synthetic report; at base it reports red-1.txt. Red first
gate: validate, node, test
budget: 2-attempts
spend: 4
---
## Why

Issue #234: the verdict was `unverified on red`. The worker then wrote a new red file and the lead ran `dispatch verify=<sha>`, but the re-judge at the same sha re-read the first report's red file (runVerifyDispatch takes `last.red` whenever it re-judges), so the verdict never moved and the lead landed the work by hand outside merge. A re-judge exists to look again; it should look at the newest evidence.

## Done when

- hooks/register.ts runVerifyDispatch: when verifyTarget says rejudge and the brief wants a red, the red file is the newest `red-N.txt` in the worktree's `.delegation/<ID>/` (newestRed) when its N is greater than the N of the attempt's recorded red; otherwise the recorded red as today. A recorded red that is not named red-N.txt is kept unless a red-N.txt file in that folder is newer by mtime (or, when mtimes cannot be read, kept).
- When the re-judge takes a newer file than the recorded one, the output adds one line `red: <new path> (newer than the attempt's <old path>)` before the synthetic report line; the synthetic report's red= is the new path, and the attempt record's red is patched to it with the verdict.
- Prior-attempt red hashes still apply: a new file whose text matches an earlier attempt's red is still refused as a reused red (the existing priorRed rule).
- Tests in tests/: (1) attempt 1 recorded red=.delegation/T-1/red-1.txt and its verdict was unverified on red; the worktree gains red-2.txt holding a failing output; verify=<the same sha> judges red-2.txt, prints the `red:` line, and the red claim reads the new file; (2) no newer file: the recorded red is used and no `red:` line is printed (as today); (3) verify at a new sha (not a re-judge) still takes the newest red as today. CHANGELOG.md Unreleased gets one Fixed entry. Wording generic: no product, repo, person, path or session names.

## Review

Consistent on attempt 1. On a re-judge at the attempt's own sha with a brief that wants a red, runVerifyDispatch compares the folder's newest red-N.txt with the recorded red: by N when the recorded one is red-N.txt, else by mtime; a newer file replaces it, the `red:` line says so, and the record is patched with the verdict. Any read failure keeps the recorded red. A verify at a new sha is unchanged. The worker did not add a test for a newer file whose text matches an earlier attempt's red; the priorRed rule in the verifier is untouched and still applies to the new path.
