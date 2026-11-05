---
id: MOD-311
title: debrief ingest names the heading it needs when a note lacks it, offers a near heading, and the note prompt row says the heading up front
domain: mod
tier: standard
status: merged
issue: 391
scope: [hooks/lib/notes.ts, hooks/register.ts, tests/node/notes.node.mjs, tests/notes.test.ts, tests/options.test.ts, docs/configuration.md, docs/guide.md, CHANGELOG.md]
forbid: [hooks/lib/allow.ts, hooks/lib/scheduler.ts, hooks/lib/verify-native.ts, hooks/templates/**, docs/cards/**, hooks/lib/findings.ts]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/notes.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Two review notes were ingested and both answered `has no "For the mod owner" section; nothing written`; the brain had never been told the heading, because the prompt row that asks for the note does not name it. Issue #391. The heading lives only as a regex in hooks/lib/notes.ts and a literal in the refusal in hooks/register.ts.

## Done when

- hooks/lib/notes.ts exports `OWNER_HEADING = 'For the mod owner'`; ownerSection keeps its case-insensitive substring match but builds its regex from OWNER_HEADING.
- hooks/lib/notes.ts exports a pure `ingestRefusal(markdown: string, name: string, path: string): string | undefined` that returns one of the three texts below, or undefined when the note has the heading with at least one top-level bullet under it; runDebriefIngest in hooks/register.ts returns its result in place of today's `has no "For the mod owner" section; nothing written` line. The texts, written out in full (the backticks in the second line are part of the output; the heading text comes from OWNER_HEADING):
- ```
debrief ingest: <name> has no "For the mod owner" heading (read <path>); add `## For the mod owner` with one bullet per finding, then run it again
nearest heading: "<text>"; rename it to "For the mod owner" to ingest it
debrief ingest: <name> has a "For the mod owner" heading with no bullets; one bullet per finding
```
- The `nearest heading` line is a second line of the no-heading refusal, printed only when the note has a heading (any level, outside fenced code) whose text matches /\bmod\b/i and does not contain the phrase; nothing is written in any refusal case.
- notesPromptRow in hooks/lib/notes.ts reads, with the count and verdict/verdicts as today: `a round of tasks closed (N verdict(s)): write the review note with a "## For the mod owner" heading, one bullet per finding, then /delegation debrief ingest <note.md>`; the /delegation usage line in hooks/register.ts lists `debrief ingest <note.md>`.
- tests/node/notes.node.mjs gains cases for ingestRefusal (no heading; no heading with a near heading; heading with no bullets; heading with bullets gives undefined) and for the new prompt row; tests/notes.test.ts updates the asserted refusal text (its line 47 today) and the prompt row (line 62); tests/options.test.ts updates its asserted prompt row (line 596).
- docs/configuration.md updates the quoted prompt row (line 120 today) and the quoted refusal (line 138) to the new texts; docs/guide.md's command table row for debrief ingest names the heading and the one-bullet rule.
- CHANGELOG.md gains one bullet under `## Unreleased` / `### Fixed` naming MOD-311 and #391.
- The validate, node and test gates are green.

## Review

Diff read in full: OWNER_HEADING and ownerSection built from it; pure ingestRefusal with the three texts and the near-heading line; runDebriefIngest returns it; prompt row names the heading up front; usage line lists debrief ingest; tests and docs as the card asks. First hand-back was a pause (no-report); the second carried the report and was re-judged with dispatch verify at d8c582a: consistent.
