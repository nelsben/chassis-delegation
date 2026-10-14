---
id: MOD-79
title: 0.9.11: the version named in its four places, the CHANGELOG dated, and a README "From 0.9.10 to 0.9.11" section
domain: mod
tier: economy
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, tests/**]
forbid: [.claude-plugin/types/**, .chassis-delegation.json, docs/**, hooks/register.ts, hooks/lib/allow.ts, hooks/lib/glyph.ts, hooks/lib/mergecmd.ts, hooks/lib/verdicttool.ts, hooks/types/**, bin/**]
red_test: bump MOD_VERSION in hooks/lib/version.ts to 0.9.11 first and run the node suite: tests/node/version.node.mjs fails on the manifest, the README and the CHANGELOG still naming 0.9.10; save that run as the red evidence, then bring the other three into line; red first
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

One change sits under CHANGELOG "Unreleased" since v0.9.10: MOD-78 puts a model glyph on the host's subagent rows and every mod row, with the modelGlyphs option. The person asked for it, so it ships as the next patch.

## Done when

- hooks/lib/version.ts exports MOD_VERSION = '0.9.11'. .claude-plugin/plugin.json says "version": "0.9.11", and nothing else in the manifest changes. README.md says "Version 0.9.11, MIT." The CHANGELOG's "## Unreleased" heading becomes "## 0.9.11 — 2026-10-13". Its entry is unchanged, and no empty Unreleased section is left behind.
- README.md gains "### From 0.9.10 to 0.9.11" directly above "### From 0.9.9 to 0.9.10", in the same voice and shape: first "What the brain will see:"; then one bullet with a bold lead, "A glyph names the model on every row (MOD-78)." with a body saying that every subagent the mod starts reaches the host with its model's glyph in front of the description, so the host's own task row shows the model; the started, resumed, handed-back and one-line verdict rows, the `running:` and `brain:` lines of `/delegation`, and the band and pane carry the same glyph before the alias; the legend is 🟢 haiku · 🔵 sonnet · 🟣 opus · 🟠 fable · ⚪ other; the ledger and the debug log stay bare; then "What to do:" the same paragraph as the 0.9.10 section (window reload for a CLAUDE_CODE_PLUGIN_DIRS folder, dev-mods reloads after /delegation update, nothing in an existing repo's config needs to change), plus one sentence: `/delegation config modelGlyphs off` turns the glyphs off, and `alias=glyph` pairs such as `sonnet=🟦` change them.
- Any test that pins the version string derives it from MOD_VERSION. Nothing else changes. tests/node/version.node.mjs is green, and the three gates pass.

## Review

Attempt 1 (haiku, $0.01) accepted as handed back; no fixes. The worker rightly left the 0.9.10 section's merge-command sentence out of the new "What to do" paragraph: it belongs to that release.
