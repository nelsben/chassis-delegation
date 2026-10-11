---
id: MOD-26
title: A breadcrumbs debrief's prompt carries only the facts whose time falls inside its window, each with its ISO time, and a window with no friction skips the spawn
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/cleanstop.ts, hooks/lib/debriefcheck.ts, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/lib/allow.ts, hooks/lib/verify-native.ts, hooks/lib/gitguard.ts, hooks/lib/brain.ts, hooks/lib/version.ts, hooks/lib/legacy.ts, bin/**]
red_test: pure tests in tests/cleanstop.test.ts: with a window 19:20:41Z to 19:20:50Z, a denial at 16:27Z, a refute at 15:43Z and a verdict at 18:01Z are all left out and a denial at 19:20:45Z is kept with its time in the line; a window of only session_end and session_start lines is classified boundary-only; engine tests in tests/hooks.test.ts: /delegation debrief on that boundary-only window spawns nothing and says so, and the record moves; a window holding one denial puts exactly that line, dated, in the prompt; red first
gate: validate, node, test
budget: 2-attempts
spend: 6
---
## Why

Public issue #55: /delegation debrief on a two-line window (a session_end and a session_start, no friction) handed the agent three facts from hours earlier, so MOD-10's check rightly flagged the debrief and the record never moved; the next debrief in the session reads the same stale facts and can never come back clean, and a false refute from earlier was even filed as a went_well finding. The cause is in startDebrief: friction events are sliced by the count of new breadcrumb lines (two separate streams), recent verdicts are kept by the previous debrief's time rather than the window's first timestamp, and the fact lines drop the at that FrictionEvent and RecentVerdict both carry.

## Done when

- in breadcrumbs mode, the facts put in the prompt are the friction events and recent verdicts whose at lies between the window's first and last breadcrumb timestamps, inclusive; the line-count slice and the prev.lastAt filter are gone from that path; events mode keeps today's selection
- every fact line carries its ISO time, e.g. `denial 2026-10-10T16:27:14Z: …` and `verdict 2026-10-10T18:01:07Z: …`, and the prompt tells the agent to cite that time as at
- a breadcrumbs window whose lines are only session_start, session_end and compaction breadcrumbs, with no fact inside it, does not spawn: /delegation debrief says `nothing to debrief in lines a-b (session boundaries only)` and the auto path logs it; the record moves past that window so the next debrief starts after it
- the fact selection is a pure function in hooks/lib/cleanstop.ts (events, verdicts, window in; the dated lines out); README's debrief section says what the prompt carries; CHANGELOG
