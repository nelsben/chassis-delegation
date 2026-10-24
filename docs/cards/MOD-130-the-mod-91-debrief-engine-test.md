---
id: MOD-130
title: The MOD-91 debrief engine test ("a debrief whose check fails twice starts no third time…") runs well under the engine's 5 s per-test limit under load, by doing less simulated idling, without changing what it asserts or raising any timeout
domain: mod
tier: standard
status: merged
scope: [tests/hooks.test.ts]
forbid: [hooks/**, bin/**, docs/**, tests/harness.ts, .claude-plugin/**, CHANGELOG.md, README.md, .chassis-delegation.json]
red_test: timing red: run `claude plugin test {worktree}` three times at base and record this test's per-test time from the runner output (expected 1.3 to 2.9 s on an idle machine); after the change each run shows it (or each half) under 1000 ms. Save the base timings as the red evidence. Red first
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

This existing engine test in tests/hooks.test.ts takes 1.3 to 2.9 s on an idle machine and has timed out at 5000 ms twice under load: once failing a release merge, once failing a verifier gate on a card that never touched it. It simulates about 43 hours of idle time with the mocked clock (three idle(7) calls plus 20-minute tails), and each advance fires every pending $.clock.after timer the mod holds, which is where the time goes. A flaky gate costs a full attempt and erodes trust in refutations.

## Done when

- The test keeps every assertion it has now (spawn counts 1, 1, 2, 2 then 3 by hand; the failedChecks record; the stopped row said exactly once; the .check.txt and .orig.json contents and their being shown) and still exercises the same paths: the cooldown holding after a failed attempt, a second automatic attempt after the cooldown, no third automatic attempt after two failed checks, and /delegation debrief still running by hand.
- It gets there with less simulated time or fewer timer firings: for example the smallest clock advances that cross the cooldown (read the cooldown constant the mod uses rather than hard-coding 7 hours), or a store seed that starts the second half from the state the first half leaves, or splitting it into two tests that each seed their starting state. No product code under hooks/ changes; if the only fix is in hooks/, stop and say why in the report instead.
- Measured with the engine runner's per-test timing, the test (or each test it is split into) takes under 1000 ms in three consecutive `claude plugin test` runs on this machine, against its time at base, recorded in the report; the red evidence file holds the base timings.
- No timeout is raised anywhere, no test is skipped, and the engine test count changes by at most +1 (a split). All three gates pass.

## Review

Attempt 1 (sonnet) accepted. Base timings 1725, 1943 and a 5004 ms timeout on a loaded machine; after, 369, 409, 429 ms. The test sets debriefCooldownHours 0.25 and debriefIdleMinutes 5 through test options and idles one cooldown at a time, so it walks the same paths with ~1/28 the simulated time; every assertion kept, no timeout raised, test count unchanged, hooks/ untouched. The 6 h default cooldown stays covered by tests/options.test.ts.
