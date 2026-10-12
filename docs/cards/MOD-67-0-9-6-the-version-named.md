---
id: MOD-67
title: 0.9.6: the version named in its four places, the CHANGELOG dated, and a README "From 0.9.5 to 0.9.6" section
domain: mod
tier: economy
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, tests/**]
forbid: [.claude-plugin/types/**, .chassis-delegation.json, docs/**, hooks/register.ts, hooks/types/**, bin/**]
red_test: bump MOD_VERSION in hooks/lib/version.ts to 0.9.6 first and run the node suite: tests/node/version.node.mjs fails on the manifest, the README and the CHANGELOG still naming 0.9.5; save that run as the red evidence, then bring the other three into line; red first
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

One change sits under CHANGELOG "Unreleased" since v0.9.5. MOD-66 adds /delegation config, so the mod's options can be changed where /config is taken or missing, as in the VS Code extension. The person asked for it, so it ships as the next patch.

## Done when

- hooks/lib/version.ts exports MOD_VERSION = '0.9.6'. .claude-plugin/plugin.json says "version": "0.9.6", and nothing else in the manifest changes. README.md says "Version 0.9.6, MIT." The CHANGELOG's "## Unreleased" heading becomes "## 0.9.6 — 2026-10-12". Its entries are unchanged, and no empty Unreleased section is left behind.
- README.md gains "### From 0.9.5 to 0.9.6" directly above "### From 0.9.4 to 0.9.5", in the same voice and shape: - First "What the brain will see:". - Then one bullet, bold lead "`/delegation config` lists, shows and sets the mod's own options (MOD-66)." Its body: `/delegation config` lists every option with its value; `/delegation config <field>` shows one; `/delegation config <field> <value>` sets it and the mod reloads with it. Messages that said to set an option in /config now name this command. - Then "What to do:" a window that loads the plugin from a folder named by CLAUDE_CODE_PLUGIN_DIRS needs a window reload to pick this up. A clone under ~/.claude/dev-mods reloads at the end of the turn after /delegation update. Nothing in an existing repo's config needs to change.
- Any test that pins the version string derives it from MOD_VERSION. Nothing else changes. tests/node/version.node.mjs is green, and the three gates pass.
