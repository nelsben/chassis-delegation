---
id: MOD-137
title: Debrief from the lead's review note: /delegation debrief ingest <note.md> turns the note's "For the mod owner" bullets into findings that debrief post reads, and a new debriefMode option (notes by default) makes the clean-stop debrief a one-line prompt to write that note instead of a background transcript pass
domain: mod
tier: standard
status: merged
scope: [hooks/lib/notes.ts, hooks/lib/cleanstop.ts, hooks/lib/configtable.ts, hooks/lib/configcmd.ts, hooks/lib/configeff.ts, hooks/lib/repoconfig.ts, hooks/register.ts, .claude-plugin/plugin.json, tests/**, docs/guide.md, docs/configuration.md, CHANGELOG.md]
forbid: [docs/cards/**, bin/**, hooks/templates/**, .chassis-delegation.json, README.md, docs/upgrading.md, hooks/lib/brief.ts, hooks/lib/verify-native.ts]
red_test: pure test tests/node/notes.node.mjs: noteFindings of a note with `## For the mod owner` and two bullets (one with a nested `Evidence: verdict row …` line) returns two findings with that evidence and source `review note note.md`; at base hooks/lib/notes.ts does not exist. Engine test: `/delegation debrief ingest note.md` writes a .findings.json the bare `/delegation debrief post` lists; at base the subcommand is unknown. Red first
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Issue #223: the background debrief mines transcripts and produces findings the lead then has to re-check, while the lead already writes a review note at the end of a round that says what the mod got wrong. Ingesting that note gives findings with their evidence line attached and costs no agent run; the transcript pass stays available as an option.

## Done when

- A pure module hooks/lib/notes.ts: `ownerSection(markdown)` returns the lines under the first heading (any level) whose text matches /for the mod owner/i, up to the next heading of the same or a higher level; `noteFindings(markdown, source)` returns one finding per top-level bullet of that section: {kind: went_wrong, surface: the first MOD_SURFACES entry the bullet names, else the catch-all surface the existing list uses for the mod in general, fault_class: design, severity: P3 unless the bullet starts with P1/P2/P3, title: the bullet's first sentence trimmed to 80 chars, body: the bullet text with its nested lines, evidence: the nested lines that start `Evidence:` (else the bullet's own text), source: `review note <basename of the note>`}; an empty or missing section gives [].
- hooks/register.ts: `/delegation debrief ingest <path>` (path relative to the session root or absolute, a .md file) reads the note, runs noteFindings, scrubs every string with the redact rules and drops local-rule quotes exactly as writeFindings does, writes `<the repo's debrief folder>/<YYYY-MM-DD>-note-<stem>.findings.json` with findingsFile, and prints findingsLines plus `post with /delegation debrief post all|1,3`; `/delegation debrief post` with no argument then lists these findings unchanged. A note with no owner section prints `debrief ingest: <basename> has no "For the mod owner" section; nothing written`. Nothing is posted by ingest.
- A user-scope option `debriefMode` (choice: notes, transcript; default notes) in .claude-plugin/plugin.json userConfig, hooks/lib/configtable.ts (group Debrief, beside autoDebrief), hooks/lib/configcmd.ts and wherever repo options are read, so `/delegation config debriefMode transcript` works and the config table stays complete. With notes, maybeDebrief's clean stop spawns no agent: it appends one row, once per round (a round = the verdicts since the last row or ingest), `a round of tasks closed (N verdicts): write the review note, then /delegation debrief ingest <note.md>`; cooldown and idle rules are as today. With transcript the background debrief runs exactly as today. autoDebrief false silences both.
- Tests: pure tests in tests/node/notes.node.mjs for ownerSection (levels, no section, section at the end) and noteFindings (bullets, nested Evidence lines, severity prefix, title trimming); engine tests: ingest writes the findings file and prints the lines; a note without the section writes nothing; with debriefMode notes the idle clean stop appends the prompt row and spawns no agent, once per round; with transcript the existing debrief tests still pass (set debriefMode transcript where they need the agent).
- docs/guide.md and docs/configuration.md describe the review-note debrief (the section heading to use, one bullet per finding, `Evidence:` lines, ingest then post) and the debriefMode option; CHANGELOG Unreleased gets one Added and one Changed entry (the default moves to notes). Wording generic: no product, repo, person, path or session names.

## Review

Attempt 1 consistent at 11d7ad6 (validate, node 1070, engine 1585). hooks/lib/notes.ts parses the "For the mod owner" section; /delegation debrief ingest writes <root>/.delegation/debriefs/<date>-note-<stem>.findings.json through the writeFindings scrub; debriefMode (notes default, transcript) with notes mode appending one prompt row per round of verdicts. Judgment calls: an unnamed surface files under `debrief` (NOTE_DEFAULT_SURFACE); ModFinding gains an optional scrubbed `source`; findFindings prefers an ingested file at least as new as the last debrief record; notes mode skips the friction minimums. The engine ingest red was written after the code (node red only).
