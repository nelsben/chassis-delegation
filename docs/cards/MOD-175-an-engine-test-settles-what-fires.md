---
id: MOD-175
title: An engine test settles what fires when the brain resumes a briefed worker with SendMessage, and docs/internals.md states what it found
domain: mod
tier: standard
status: merged
scope: [tests/resume.test.ts, docs/internals.md, CHANGELOG.md]
forbid: [hooks/**, .claude-plugin/**, README.md, docs/cards/**, tests/hooks.test.ts]
red_test: none
gate: validate, test
budget: 2-attempts
spend: 8
---
## Why

docs/internals.md says a SendMessage resume arrives as an ad hoc agent.spawn with the same agent id, and that the spawn hook uses it to record the next attempt (kind resume). Anthropic's mods reference, as read on 2026-10-25, says agent.spawn does not run again on a resume, and that only tool.call sees it. Resume counting is the spine of the attempt budget and the escalation ladder: if the spawn hook no longer fires, resumes may go uncounted and a resumed worker's model and folder are not what the docs say. This card finds out which holds and pins it with a test; any code fix is a later card.

## Done when

- A new engine test file, tests/resume.test.ts, drives a briefed worker through spawn, a refuted hand-back and a SendMessage resume using the same engine hooks and helpers the existing tests use (read tests/hooks.test.ts first, the cases that mention SendMessage or `next=resume`). It asserts, for the resume: whether the mod's agent.spawn handler runs (count its calls), whether a tool.call event for the SendMessage tool reaches the mod, and the attempt record the resumed hand-back writes (its attempt number and kind in the ledger).
- Before writing assertions, find out what the host does on a resume, not only what the test engine can simulate: read Anthropic's mods reference (https://code.claude.com/docs/en/plugins/mods/reference) and the sub-agents page's resume section (https://code.claude.com/docs/en/sub-agents#resume-subagents), and look at what `claude plugin test`'s engine emits when a test sends a SendMessage call. If the engine only fires what a test explicitly emits, say so: then the test pins the mod's behaviour for each event sequence the host may send, one case where a resume arrives as agent.spawn and one where it arrives only as a tool.call on SendMessage.
- Each case's assertions describe today's behaviour exactly. Where today's code fails to count a resume (for example, the tool.call-only sequence records no next attempt), the test asserts that gap as it is today, and its name says `gap:` with what is missing, so a later fix card flips it. No hooks/ code changes in this card.
- docs/internals.md, the `A resume (SendMessage) arrives as …` sentence in Store and ledger, is rewritten to state what the investigation found, with the source URL for any claim about the host and the test file for any claim about the mod. If the host behaviour could not be determined, the sentence says so and names both possible event sequences and which one the mod counts.
- The report's text, above the report block, gives the finding in three lines or fewer: which events fire on a resume (or that it could not be determined and why), whether resumes are counted today under each sequence, and the smallest fix if one is needed (which hook, which file).
- CHANGELOG.md `## Unreleased` gets one entry tagged MOD-175 under `### Added` for the test and the corrected internals sentence. Wording generic: no product, repo, person, machine path or session names.

## Review

Consistent on attempt 1/2 ($0.70, Sonnet), no amends, and no hooks/ changes, as the card asked. tests/resume.test.ts pins three event sequences for a SendMessage resume. In A, a second agent.spawn becomes a new lineage, and the docs rule this sequence out. In B, only tool.call fires, and two cases are named gap: nothing is counted at the send, and a resume handed back at the same sha is never counted. In C, session.send fires and the resume is recorded at the send. docs/internals.md now cites the mods reference: agent.spawn does not run again on a resume.

The live ledger adds evidence the worker could not see. Live resumes on this host record kind resume at attempt 2 on lineage 1, which rules out A. Six repo=none research lanes (MOD-157..161) were resumed and handed back with sha none, the same as their first attempt, and each was still counted as attempt 2. Under B that same-sha hand-back is never counted, so the host very likely fires session.send for SendMessage (sequence C). Resumes are therefore counted today. The B fix (a tool.call hook on SendMessage) is a hedge, not a needed repair. A docs follow-up records this.
