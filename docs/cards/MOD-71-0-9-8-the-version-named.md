---
id: MOD-71
title: 0.9.8: the version named in its four places, the CHANGELOG dated, and a README "From 0.9.7 to 0.9.8" section
domain: mod
tier: economy
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, tests/**]
forbid: [.claude-plugin/types/**, .chassis-delegation.json, docs/**, hooks/register.ts, hooks/types/**, bin/**]
red_test: bump MOD_VERSION in hooks/lib/version.ts to 0.9.8 first and run the node suite: tests/node/version.node.mjs fails on the manifest, the README and the CHANGELOG still naming 0.9.7; save that run as the red evidence, then bring the other three into line; red first
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

One change sits under CHANGELOG "Unreleased" since v0.9.7. MOD-70 groups the /delegation config list and gives each option a plain-English line. The person asked for it, so it ships as the next patch.

## Done when

- hooks/lib/version.ts exports MOD_VERSION = '0.9.8'. .claude-plugin/plugin.json says "version": "0.9.8", and nothing else in the manifest changes. README.md says "Version 0.9.8, MIT." The CHANGELOG's "## Unreleased" heading becomes "## 0.9.8 — 2026-10-12". Its entries are unchanged, and no empty Unreleased section is left behind.
- README.md gains "### From 0.9.7 to 0.9.8" directly above "### From 0.9.6 to 0.9.7", in the same voice and shape: - First "What the brain will see:". - Then one bullet, bold lead "`/delegation config` groups the options and says what each does (MOD-70)." Its body: the list is under seven headings (Workers and models, Checking the work, Where things go, Debriefs, Evals, Guards and nudges for the brain, Display), with a one-line summary under each option; `/delegation config <field>` adds the full description. - Then "What to do:" a window that loads the plugin from a folder named by CLAUDE_CODE_PLUGIN_DIRS needs a window reload to pick this up. A clone under ~/.claude/dev-mods reloads at the end of the turn after /delegation update. Nothing in an existing repo's config needs to change.
- Any test that pins the version string derives it from MOD_VERSION. Nothing else changes. tests/node/version.node.mjs is green, and the three gates pass.
