---
id: MOD-208
title: landAuto defaults to off: land shows the issue and files only on confirm unless a repo turns it on
domain: mod
tier: standard
status: merged
issue: 301
scope: [hooks/register.ts, hooks/lib/configtable.ts, hooks/lib/land.ts, hooks/lib/landnudge.ts, .claude-plugin/plugin.json, docs/configuration.md, docs/guide.md, tests/*.test.ts, tests/node/*.mjs, CHANGELOG.md]
forbid: [hooks/lib/version.ts, hooks/lib/allow.ts, docs/upgrading.md, README.md, docs/cards/**]
red_test: claude plugin test . (new tests: unset landAuto files nothing and the nudge says propose — fail now)
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Issue #301: filing a GitHub issue is an outward action, and many repos need the person's yes before anything is written to GitHub. landAuto (MOD-205) defaults on; the founder agreed to flip the default so a fresh install files nothing without a yes, and repos that want auto-filing set /delegation config landAuto on.

## Done when

- landAuto defaults to false everywhere its default is stated: the option read in hooks/register.ts (unset means off; only an explicit true or on turns it on), the configtable row, the userConfig entry in .claude-plugin/plugin.json (default and description only; the version is untouched), the land tool's description and confirm parameter text in hooks/lib/land.ts, and the landAuto row of docs/configuration.md and the land paragraph of docs/guide.md.
- With the option unset, the land tool and /delegation land write the body, show the issue and print the existing `nothing filed: landAuto is off; …` line, and file with confirm: true (or --confirm). The land nudge says propose by default (nudgeLine's default follows).
- Tests: existing tests that relied on land filing at once pass `{ options: { landAuto: true } }` (or confirm: true) instead of being weakened; new tests show unset means off (land files nothing, the nudge says propose) and `/delegation config landAuto on` restores filing at once.
- land_plan, the dispatch and verdict status comments, merge-finish closes and --supersedes behave exactly as before apart from following land's confirm.
- CHANGELOG.md gains a Changed entry under the existing `## Unreleased` heading naming MOD-208 and #301, saying how to turn it back on. validate, the node tests and the engine suite pass.

## Review

Consistent on attempt 1 (sonnet, $0.36). landAuto is read as true or 'on' only, so unset means off; configtable, plugin.json (default and description), land tool text, nudge default and docs updated. Eleven tests that relied on filing at once now set landAuto: true explicitly; new tests cover unset = off and config on restoring it.
