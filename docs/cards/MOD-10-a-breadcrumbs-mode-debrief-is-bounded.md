---
id: MOD-10
title: A breadcrumbs-mode debrief is bounded to its window and validated at hand-back: evidence outside the window is stripped, findings about the host go to host_findings that post never files, and the watermark moves only on a validated debrief
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/cleanstop.ts, hooks/lib/debriefcheck.ts, hooks/lib/findings.ts, hooks/templates/debrief.md, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/lib/allow.ts, hooks/lib/verify-native.ts, hooks/lib/gitguard.ts, hooks/lib/card.ts, hooks/lib/setup.ts, hooks/lib/scheduler.ts, hooks/lib/dispatch.ts, hooks/lib/attempts.ts, hooks/lib/brief.ts, hooks/lib/update.ts, hooks/lib/brain.ts, hooks/lib/redact.ts]
red_test: pure tests: the debrief prompt names the window's first and last timestamps and lines; validating a fixture debrief with one tool_denials entry at a timestamp before the window strips it and reports 1 stripped; a finding with surface \"permission classifier\" lands in host_findings and one with surface \"verifier\" stays; a clean fixture passes with nothing stripped; engine tests in tests/hooks.test.ts: a hand-back with an out-of-window entry leaves the debrief record unchanged and prints the stripped line; a clean hand-back moves it; post with two mod findings and one host finding lists two and says one set aside; red first
gate: validate, node, test
budget: 2-attempts
spend: 12
---
## Why

Public issue #50 (P2): /delegation debrief on a long session wrote a debrief for breadcrumb lines 50–62 and moved the watermark to 62, but it described friction from 36 hours earlier (classifier denials already debriefed, read from the full transcript), summarised work from a file excerpt printed inside a tool error string, and all three mod_findings were about the host's permission classifier, the host's removal safety check and the user's own hook — not the mod. "post all" would have filed them here as mod issues, and the moved watermark silenced the host's debrief nudge for a window the debrief does not describe. The debrief looks plausible, so nobody notices unless they read it against the breadcrumbs.

## Done when

- the debrief prompt (both the skill-wrapping and built-in paths) carries the window: the first and last breadcrumb timestamps and line numbers (watermark, end], tells the agent to read only transcript entries inside it, to take the work summary from assistant and user turns inside it and never from tool error text, and asks every corrections, tool_denials and outcomes entry to carry the breadcrumb line or timestamp it came from as `at`
- at hand-back, before the findings file is written and before the watermark record moves, the mod validates the JSON (pure, in hooks/lib/cleanstop.ts or a new hooks/lib/debriefcheck.ts): an entry whose `at` is outside the window is stripped and counted; an entry with no `at` in breadcrumbs mode is kept but counted; a tool_denials or corrections list that reports a kind the window's breadcrumbs do not contain is flagged; the printed result names what was stripped or flagged in one line each
- mod_findings.surface is an enum of mod surfaces (card, dispatch, brief, verifier, gate, dashboard, debrief, update, accept, config, allowlist, scheduler); a finding whose surface is not in the enum, or whose text names the host's permission classifier, a host safety check, the engine, or the person's own hooks, is moved to a separate host_findings list in the .findings.json; /delegation debrief post never lists or files host_findings and says how many it set aside
- the mod's own debrief record (K.debrief: lastAt, watermark, lines) is written only when validation stripped nothing and flagged nothing; otherwise the previous record stands, the printed result says why, and the mod never writes the person's .done watermark file itself (the skill does); the built-in template's instruction to mark the watermark says to do it only after the mod's validation line reads clean
- hooks/templates/debrief.md documents the window, the `at` field, the surface enum and host_findings; README's debrief section names the four rules; CHANGELOG entry
