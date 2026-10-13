---
id: MOD-77
title: 0.9.10: the version named in its four places, the CHANGELOG dated, and a README "From 0.9.9 to 0.9.10" section
domain: mod
tier: economy
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, tests/**]
forbid: [.claude-plugin/types/**, .chassis-delegation.json, docs/**, hooks/register.ts, hooks/lib/allow.ts, hooks/lib/mergecmd.ts, hooks/lib/verdicttool.ts, hooks/types/**, bin/**]
red_test: bump MOD_VERSION in hooks/lib/version.ts to 0.9.10 first and run the node suite: tests/node/version.node.mjs fails on the manifest, the README and the CHANGELOG still naming 0.9.9; save that run as the red evidence, then bring the other three into line; red first
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

Two changes sit under CHANGELOG "Unreleased" since v0.9.9: MOD-72 makes the verdict tool wait in sleep processes through the allowlist instead of clock sleeps that spent the hook's budget, and MOD-75 adds `/delegation merge <ID>` and `--finish`, the local merge pipeline with the remote block printed for the brain. The person asked for both, so they ship as the next patch.

## Done when

- hooks/lib/version.ts exports MOD_VERSION = '0.9.10'. .claude-plugin/plugin.json says "version": "0.9.10", and nothing else in the manifest changes. README.md says "Version 0.9.10, MIT." The CHANGELOG's "## Unreleased" heading becomes "## 0.9.10 — 2026-10-13". Its entries are unchanged, and no empty Unreleased section is left behind.
- README.md gains "### From 0.9.9 to 0.9.10" directly above "### From 0.9.8 to 0.9.9", in the same voice and shape: first "What the brain will see:"; then two bullets with bold leads: "The verdict tool answers after a real wait (MOD-72)." with a body saying a call made before the verifier has judged now waits up to waitSeconds in `sleep` steps and returns the verdict row, where before it failed with 'no tool.call hook answered this call'; the allowlist gains exactly one rule, `sleep <1..600 whole seconds>`; and "`/delegation merge <ID>` does the local merge pipeline (MOD-75)." with a body saying that after a consistent verdict it rebases, commits the merged card, runs the card's gates and prints one block (push, gh pr create, gh pr merge, `/delegation merge <ID> --finish`) for the brain to run verbatim; `--finish` cleans up and prints the release block when the version bumped; the mod itself still never pushes nor runs gh; see the README section "Merging a card"; then "What to do:" the same paragraph as the 0.9.9 section (window reload for a CLAUDE_CODE_PLUGIN_DIRS folder, dev-mods reloads after /delegation update, nothing in an existing repo's config needs to change), plus one sentence: from now on, merge a consistent card with `/delegation merge <ID>` rather than by hand.
- Any test that pins the version string derives it from MOD_VERSION. Nothing else changes. tests/node/version.node.mjs is green, and the three gates pass.

## Review

Attempt 1 (haiku, $0.02) accepted as handed back; no fixes.
