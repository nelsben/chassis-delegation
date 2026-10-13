---
id: MOD-76
title: 0.9.9: the version named in its four places, the CHANGELOG dated, and a README "From 0.9.8 to 0.9.9" section
domain: mod
tier: economy
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, tests/**]
forbid: [.claude-plugin/types/**, .chassis-delegation.json, docs/**, hooks/register.ts, hooks/lib/configcmd.ts, hooks/lib/configeff.ts, hooks/lib/configtable.ts, hooks/lib/rows.ts, hooks/types/**, bin/**]
red_test: bump MOD_VERSION in hooks/lib/version.ts to 0.9.9 first and run the node suite: tests/node/version.node.mjs fails on the manifest, the README and the CHANGELOG still naming 0.9.8; save that run as the red evidence, then bring the other three into line; red first
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

Two changes sit under CHANGELOG "Unreleased" since v0.9.8: MOD-73 remakes /delegation config (effective values with sources, a user options file so every option is settable on every screen, a short default view, one test per option) and MOD-74 makes every worker's model visible (started and handed-back rows, a running: section in status). The person asked for both, so they ship as the next patch.

## Done when

- hooks/lib/version.ts exports MOD_VERSION = '0.9.9'. .claude-plugin/plugin.json says "version": "0.9.9", and nothing else in the manifest changes. README.md says "Version 0.9.9, MIT." The CHANGELOG's "## Unreleased" heading becomes "## 0.9.9 — 2026-10-13". Its entries are unchanged, and no empty Unreleased section is left behind.
- README.md gains "### From 0.9.8 to 0.9.9" directly above "### From 0.9.7 to 0.9.8", in the same voice and shape: first "What the brain will see:"; then two bullets with bold leads: "`/delegation config` shows the options the mod runs with, each with its source, and sets any of them on every screen (MOD-73)." with a body saying the default view lists only the set options with a count line, `all` or a group name lists them all, one option shows its scope and an `in effect:` line, values read as a person reads them (on/off, `20 min`, `$10`, `200K`), names match in any case, and a set with no host row lands in `~/.claude/chassis-delegation/options.json` (`(yours)`), `repo <field> <value>` writes the repo file, `default` resets; and "Every worker's model is visible all the time (MOD-74)." with a body naming the `<task> started · <alias> (<tier>) · attempt n/b` row, the `<task> handed back · <alias> · <m> min · $<usd> · verifying` row, and the `running:` section with `brain: <model>` at the top of `/delegation`; then "What to do:" the same paragraph as the 0.9.8 section (window reload for a CLAUDE_CODE_PLUGIN_DIRS folder, dev-mods reloads after /delegation update, nothing in an existing repo's config needs to change), plus one sentence: an option set by hand in the repo file still works; to set a personal option on the VS Code extension, use `/delegation config <field> <value>`.
- Any test that pins the version string derives it from MOD_VERSION. Nothing else changes. tests/node/version.node.mjs is green, and the three gates pass.

## Review

Attempt 1 (haiku, $0.01) accepted with one doc fix in the merge commit: the README said the `running:` section names
`brain: <model>` first; it ends with it.
