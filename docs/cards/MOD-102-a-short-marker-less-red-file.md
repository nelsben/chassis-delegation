---
id: MOD-102
title: A short marker-less red file is held when the red test's own run at the worker's head passes and prints something different
domain: mod
tier: standard
status: merged
scope: [hooks/lib/verify-native.ts, hooks/lib/verify.ts, hooks/register.ts, tests/verifynative.test.ts, tests/consistent.test.ts, docs/internals.md, CHANGELOG.md]
forbid: [docs/upgrading.md, .claude-plugin/plugin.json, package.json, hooks/lib/attempts.ts]
red_test: npx tsx --test tests/verifynative.test.ts (new tests for the marker-less short red file held after a passing, different green run fail on main)
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

A state-style red file with no failure marker (for example 55 bytes of "count=3") comes back "unverified on red (no failure marker found…)" even though the work is fine, and the brain has to check it by hand (#166, a follow-up to #117). The verifier can settle this itself: run the brief's red_test command at the worker's head, and if that green run passes and its output differs from the red file, the red file shows a state the work changed.

## Done when

- When a red file has no failure marker and is at most 2048 bytes, the verifier runs the brief's red_test command once at the worker's head (in the worker's tree, under the same time limit the gates use). If that run exits 0 and its trimmed output differs from the red file's trimmed text, the red claim is held. The detail says so, e.g. 'red=<path>, 55 bytes, no failure marker; the red test passes at the head and prints otherwise'.
- If the green run fails, times out, cannot run, or prints the same text, the claim stays unchecked with today's detail plus a short reason, e.g. '; the red test at the head printed the same'. Advice for that case stays 'check red by hand'.
- A red file larger than 2048 bytes, or one whose brief red_test is 'none' or names no runnable command, behaves exactly as today. A red file that has a marker behaves exactly as today, and the one-proof-per-task and byte-identical checks still apply first.
- The pure part sits in hooks/lib/verify-native.ts (redClaim, or a helper next to it, takes the green run's result as input), and its tests are in tests/verifynative.test.ts. The run itself is plumbed where the verifier already runs commands in the worker's tree.
- CHANGELOG.md gets an entry under Unreleased naming #166, and docs/internals.md describes the rule where the red claim is documented.

## Review

Reviewed by the brain. redClaim takes an optional green result. A red file of at most 2048 bytes with no failure marker is held when the brief's red_test, run once at the worker's head in its tree under the gate time limit, exits 0 and prints something different; otherwise it stays unchecked with a reason. The command runs only when it passes the gate-shape rules and the allowlist (redTestCommand), through the existing allowlisted exec. The one-proof-per-task and byte-identical checks still run before the new held return. Larger files, files with a marker and briefs with no runnable red_test behave as before. The brief's npx red command cannot load the engine-only test module; the worker used `claude plugin test .` as the red run, which fails on main (redTestCommand not exported). Closes #166.
