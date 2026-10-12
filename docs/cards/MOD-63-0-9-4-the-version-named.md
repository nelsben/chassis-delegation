---
id: MOD-63
title: 0.9.4: the version named in its four places, the CHANGELOG dated, and a README "From 0.9.3 to 0.9.4" section
domain: mod
tier: economy
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, tests/**]
forbid: [.claude-plugin/types/**, .chassis-delegation.json, docs/**, hooks/register.ts, hooks/types/**, bin/**]
red_test: bump MOD_VERSION in hooks/lib/version.ts to 0.9.4 first and run the node suite: tests/node/version.node.mjs fails on the manifest, the README and the CHANGELOG still naming 0.9.3; save that run as the red evidence, then bring the other three into line; red first
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

One change sits under CHANGELOG "Unreleased" since v0.9.3. MOD-62 stops a wake held during the brain's open turn from being sent again when a later step of that turn already read its row. Without it, a verdict or the debrief's post question started a second turn that only repeated it. The change is additive, so this is a patch bump.

## Done when

- hooks/lib/version.ts exports MOD_VERSION = '0.9.4'. .claude-plugin/plugin.json says "version": "0.9.4", and nothing else in the manifest changes. README.md says "Version 0.9.4, MIT." The CHANGELOG's "## Unreleased" heading becomes "## 0.9.4 — 2026-10-11". Its entries are unchanged, and no empty Unreleased section is left behind.
- README.md gains "### From 0.9.3 to 0.9.4" directly above "### From 0.9.2 to 0.9.3", in the same voice and shape: - First "What the brain will see:". - Then one bullet, bold lead "A wake the brain already read is not sent again (MOD-62)." Its body: a verdict, ready line or post question that lands while the brain's turn is open, and that a later step of the turn read, no longer starts a second turn at the turn's end that repeats it. One that lands in the turn's last step still wakes the brain. - Then "What to do:" a window that loads the plugin from a folder named by CLAUDE_CODE_PLUGIN_DIRS needs a window reload to pick this up. A clone under ~/.claude/dev-mods reloads at the end of the turn after /delegation update. Nothing in an existing repo's config needs to change.
- Any test that pins the version string derives it from MOD_VERSION. Nothing else changes. tests/node/version.node.mjs is green, and the three gates pass.
