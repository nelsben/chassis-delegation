---
id: MOD-220
title: 0.9.38: the version named in its four places, the CHANGELOG dated, a "From 0.9.37 to 0.9.38" section, and the project option text says the repo file wins
domain: mod
tier: economy
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, docs/upgrading.md]
forbid: [hooks/register.ts, hooks/lib/land.ts, hooks/lib/landtree.ts, hooks/lib/card.ts, hooks/lib/verify.ts, hooks/lib/verify-native.ts, hooks/lib/redact.ts, hooks/lib/norepo.ts, tests/**, docs/cards/**]
red_test: none
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

0.9.37 shipped 2026-10-30. Since then MOD-213 to MOD-219 (adopter feedback: land_plan parent and empty paths, filing closed, tree import, scope attribution, redaction and Project opt-outs, #N and URL issue refs with parked, and dispatch wording) landed under Unreleased. A release carries them to the loaded plugin; MOD-218 also left the plugin.json description of `project` saying the user value wins, which is now wrong.

## Done when

- `0.9.37` becomes `0.9.38` in exactly four places and nowhere else: `MOD_VERSION` in hooks/lib/version.ts, `"version"` in .claude-plugin/plugin.json, the `Version 0.9.37, MIT.` line at the end of README.md, and the CHANGELOG heading below. `grep -rn '0\.9\.37' hooks/lib/version.ts .claude-plugin/plugin.json README.md` prints nothing afterwards.
- CHANGELOG.md: the `## Unreleased` heading becomes `## 0.9.38 — 2026-10-31` (an em dash, as the headings below it), its entries unchanged; no empty `## Unreleased` is left behind.
- In .claude-plugin/plugin.json the `project` option's description loses its last sentence (`A value here other than the default wins over the repo file (.chassis-delegation.json)`) and ends instead with `A project in the repo file (.chassis-delegation.json), including none, wins over this value; land and land_plan take project: false, and /delegation land takes --no-project, to skip the add for one call.` Nothing else in plugin.json changes besides the version.
- docs/upgrading.md gains, above `### From 0.9.36 to 0.9.37`, a `### From 0.9.37 to 0.9.38` section in the same shape as the one below it: a first line saying nothing needs doing to upgrade and that a scope refute now charges only paths the worker wrote; then `Added:` summarising, shortened, land_plan `parent` and pathless feature/epic/story items with zero tasks, `land --closed` and land_plan `close`, `/delegation tree import` with the `treeImportBatch` option, the repo-level `project` (including `none`) with `project: false` and `--no-project`, and `issue:`/`parent:` accepting `#12` and an issue URL with the `parked` status; then `Fixed:` summarising scope charged only for the worker's writes and `.delegation/**` out of every delta, redaction leaving dotfolder segments and the target repo name alone, and the dispatch wording (no outside-scope warning for red_test paths, queue position for a tier-capped lane, `gate reused (recorded pass, not re-run)` in the verdict row); then `Detail: [CHANGELOG 0.9.38](../CHANGELOG.md).`
- Nothing else changes: `git diff --stat` against the base shows exactly those five files.

## Review

Release card: five scoped files only; the version is in its four places, the CHANGELOG is dated 2026-10-31, the upgrading section is in the shape asked for, and the project option text now says the repo file wins. Accepted.
