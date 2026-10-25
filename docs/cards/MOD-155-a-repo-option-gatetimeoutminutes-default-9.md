---
id: MOD-155
title: A repo option `gateTimeoutMinutes` (default 9) sets how long the verifier and merge let one gate run
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/configtable.ts, hooks/lib/configcmd.ts, hooks/lib/configeff.ts, hooks/lib/repoconfig.ts, .claude-plugin/plugin.json, tests/**, docs/configuration.md, CHANGELOG.md]
forbid: [docs/cards/**, bin/**, hooks/templates/**, .chassis-delegation.json, README.md, docs/upgrading.md, hooks/lib/verify-native.ts, hooks/lib/allow.ts]
red_test: engine test: with repo config `gateTimeoutMinutes: 15` a verify passes gateTimeoutMs 900000 to the verifier and the merge gate run uses timeoutMs 900000; at base both are 540000. Red first
gate: validate, node, test
budget: 2-attempts
spend: 5
---
## Why

#246 ask 4: an adopter's full suite takes up to about 10 minutes on a loaded machine, close to the built-in 9-minute gate limit. A repo option lets a repo with a long suite raise it without a code change.

## Done when

- A repo-scope option `gateTimeoutMinutes` (render `minutes`, group `Checking the work`, default 9, whole minutes 1 to 10 (the host caps one run at 600000 ms); a value outside that or not a number is named in the config errors and the default is used) is added in hooks/lib/configtable.ts and hooks/lib/configcmd.ts, and in .claude-plugin/plugin.json userConfig in the same style as the other repo options. The config count tests in tests/configcmd.test.ts and any table-complete tests are updated to the new count.
- hooks/register.ts replaces each use of the GATE_TIMEOUT_MS constant (the verifier's gateTimeoutMs, the merge gate run, the card-gate run, the engine gate lock's `until`) with the configured value in milliseconds, read at the time of the run. With the option unset, behaviour is exactly as today (9 minutes).
- Tests in tests/: with `gateTimeoutMinutes: 8` the verifier is passed gateTimeoutMs 480000 and the merge gate run is given timeoutMs 480000 (red first: at base both are 540000); 10 gives 600000; 15 is named in the config errors and 9 holds; unset gives 540000; a bad value is named and falls back. docs/configuration.md gains the row for the option. CHANGELOG.md Unreleased gets one entry naming #246. Wording generic: no product, repo, person, path or session names.

## Review

Attempt 1 consistent but deviated: the host refuses process.run timeoutMs over 600000, so the card's 1-to-120 range could only clamp. Resumed with the range narrowed to whole minutes 1 to 10 (a value outside it is named in the config errors and 9 holds); the HOST_MAX_TIMEOUT_MS clamp in run() stays as a guard. Attempt 2 was refuted on gate by one 5 s timeout in the untouched MOD-150 cherry-pick test (1659 pass, 1 fail, output saved by MOD-149); `--verify 728541f` re-ran it green and judged consistent. GATE_TIMEOUT_MS is now gateTimeoutMs(), read at each run (verifier, merge gate, card gate, engine lock until). Gap: the full config-error wording is checked by hand, not by a test.
