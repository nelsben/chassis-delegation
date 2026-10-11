---
id: MOD-32
title: After a clean debrief check the mod tells the debrief agent to mark its watermark, and a verdict fact says when a refute was later re-judged at the same sha
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/cleanstop.ts, hooks/lib/debriefcheck.ts, hooks/lib/attempts.ts, hooks/templates/debrief.md, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/lib/allow.ts, hooks/lib/verify-native.ts, hooks/lib/gitguard.ts, hooks/lib/brain.ts, hooks/lib/version.ts, hooks/lib/legacy.ts, hooks/lib/redact.ts, bin/**]
red_test: pure tests in tests/cleanstop.test.ts: given a refuted attempt 1 of MOD-17 at sha X and a re-judge of attempt 1 at X that came back consistent, the fact lines hold one merged line naming both verdicts and the words false refute, and no second line for the attempt; an attempt refuted and resumed at a new sha is listed as two facts as today; engine tests in tests/hooks.test.ts: a debrief under a skill whose check is clean sends the debrief agent the mark-your-watermark message, and one whose check flags sends none and says the watermark was left; red first
gate: validate, node, test
budget: 2-attempts
spend: 6
---
## Why

Found by the mod's own debrief of this repo's session on 2026-10-11. First: the person's debrief skill marks the harness watermark (.done) only after the mod prints `debrief check: clean`, but that line is printed after the agent hands back, so the agent never sees it; the agent wrote its file and stopped, .done stayed at 55 of 89 lines, and the host's debrief nudge would keep firing for a window already debriefed. The mod must not write .done itself (MOD-10). Second: the debrief filed a went_well finding, "Verifier refuted a gate-pass claim that was actually red", for MOD-17, whose refute was false (engine-suite timeouts under load) and was re-judged consistent at the same sha with /dispatch --verify; the facts it was given held the refute row and a later consistent row with nothing linking them, the same misreading public issue #55 recorded. A debrief that turns a false refute into a win teaches the wrong lesson and would file it publicly.

## Done when

- when the debrief check prints clean and the debrief ran under the person's own skill (not the built-in template), the mod sends the debrief agent one message, the way autoEscalate resumes a worker: `debrief check: clean. Mark your watermark now, as your instructions say, and stop.`; a flagged or stripped check sends nothing and the printed result says the watermark was left as is; the built-in template path is unchanged (its file says the same rule and the mod sends the same message)
- a verdict fact in the debrief prompt for an attempt that was re-judged in place (MOD-1's --verify at the same sha) reads as one line naming both verdicts, e.g. `verdict 2026-10-10T23:57:53Z: MOD-17 attempt 1/2 refuted on gate, then re-judged consistent at the same sha (a false refute)`, and the separate later row for that attempt is not listed again; an attempt whose refute stood is listed as today
- both prompts tell the agent that a refute later re-judged consistent at the same sha is a false refute, a went_wrong for the verifier or gate, never a went_well
- pure tests for the fact merge; an engine test that a clean check under a skill sends the mark message and a flagged one does not; README debrief section; CHANGELOG
