---
id: MOD-6
title: /delegation debrief runs the debrief now, and every debrief ends with scrubbed findings about the mod itself (what went well, what went wrong) written beside it, ready to post
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/cleanstop.ts, hooks/lib/redact.ts, hooks/templates/debrief.md, .claude-plugin/plugin.json, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/types/**, .chassis-delegation.json, docs/**, hooks/lib/allow.ts, hooks/lib/verify-native.ts, hooks/lib/gitguard.ts, hooks/lib/card.ts, hooks/lib/setup.ts, hooks/lib/scheduler.ts, hooks/lib/dispatch.ts, hooks/lib/attempts.ts, hooks/lib/brief.ts, hooks/lib/update.ts]
red_test: pure tests in tests/redact.test.ts: the fixture "nelsben/acme-app at /Users/someone/Documents/acme-app, by Someone <someone@example.com>, Acme's BE-351" with the repo acme-app, origin https://github.com/nelsben/acme-app.git, user Someone / someone@example.com and redact = acme comes out with no home path, no acme in any case, no owner/name, no email, and BE-351 untouched; prompt tests in tests/cleanstop.test.ts (or beside the existing debrief tests): both prompts name mod_findings; engine tests in tests/hooks.test.ts: /delegation debrief spawns the debrief agent at once and prints its id; a second call while it runs refuses naming it; a hand-back whose JSON holds one went_wrong finding with a denylisted word leaves a .findings.json without the word and prints a [1] line; red first
gate: validate, node, test
budget: 2-attempts
spend: 12
---
## Why

The founder wants debrief under /delegation and wants what went well and what went wrong with the mod to reach its public repo so it can be fixed. Today the mod's debrief runs only by itself at a clean stop (maybeDebrief in hooks/register.ts, pure parts in hooks/lib/cleanstop.ts), with no manual trigger; it wraps the person's ~/.claude/commands/debrief.md when present (that command stays, sessions without the mod use it too) and hooks/templates/debrief.md otherwise. Posting needs a mechanical scrub: fourteen issues on the public tracker already carry product, repo, employer and home-path names that adopter sessions typed from memory. This card is the trigger, the findings and the scrub; posting is the next card.

## Done when

- /delegation debrief starts the same background debrief maybeDebrief starts, now: it skips the idle, cooldown and minimum-friction tests, keeps one debrief at a time (a second call while one runs refuses in one line naming its agent), runs even while a worker is running but says so in one line and in the prompt, and prints the agent id, the mode (breadcrumbs or events) and the folder the file will land in; the auto path and /delegation's last debrief: line are unchanged
- the prompt the mod builds on both paths (the skill-wrapping debriefPrompt and builtInDebriefPrompt) asks for one more top-level key in the JSON, mod_findings: an array of { kind: went_well | went_wrong, surface, fault_class: bug | design | docs | cost | performance, severity: P1 | P2 | P3, title, body, evidence: [strings] } about chassis-delegation itself, not the project, grounded in the facts the prompt gives (verdict lines, refutes, by-hand accepts, denials, corrections), empty when there is nothing to say; hooks/templates/debrief.md documents the key with one example of each kind; the person's own skill file is never edited
- when the debrief agent hands back (the mod already keeps its agentId and reads the path with debriefPathOf), the mod reads the JSON, scrubs every string of mod_findings with redact, writes <same folder>/<same name>.findings.json holding { debrief, modVersion, scrubbed: true, findings } and prints one line per finding, [n] went_wrong · P2 · <surface> · <title>, then drafts: <path>; no findings prints no findings
- redact(text, rules) in a new pure hooks/lib/redact.ts: every /Users/<name>/… or /home/<name>/… prefix becomes <home>/…; the session root's folder name and its origin URL (both owner/name and the full URL) become the repo; the git user.name and user.email become the person; every word of the redact list becomes <redacted>, matched case-insensitively as a whole word; the list comes from a new comma-separated /config option redact declared in the manifest, and is never read from the repo file (the repo file is public)
- README gains a /delegation debrief section (what it runs, the findings file, the redact option and why it lives in /config); CHANGELOG entry
