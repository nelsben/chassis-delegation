---
id: MOD-38
title: The debrief check accepts a correction the transcript holds at its time, and a check whose only flag was such corrections still moves the record and the watermark
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/debriefcheck.ts, hooks/lib/cleanstop.ts, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/templates/**, hooks/lib/allow.ts, hooks/lib/verify-native.ts, hooks/lib/gitguard.ts, hooks/lib/brain.ts, hooks/lib/live.ts, hooks/lib/version.ts, hooks/lib/legacy.ts, hooks/lib/redact.ts, bin/**]
red_test: pure tests in tests/debriefcheck.test.ts: a correction \"i dont agree here and i think opus needs help\" at 10:00:30Z matches a user message \"I don't agree here and I think Opus needs help. MCP isn't required\" at 10:00:00Z? no (apostrophes differ: assert the normalisation the worker chooses, documented in the test) — and a verbatim quote at 10:01:00Z matches; a quote of 8 characters never matches; a match at 10:03:00Z (outside two minutes) does not count; engine test in tests/hooks.test.ts: a debrief whose only flag is four transcript-evidenced corrections prints the evidenced clean line and moves the record; red first
gate: validate, node, test
budget: 2-attempts
spend: 6
---
## Why

Public issue #90: /delegation debrief over breadcrumb lines 1-90 wrote four corrections, each quoting the user verbatim with a timestamp from the transcript; the breadcrumb file held no correction entry because the capture missed them (public #89), so MOD-10's check flagged the list as one the window could not contain, the record did not move and the watermark was left, and every later debrief repeats the same window. A correction the transcript proves is evidence, whatever the breadcrumbs say.

## Done when

- for each corrections entry with an at inside the window, the check looks for its quoted text (the entry's text with surrounding quotes stripped, compared after collapsing whitespace and case, at least 12 characters of it) in a user message of the session transcript whose time is within two minutes of at; a match marks the entry source: transcript and it no longer counts toward the flag; the transcript is read through the engine's session messages call for the main agent, never by path; an entry with no match is flagged as today
- when every flag of a check was corrections that the transcript then evidenced, the check line reads `debrief check: clean (n corrections evidenced by the transcript, none in the breadcrumbs)`, the record moves, and the clean-check watermark message (MOD-32) is sent; any other flag or strip leaves the record as today
- tool_denials are not changed by this card (the breadcrumbs remain their only evidence)
- pure tests for the quote match (whitespace and case, the 12-character floor, the two-minute window); engine tests: a debrief whose four corrections all match transcript user messages comes back clean, moves the record and sends the watermark message; one with a correction not in the transcript is flagged as before; README (What bounds a debrief) and CHANGELOG
