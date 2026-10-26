---
id: MOD-174
title: 0.9.30: the version named in its four places, the CHANGELOG dated, and a "From 0.9.29 to 0.9.30" section
domain: mod
tier: economy
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, docs/upgrading.md]
forbid: [hooks/register.ts, hooks/lib/configtable.ts, hooks/lib/repoconfig.ts, tests/**, docs/cards/**]
red_test: none
gate: validate, node
budget: 2-attempts
spend: 3
---
## Why

0.9.29 shipped 2026-10-25. Since then MOD-169 (README fit section and docs/alignment.md), MOD-170 (the scopeAmends option), MOD-171 (merge prints amends), MOD-172 (a raised card budget reaches a reused brief) and MOD-173 (README trim, checkout-independent test) landed under Unreleased. A release carries them to the loaded plugin. Dispatched only after MOD-173 is on main.

## Done when

- `0.9.29` becomes `0.9.30` in exactly four places and nowhere else: `MOD_VERSION` in hooks/lib/version.ts, `"version"` in .claude-plugin/plugin.json, the `Version 0.9.29, MIT.` line at the end of README.md, and the CHANGELOG heading below. `grep -rn '0\.9\.29' hooks/lib/version.ts .claude-plugin/plugin.json README.md` prints nothing afterwards.
- CHANGELOG.md: the `## Unreleased` heading becomes `## 0.9.30 — 2026-10-25` (an em dash, as the headings below it), its entries unchanged; no empty `## Unreleased` is left behind.
- docs/upgrading.md gains, above `### From 0.9.28 to 0.9.29`, a `### From 0.9.29 to 0.9.30` section in the same shape as the one below it: one line per entry in the released section in the CHANGELOG's own words, shortened, then `Detail: [CHANGELOG 0.9.30](../CHANGELOG.md).` It leads with the new `scopeAmends` repo option and says its default, `apply`, keeps today's behaviour, so nothing changes on update unless a repo sets `new-files` or `ask`.
- README.md, `## How it fits Anthropic's guidance`, the **Enforces.** bullet: `Each attempt has a retry budget and a dollar ceiling;` becomes `Each attempt has a retry budget;`, so the per-attempt dollar ceiling is named once, under **Adds.** No other README line changes besides the version line.
- Nothing else changes: `git diff --stat` against the base shows exactly those five files.

## Review

Release card, consistent on attempt 1 ($0.01, Haiku). 0.9.30 appears in the four version places, and the CHANGELOG heading is dated 2026-10-25 with an em dash. No empty Unreleased heading is left behind. The README Enforces bullet no longer names the dollar ceiling, so it is named once, under Adds. docs/upgrading.md gains a "From 0.9.29 to 0.9.30" section that leads with scopeAmends and its apply default. The diff is five files and nothing else.
