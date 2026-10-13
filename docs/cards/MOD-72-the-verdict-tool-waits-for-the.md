---
id: MOD-72
title: The verdict tool waits for the verdict for real, with waits that do not spend its hook's 10-second budget
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/verdicttool.ts, tests/**, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/templates/**, bin/**, hooks/lib/verify.ts, hooks/lib/verify-native.ts, hooks/lib/allow.ts, hooks/lib/gitguard.ts, README.md]
red_test: a new engine test that the verdict tool waits without $.clock.sleep (a hook on the clock that records sleeps of 5000 ms) fails on main, where runVerdict calls $.clock.sleep(5000); red first
gate: validate, node, test
budget: 2-attempts
spend: 6
---
## Why

Live, every call of mcp__chassis-delegation__verdict fails with "registered the tool verdict but no tool.call hook answered this call" when the verdict is not already in. runVerdict waits in $.clock.sleep(5000) steps. The host counts a $.clock wait against the hook's own 10-second budget (HookBudget.ms; see the $.clock.sleep doc). So the hook is dropped after two sleeps, and the brain has to poll the ledger by hand. The engine tests use a fake clock, so they never saw it. Any other $ call stops the budget clock, $.process.run included.

## Done when

- runVerdict waits between checks through a $ call that does not count against the hook budget: `$.process.run(['sleep', '<seconds>'], { timeoutMs })` with a step of POLL_MS (5 s), not $.clock.sleep. The total wait still stops at waitSeconds. If the sleep process cannot start, it falls back to answering stillVerifying at once (never a $.clock wait longer than 1 s).
- The hook's own code stays far inside 10 s for a full 600 s wait. A comment at the wait cites HookBudget and says why $.clock.sleep is not used. The doc comment on POLL_MS in hooks/lib/verdicttool.ts no longer claims the clock wait is inside the budget.
- No other hook in hooks/register.ts waits longer than 2 s in total on $.clock.sleep in one dispatch. The worker lists any it finds and fixes them the same way, or says there are none.
- Engine tests: the verdict tool, with the verdict landing after several poll steps, makes the waits through process.run (sleep) and makes no $.clock.sleep call of 5 s; it returns the verdict row. A sleep that fails to start answers the still-verifying text. The existing verdicttool tests still pass, adapted to the new wait.
- CHANGELOG.md has an entry under `## Unreleased` above the latest version heading (create the heading if there is none). The three gates pass.

## Review

Attempt 1 (sonnet, $0.51) was consistent but bypassed `run()`: `pauseOffBudget` called `$.process.run` directly, so
the sleep never met the allowlist. The brief was amended (`forbid-=hooks/lib/allow.ts`) and the worker resumed: the
allowlist gains one rule, `sleep <1..600 whole seconds>` and nothing else; the wait goes through `run()`; a node test
holds that `hooks/register.ts` calls `$.process.run(` exactly once. Attempt 2 ($0.69) was refuted on scope only
because the brain had committed this card into the worktree before the resume; the worker's own commits touch no
forbidden path, so it is accepted by hand. Lesson: commit the merged card only at merge time, after the last verdict.
