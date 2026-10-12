---
id: MOD-65
title: 0.9.5: the version named in its four places, the CHANGELOG dated, and a README "From 0.9.4 to 0.9.5" section
domain: mod
tier: economy
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, tests/**]
forbid: [.claude-plugin/types/**, .chassis-delegation.json, docs/**, hooks/register.ts, hooks/types/**, bin/**]
red_test: bump MOD_VERSION in hooks/lib/version.ts to 0.9.5 first and run the node suite: tests/node/version.node.mjs fails on the manifest, the README and the CHANGELOG still naming 0.9.4; save that run as the red evidence, then bring the other three into line; red first
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

One change sits under CHANGELOG "Unreleased" since v0.9.4: MOD-64 turns wakes off by default and adds the verdict tool, so a verdict no longer starts a turn of the brain's own. The person wants it out now, so it ships as the next patch.

## Done when

- hooks/lib/version.ts exports MOD_VERSION = '0.9.5'. .claude-plugin/plugin.json says "version": "0.9.5", and nothing else in the manifest changes. README.md says "Version 0.9.5, MIT." The CHANGELOG's "## Unreleased" heading becomes "## 0.9.5 — 2026-10-11". Its entries are unchanged, and no empty Unreleased section is left behind.
- README.md gains "### From 0.9.4 to 0.9.5" directly above "### From 0.9.3 to 0.9.4", in the same voice and shape: - First "What the brain will see:". - Then one bullet, bold lead "Wakes are off by default, and the brain waits for its verdict with the verdict tool (MOD-64)." Its body: a verdict no longer submits "The chassis-delegation plugin sent a message" as a turn of its own; the verdict row is still appended; in the hand-back turn the brain calls the verdict tool with the task id, which returns the verdict once it lands; the dispatch text and the Delegation state section say so. - Then "What to do:" a window that loads the plugin from a folder named by CLAUDE_CODE_PLUGIN_DIRS needs a window reload to pick this up. A clone under ~/.claude/dev-mods reloads at the end of the turn after /delegation update. To keep the old wakes, set wakeOnVerdict to true in /config. Nothing in an existing repo's config needs to change.
- Any test that pins the version string derives it from MOD_VERSION. Nothing else changes. tests/node/version.node.mjs is green, and the three gates pass.
