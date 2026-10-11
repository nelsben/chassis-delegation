---
id: MOD-50
title: 0.9.1: the version named in its four places, the CHANGELOG dated, a README "From 0.9.0 to 0.9.1" section, and the README's deprecated-word paragraph brought in line with MOD-49
domain: mod
tier: economy
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, tests/**]
forbid: [.claude-plugin/types/**, .chassis-delegation.json, docs/**, hooks/register.ts, hooks/types/**, bin/**]
red_test: bump MOD_VERSION in hooks/lib/version.ts to 0.9.1 first and run the node suite: tests/node/version.node.mjs fails on the manifest, the README and the CHANGELOG still naming 0.9.0; save that run as the red evidence, then bring the other three into line; red first
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

Three changes sit under CHANGELOG "Unreleased" since v0.9.0: the session cost figures now match what a session costs (MOD-47), the brain sees what driving costs it with the driveWarn and driveWarnTokens options (MOD-48), and the legacy verdict reader is removed (MOD-49). None changes a contract, so this is a patch bump. The README's "Deprecated: verified" paragraph in the contracts section still says the old word is read "until 0.9.0" and then dropped, which no longer matches what MOD-49 shipped: one read-only normaliser that keeps reading a stored record or row with the old word as consistent, with no deadline.

## Done when

- hooks/lib/version.ts exports MOD_VERSION = '0.9.1', .claude-plugin/plugin.json says "version": "0.9.1" and nothing else in the manifest changes, README.md says "Version 0.9.1, MIT.", and the CHANGELOG's "## Unreleased" heading becomes "## 0.9.1 — 2026-10-11" with its entries unchanged and no empty Unreleased section left behind
- README.md gains "### From 0.9.0 to 0.9.1" directly above "### From 0.9.0 to 0.9.0"'s predecessor, that is directly above "### From 0.8.3 to 0.9.0", in the same voice and shape: "What the brain will see:" then a bullet that the brain and worker cost figures in /delegation and the dashboard now follow each model's own cache-read price and 1-hour cache writes at 2x, so the money line can read higher than before on the same session (MOD-47); a bullet that /delegation and the dashboard show a brain calls row and a warn row on by default, with the options driveWarn and driveWarnTokens (MOD-48); and a bullet that the legacy verdict word verified is no longer read by a reader of its own and a stored record or row that still carries it is read as consistent by one normaliser, with no further deadline (MOD-49); then a "What to do" note: nothing in an existing repo's config needs to change; set driveWarn to false in /config to silence the warn row
- the README paragraph beginning "**Deprecated: `verified`.**" in the contracts section no longer says the word is read until 0.9.0 or dropped then: it says the mod stopped writing the word at 0.8.0, that one read-only normaliser reads a stored attempt record, verdict line or metrics count that still carries it as consistent (MOD-49), that a ledger line already written keeps its word, and that a script parsing old rows should accept both words; no other README paragraph changes
- any test that pins the version string derives it from MOD_VERSION; no other change; tests/node/version.node.mjs is green and the three gates pass
