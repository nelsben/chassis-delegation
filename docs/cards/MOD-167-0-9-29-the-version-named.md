---
id: MOD-167
title: 0.9.29: the version named in its four places, the CHANGELOG dated, and a "From 0.9.28 to 0.9.29" section
domain: mod
tier: economy
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, docs/upgrading.md]
forbid: [hooks/register.ts, hooks/lib/configtable.ts, hooks/lib/repoconfig.ts, tests/**, docs/cards/**]
red_test: none
gate: validate
budget: 2-attempts
spend: 3
---
## Why

0.9.28 shipped 2026-10-25; since then MOD-162 (lane done-when appends), MOD-163 (repo=none gate root), the README Why section with honest evidence, and the review and delegateOnly default changes landed under Unreleased. A release carries them to the loaded plugin. Dispatched only after the two cards before it are on main.

## Done when

- `0.9.28` becomes `0.9.29` in exactly four places and nowhere else: `MOD_VERSION` in hooks/lib/version.ts, `"version"` in .claude-plugin/plugin.json, the `Version 0.9.28, MIT.` line at the end of README.md, and the CHANGELOG heading below. `grep -rn '0\.9\.28' hooks/lib/version.ts .claude-plugin/plugin.json README.md` prints nothing afterwards.
- CHANGELOG.md: the `## Unreleased` heading becomes `## 0.9.29 — 2026-10-25` (an em dash, as the headings below it), its entries unchanged; no empty `## Unreleased` is left behind.
- docs/upgrading.md gains, above `### From 0.9.27 to 0.9.28`, a `### From 0.9.28 to 0.9.29` section in the same shape as the one below it: one line per entry in the released section in the CHANGELOG's own words, shortened, then `Detail: [CHANGELOG 0.9.29](../CHANGELOG.md).` It names the two default changes (review on-frontier, delegateOnly warn) and how to turn each off, since those change behaviour on update.
- Nothing else changes: `git diff --stat` against the base shows exactly those five files.

## Review

Consistent on attempt 1; release card. 0.9.29 in the four version places (version.ts, plugin.json, README last line, CHANGELOG heading dated 2026-10-25 with the em dash), no empty Unreleased left, and docs/upgrading.md gains "From 0.9.28 to 0.9.29" leading with the two default changes and how to turn each off in the repo file, then the other three entries and the Detail link. Diff read: five files, nothing else.
