---
id: MOD-91
title: A failed debrief check no longer restarts the debrief: the cooldown counts from the last start, two failed checks on one window stop it, and the check's lines are kept beside the debrief
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/cleanstop.ts, tests/cleanstop.test.ts, tests/hooks.test.ts, docs/configuration.md, CHANGELOG.md]
forbid: [docs/cards/**, hooks/lib/allow.ts, hooks/lib/version.ts, hooks/lib/retention.ts, .claude-plugin/**, hooks/templates/**, bin/**, .chassis-delegation.json, README.md, docs/upgrading.md]
red_test: write the new tests/cleanstop.test.ts cases first and run `claude plugin test {worktree}`: the cooldown-from-lastAttemptAt and two-failure cases fail against the current cleanStop; save that run as the red evidence; red first
gate: validate, node, test
budget: 2-attempts
spend: 5
---
## Why

Issue #156 (P1): the background debrief loops forever when its check fails. writeFindings returns moved: false, onRunnerComplete then restores `debrief.prior` as the record (hooks/register.ts, the `else await storeSet($, K.debrief(sid), debrief.prior ?? null)` branch), and prior's lastAt is from the last debrief that passed (often a day old) with the watermark before the current .done. maybeDebrief passes prev.lastAt and prev.watermark to cleanStop, so both guards pass and the next idle stop starts the same debrief again, every debriefIdleMinutes, each run spending a Sonnet agent. One session today got twelve copies of the same debrief. The check's lines go only to a session row, and when the check strips entries it rewrites the file, so afterwards nothing on disk says which entry failed.

## Done when

- The debrief record carries `lastAttemptAt` (when the latest debrief started, whatever its check said) and `failedChecks: { watermark, count }`. When a check fails, the restored prior record keeps its watermark and lastAt for coverage, but gains lastAttemptAt = this attempt's start and failedChecks counting failures from the same start watermark (a new watermark resets it to 1).
- cleanStop reads the attempt: the cooldown counts from max(lastAt, lastAttemptAt). With failedChecks.count >= 2 for the current start watermark it refuses with `debrief stopped: the check failed twice on the window from line <n>; run /delegation debrief to retry by hand`. The automatic start says that once per session as a row (not at every idle stop); the by-hand `/delegation debrief` still runs, and a clean check clears failedChecks.
- When the check is not clean, its lines are written to a sibling file `<debrief>.check.txt`. When the check strips or rewrites entries, the file as the agent wrote it is kept first as `<debrief>.orig.json`. The session row names both paths.
- tests/cleanstop.test.ts covers the new guards as pure cases (cooldown from lastAttemptAt; second failure on the same watermark refuses; a new watermark resets; a clean record unaffected). tests/hooks.test.ts gets an engine case: a debrief whose check fails twice starts no third time at the next idle stop, says the stopped row once, and leaves .check.txt and .orig.json beside the debrief.
- docs/configuration.md (where the debrief cooldown is described) says the attempt cooldown and the two-failure stop. CHANGELOG.md gets one entry under a new `## Unreleased` heading at the top, naming #156. No new option. The three gates pass.

## Review

Attempt 1 (sonnet, $0.76) accepted as handed back. Read the loop's two halves: a failed check now restores the prior record with lastAttemptAt set to this attempt's start and failedChecks counted on the same start watermark (a new watermark resets it to 1, a clean check's moved record drops it), and cleanStop refuses on two failures for that watermark before it reads the cooldown, which now counts from the later of lastAt and lastAttemptAt. The stop row is said once a session; the by-hand door still runs. The check's lines go to <debrief>.check.txt and the agent's own file to <debrief>.orig.json before a rewrite. Three choices beyond the card are accepted: a placeholder record (lastAt 0, watermark -1) when there was no prior, which the status line skips; .orig.json on any rewrite, a clean one included; and a by-hand failure counting toward the two.
