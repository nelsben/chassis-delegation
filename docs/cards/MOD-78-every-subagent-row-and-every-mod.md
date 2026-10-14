---
id: MOD-78
title: Every subagent row and every mod row carries a model glyph (🟢 haiku · 🔵 sonnet · 🟣 opus · 🟠 fable · ⚪ other), so the model behind each line is visible at a glance; one option, modelGlyphs, changes or turns it off
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/glyph.ts, hooks/lib/rows.ts, hooks/lib/dashboard.ts, hooks/lib/quiet.ts, hooks/lib/configtable.ts, .claude-plugin/plugin.json, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/types/**, .chassis-delegation.json, docs/**, hooks/templates/**, bin/**, hooks/lib/allow.ts, hooks/lib/gitguard.ts, hooks/lib/verify.ts, hooks/lib/verify-native.ts, hooks/lib/verdicttool.ts, hooks/lib/mergecmd.ts, hooks/lib/configeff.ts, hooks/lib/configcmd.ts]
red_test: a new engine test: a briefed spawn tiered to sonnet reaches the host with its description starting with the sonnet glyph (`🔵 `) and the `started` row carries the same glyph before `sonnet`; on main the description is unchanged and the row has no glyph; red first
gate: validate, node, test
budget: 2-attempts
spend: 12
---
## Why

In the VS Code extension the host's subagent rows show the Agent call's description plus tokens, tools and time, never the model, so the person cannot tell which of several running agents is on which model, and the brain's own tool-call count on the same screen is read as the workers'. The host lets the agent.spawn hook rewrite the description, so a fixed glyph per model alias at the front of it makes the model visible on the host's own row; the same glyph on the mod's rows, status section, band and dashboard gives one legend everywhere. Text surfaces have no colour the mod controls, so the glyph is the colour.

## Done when

- GLYPH. A new pure module hooks/lib/glyph.ts exports `modelGlyph(alias: string, map: GlyphMap): string` and `parseGlyphs(text: string): GlyphMap | 'off'`. The built-in map is haiku → 🟢, sonnet → 🔵, opus → 🟣, fable → 🟠, and `other` → ⚪ for any alias not in the map (a raw model id resolves through the mod's alias machinery first, hooks/lib/watch.ts, so `claude-sonnet-5-5` is 🔵). `parseGlyphs` reads `alias=glyph` pairs separated by commas (`opus=🟣, sonnet=🔵`), the word `off`, or empty for the built-in map; a pair with an unknown alias is kept (the map may name a future model); a malformed entry is ignored and named in the debug log once. A glyph is at most one grapheme cluster plus an optional variation selector; longer values are refused by the option's parse.
- OPTION. The manifest (.claude-plugin/plugin.json userConfig) gains `modelGlyphs`, kind string, default '' (= the built-in map), described in one line; hooks/lib/configtable.ts gains its row in the Display group with scope user, render text and summary 'The glyph that marks each model on every row: alias=glyph pairs, off, or empty for the built-in set'; tests/options.test.ts gains exactly one case for it (setting `modelGlyphs off` removes the glyph from a started row) so the node tests that hold the table to the manifest and the options file to one case per field stay green. The `/delegation config modelGlyphs` show view lists the built-in map on its `in effect:` line when the value is empty.
- HOST ROW. In the agent.spawn hook, every spawn the mod resolves a model for (briefed, ad hoc, reviewer, debrief and eval agents alike) has its description rewritten through `next({ ...e, description })` to `<glyph> <description>` once, using the alias the spawn resolves to (the tiered alias for a briefed spawn, the requested or resolved model otherwise). A description that already starts with a known glyph is not prefixed again. With modelGlyphs off the description passes untouched. A spawn the mod denies is unchanged.
- MOD ROWS. The MOD-74 `started`, `resumed`, `started from queue` and `handed back` rows, the verdict row (hooks/lib/quiet.ts, every verbosity that prints one), each line of the `running:` section in `/delegation` status, the band's running and queued rows (hooks/lib/dashboard.ts bandLines) and the dashboard pane's worker lines all carry `<glyph> ` immediately before the alias, the same glyph the host row shows. `brain: <alias>` in the status section carries it too. The ledger rows and the debug log are unchanged (no glyphs in machine-read output). Existing tests that pin these rows exactly are updated to the new shape; none is deleted.
- TESTS. tests/glyph.test.ts holds pure cases for modelGlyph (each built-in alias, a raw id, an unknown alias → ⚪) and parseGlyphs (pairs, off, empty, a malformed entry ignored, a too-long glyph refused). Engine cases (in tests/rows.test.ts or a new tests/glyphrows.test.ts): a briefed sonnet spawn's description reaches the host as `🔵 <description>`; an ad hoc opus spawn's as `🟣 <description>`; a description already prefixed is not doubled; `modelGlyphs off` leaves the description and every row bare; a custom map (`sonnet=🟦`) shows on the started row, the band and the status section.
- DOCS. README: the MOD-74 rows and the status section in the command table and the Status section show the glyph, with a one-line legend; the Configuration user-scoped table gains `modelGlyphs`. CHANGELOG.md has an entry under `## Unreleased` above the latest version heading (create the heading if there is none). The three gates pass.

## Review

Two attempts, both sonnet, $1.60 in all. Attempt 1 (c77a595) built every surface and handed back gate=fail only to carry an amend: the show view's `in effect:` line lives in hooks/lib/configcmd.ts, which the card forbade; the verifier recorded the claim as unverified on gate, not a refutation, since the gate was green. The amend was approved (forbid-=hooks/lib/configcmd.ts) and the resume (14ea78b) added the one case and its test.

Departures accepted as they stand: the config table summary was shortened to the 90-character cap; the full-form verdict row stays bare because its `model=<id>` field is pinned by many tests (the one-line row carries the glyph); queued band rows carry no alias because the host's queued item type has none (the `running:` section does show it); in the band the glyph sits after the tier, `standard/🔵 sonnet`.

Lesson, again: a card whose work plainly touches a config view should not forbid hooks/lib/configcmd.ts.
