---
id: MOD-119
title: The polling row keys a command by its command word, and counts a run as polling only when the same command repeats or its output does not change
domain: mod
tier: standard
status: merged
scope: [hooks/lib/drive.ts, hooks/register.ts, tests/**, docs/spend.md, CHANGELOG.md]
forbid: [bin/**, hooks/templates/**, .claude-plugin/**, docs/cards/**, .chassis-delegation.json]
red_test: the new pure test that two commands sharing a leading `O=/tmp/x;` assignment get different keys fails at the base
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Issue #187. driveWarn's commandKey (hooks/lib/drive.ts) takes the first 60 characters of the collapsed command, so three Bash calls that start with the same NAME=value assignment, or three distinct probes to one tool during a diagnosis, are counted as one command run three times and the row recommends a card for what was an investigation.

## Done when

- commandKey strips leading NAME=value assignments (each optionally followed by ; or &&) and a leading `cd <dir> &&` before keying, and keys on the whole normalised remainder, not its first 60 characters (a long command may be hashed to keep the store small).
- A run counts toward the polling row only when the same key repeats; for a Bash call whose output is known, a repeat whose output changed since the last same-key call does not count. A run of distinct commands to one MCP tool (different arguments) does not count.
- The row's wording and the driveWarn / driveWarnTokens options are unchanged.
- Tests: pure on commandKey with the issue's two examples (shared `O=<path>;` prefix with different commands → different keys; same command behind different assignments → same key); engine: three distinct probes → no row; the same argv three times with unchanged output → the row. CHANGELOG gains an Unreleased entry naming #187; docs/spend.md's driveWarn row says what counts.
- No machine paths, user, product or repo names. The validate, node and test gates pass.

## Review

Attempt 1 (sonnet) accepted. commandKey drops leading NAME=value assignments and a leading cd <dir> &&, keys on the whole remainder (cut and hashed past 120 chars); a new driveOutput records each brain Bash call's output hash after the call, and a same-key repeat with changed output restarts the count. MCP calls never reached driveStep, so no change there. Red: the new commandKey tests failed at base. Gates green: validate, node 991/0, plugin 1502/0.
