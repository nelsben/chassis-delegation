---
id: MOD-283
title: 0.9.47: the version named in its three places, the CHANGELOG's Unreleased section dated, and a "From 0.9.46 to 0.9.47" upgrading note added
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

0.9.46 shipped 2026-11-03. MOD-281 (blocked by environment fires only when every Bash call was refused as changed, never on an ordinary failed command) and MOD-282 (every engine test gets a 20-second timeout through tests/harness.ts) have since landed on main with Unreleased entries. MOD-281 closes a regression 0.9.46 introduced, so it ships now.

## Done when

- `0.9.46` becomes `0.9.47` in exactly three places and nowhere else: `MOD_VERSION` in hooks/lib/version.ts, `"version"` in .claude-plugin/plugin.json, and the `Version 0.9.46, MIT.` line at the end of README.md. `grep -rn '0\.9\.46' hooks/lib/version.ts .claude-plugin/plugin.json README.md` prints nothing afterwards.
- CHANGELOG.md: the `## Unreleased` heading becomes `## 0.9.47 — 2026-11-03` (an em dash, like the headings below it), followed by a blank line and a `### Fixed` subsection holding the two existing bullets unchanged (the MOD-281 bullet first, then the MOD-282 bullet). No empty `## Unreleased` is left behind. The 0.9.46 section and everything below it are unchanged.
- docs/upgrading.md: a new section is inserted directly above `### From 0.9.45 to 0.9.46`, with a blank line after it: the heading `### From 0.9.46 to 0.9.47`, a blank line, then exactly this paragraph: `No action needed. A worker whose Bash fails for an ordinary reason (a permission error, a failed push) is judged and charged as before; only an attempt whose every Bash call the host refused as changed is shown as blocked by environment. Engine tests written for this repo import test from tests/harness.ts, which gives each a 20-second timeout. Detail: [CHANGELOG 0.9.47](../CHANGELOG.md).` No other text changes.
- Nothing else changes: `git diff --stat` against the base shows exactly those five files.
- Gates validate, node and test are green.

## Review

Brain review: version in its three places, CHANGELOG dated with a Fixed subsection, upgrading note added verbatim. The two bullets kept their Unreleased order (MOD-282 first) rather than the card's MOD-281-first; cosmetic, accepted.
