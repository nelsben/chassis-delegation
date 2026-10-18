---
id: MOD-96
title: A gate the verifier stopped at its time limit is advised as a re-verify or a by-hand gate run, never a resume
domain: mod
tier: standard
status: merged
scope: [hooks/lib/verify.ts, hooks/lib/verify-native.ts, hooks/register.ts, tests/verify.test.ts, tests/gaterun.test.ts, tests/hooks.test.ts, CHANGELOG.md, docs/review-and-merge.md]
forbid: [docs/cards/**, hooks/lib/retention.ts, hooks/lib/serial.ts, hooks/lib/storeloss.ts, hooks/lib/dispatch.ts, hooks/lib/brief.ts, hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, docs/upgrading.md, docs/internals.md, hooks/lib/allow.ts, bin/**, .chassis-delegation.json]
red_test: the new advise() unit test in tests/verify.test.ts (a gate claim stopped at the time limit, the only unchecked claim, agent and budget left) and the engine case in tests/hooks.test.ts or tests/gaterun.test.ts fail on origin/main because the advice is `resume agent=…`; save that run as the red evidence first
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Issue #147: a gate still running when the verifier's 9-minute limit stopped it left the attempt unverified on gate with next=resume. A resume cannot make the gate faster: the worker can only repeat its report, and the attempt is spent. MOD-84 showed the right move by hand: run the gate in the worktree to see its real time, then re-run the verifier on the same sha without spending an attempt.

## Done when

- ADVICE. When the verdict is unverified and every unchecked claim is a gate that the verifier stopped at its time limit (the run's result says it was aborted or timed out while still running, as the process runner reports it), advise() returns kind check, not resume, with next naming both moves in one line: time the gate by hand in the worktree, then re-run the verifier on the same sha with `/dispatch <id> --verify <sha>` (no attempt spent). The line names the gate id, the limit in minutes, and the sha when the input has it. A pure helper decides 'stopped at its time limit' from the claim line's detail, with unit tests on the real detail text and on a gate that failed or did not start (those keep today's advice).
- MIXED. An unverified verdict with a timed-out gate and another unchecked claim keeps today's resume advice, but its prove list says of the gate that it timed out and need not be proved by the worker. A refuted verdict is unchanged.
- ROW. The verdict row for that case shows the new next line; the verdict tool and /delegation show it unchanged from the row. An engine test with a fake gate that the runner reports as stopped at the limit shows `next=check` with the by-hand and --verify line, and no resume.
- DOCS. CHANGELOG.md gets one entry under `## Unreleased` naming #147, below any entry already there. docs/review-and-merge.md (or the page that explains next= advice) says what to do when a gate hits the verifier's time limit.
- GATES. The red tests fail on origin/main (advice is resume) and pass at the head; validate, node and test are green.

## Review

Read the diff. The worker could not see the runner's timeout text, so I checked it: the issue's real detail, `gate node did not run: aborted still running after 540000ms`, matches gateTimedOut and gives 9 minutes. A refused gate, a failed gate and a gate that did not start keep today's advice; a mixed unverified verdict still resumes, with the gate marked as not the worker's to prove. The sha comes from the report. The engine case stops at advise() inside verifyNative rather than the posted row, because the hooks harness cannot make process.run time out; the row takes next from advise() unchanged, so that is enough. Accepted.
