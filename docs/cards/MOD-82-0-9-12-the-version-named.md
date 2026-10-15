---
id: MOD-82
title: 0.9.12: the version named in its four places, the CHANGELOG dated, and a README "From 0.9.11 to 0.9.12" section
domain: mod
tier: economy
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, tests/**]
forbid: [.claude-plugin/types/**, .chassis-delegation.json, docs/**, hooks/register.ts, hooks/lib/allow.ts, hooks/lib/debriefdir.ts, hooks/lib/live.ts, hooks/lib/band.tsx, hooks/lib/mergecmd.ts, hooks/lib/verdicttool.ts, hooks/types/**, bin/**]
red_test: bump MOD_VERSION in hooks/lib/version.ts to 0.9.12 first and run the node suite: tests/node/version.node.mjs fails on the manifest, the README and the CHANGELOG still naming 0.9.11; save that run as the red evidence, then bring the other three into line; red first
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

Two changes sit under CHANGELOG "Unreleased" since v0.9.11: MOD-81 makes the band the one delegation meter (the host status line is cleared while the band is drawn, and the band carries the live labels, the context percent and the newest dollars), and MOD-80 makes `/delegation debrief post` and `apply` find the findings the person's own debrief skill writes under ~/.claude/harness/debriefs. The person asked for both, so they ship as the next patch.

## Done when

- hooks/lib/version.ts exports MOD_VERSION = '0.9.12'. .claude-plugin/plugin.json says "version": "0.9.12", and nothing else in the manifest changes. README.md says "Version 0.9.12, MIT." The CHANGELOG's "## Unreleased" heading becomes "## 0.9.12 — 2026-10-15". Its two entries are unchanged, and no empty Unreleased section is left behind.
- README.md gains "### From 0.9.11 to 0.9.12" directly above "### From 0.9.10 to 0.9.11", in the same voice and shape: first "What the brain will see:"; then two bullets with bold leads: "One delegation meter (MOD-81)." with a body saying that while the band above the prompt is drawn the host status line under it is cleared, the band's row names the live workers and the context percent, and both read the same newest dollars, so the two no longer disagree; with the band off, empty or not drawn for over a minute the status line shows as before; and "`debrief post` and `apply` find your debrief (MOD-80)." with a body saying that with your own debrief skill installed the findings land under ~/.claude/harness/debriefs, and the by-hand doors now read this session's debrief there (another session's file in that shared folder is never picked), and a refusal names every folder it looked in; then "What to do:" the same paragraph as the 0.9.11 section's first three sentences (window reload for a CLAUDE_CODE_PLUGIN_DIRS folder, dev-mods reloads after /delegation update, nothing in an existing repo's config needs to change), without its modelGlyphs sentence.
- Any test that pins the version string derives it from MOD_VERSION. Nothing else changes. tests/node/version.node.mjs is green, and the three gates pass.

## Review

Attempt 1 (haiku, $0.02) accepted as handed back; no fixes.
