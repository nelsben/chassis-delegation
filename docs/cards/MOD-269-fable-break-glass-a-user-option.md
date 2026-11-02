---
id: MOD-269
title: Fable break-glass: a user option allowFable (default off) lets a card or reviewer that asks for fable actually get fable instead of opus
domain: mod
tier: standard
status: merged
scope: [hooks/**, tests/**, docs/**, .claude-plugin/plugin.json, CHANGELOG.md]
forbid: []
red_test: a new test in tests/tier.test.ts: finalAlias with allowFable on and a premium pick returns fable; fails today because fable is always rewritten to opus
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Today finalAlias (hooks/lib/tier.ts) rewrites fable to opus unconditionally, so neither a premium card nor a reviewer can ever run on fable; an adopter session asked for a fable reviewer and was told the plugin does not allow it. Fable stays too heavy for default use, so the rewrite stays the default, but the person needs a deliberate, visible way to break the glass for one-off hard work such as an adversarial review.

## Done when

- A new option allowFable (boolean, user scope, default off) is in configtable.ts, /config, plugin.json userConfig and docs/configuration.md; its one-line help says it lets a card or reviewer that asks for fable run on fable, and that fable costs about 2.5x opus.
- With allowFable off, behaviour is unchanged: fable becomes opus and the existing 'fable requested' notice still shows; the notice now ends with how to allow it (the option name and /config).
- With allowFable on, finalAlias keeps fable only when it was explicitly asked for: a card tier premium or model fable, a caller alias fable, a tierMap entry mapping to fable, or reviewTier premium. Nothing else resolves to fable (standard and frontier stay sonnet and opus).
- An ad hoc Agent call (no brief) with model fable counts as explicitly asked: with allowFable off it runs on opus as today (its row says so and names the option); with it on it runs on fable. Today such a call silently runs on opus.
- A worker or reviewer spawned on fable under the option carries 'fable (break-glass)' with the 🟠 glyph on its spawn row and verdict row.
- The per-attempt spend ceiling still applies to a fable attempt: premium uses its own spend entry if set, else the frontier one; a test shows a fable attempt over the ceiling is stopped the same way an opus one is.
- The delegateOnly guard for a fable brain is unchanged.
- Tests cover: option off rewrites fable for card and reviewer; option on keeps fable on each explicit path; option on does not change a frontier card; the row marker; the pinned option count in tests (configcmd, options) goes up by one.
- CHANGELOG.md Unreleased has one entry; the docs/configuration.md tierMap row names the option instead of saying fable is never spawned.

## Review

Accepted. Gap noted by the worker: no test for the ad hoc call with allowFable off beyond the notice text; no tsc on PATH so no type-check beyond the plugin gates.
