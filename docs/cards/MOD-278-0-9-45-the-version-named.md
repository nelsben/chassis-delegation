---
id: MOD-278
title: 0.9.45: the version named in its three places, the CHANGELOG's Unreleased section dated, and the two Unreleased upgrading notes folded into one "From 0.9.44 to 0.9.45" section
domain: mod
tier: economy
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, docs/upgrading.md]
forbid: [hooks/register.ts, hooks/lib/scheduler.ts, hooks/lib/configeff.ts, hooks/lib/configtable.ts, hooks/lib/allow.ts, docs/cards/**]
red_test: none
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

0.9.44 shipped 2026-11-01. Since then MOD-268, 269, 270, 271, 272, 273, 274, 275, 276 and 277 have landed on main, each with an Unreleased entry. A release carries them to the loaded plugin.

## Done when

- `0.9.44` becomes `0.9.45` in exactly three places and nowhere else: `MOD_VERSION` in hooks/lib/version.ts, `"version"` in .claude-plugin/plugin.json, and the `Version 0.9.44, MIT.` line at the end of README.md. `grep -rn '0\.9\.44' hooks/lib/version.ts .claude-plugin/plugin.json README.md` prints nothing afterwards.
- CHANGELOG.md: the `## Unreleased` heading becomes `## 0.9.45 — 2026-11-02` (an em dash, like the headings below it). Its `### Added` and `### Fixed` subsections and their bullets are unchanged, and no empty `## Unreleased` is left behind. The 0.9.44 section and everything below it are unchanged.
- docs/upgrading.md: the two sections `### Unreleased (MOD-276)` and `### Unreleased (MOD-271)` are replaced, in the same place (directly above `### From 0.9.43 to 0.9.44`), by one `### From 0.9.44 to 0.9.45` section with these lines in order: the MOD-276 paragraph verbatim; the MOD-271 paragraph verbatim; then `New: frontier and premium workers need a reason, a share of first tries runs one step cheaper (explore, default 0.2) so the ledger learns what each class of card needs, and the dispatch dry run may suggest a cheaper model and effort (adaptive, default suggest). allowFable (default off) lets a card or reviewer that asks for fable run on it.`; then `Detail: [CHANGELOG 0.9.45](../CHANGELOG.md).`; then a blank line. The paragraph text is not otherwise reworded.
- Nothing else changes: `git diff --stat` against the base shows exactly those five files.
- Gates validate, node and test are green.
