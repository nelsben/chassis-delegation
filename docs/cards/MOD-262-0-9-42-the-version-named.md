---
id: MOD-262
title: 0.9.42: the version named in its four places, a dated 0.9.42 CHANGELOG section with the five cards since 0.9.41, and a "From 0.9.41 to 0.9.42" section
domain: mod
tier: economy
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, docs/upgrading.md]
forbid: [hooks/register.ts, hooks/lib/scheduler.ts, hooks/lib/configeff.ts, hooks/lib/configtable.ts, hooks/lib/allow.ts, tests/**, docs/cards/**]
red_test: none
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

0.9.41 shipped 2026-10-31. Since then MOD-255..259 landed on main (two bug fixes, one defect, two test-only cards) but none of them wrote a CHANGELOG entry, so there is no Unreleased section. A release carries them to the loaded plugin.

## Done when

- `0.9.41` becomes `0.9.42` in exactly three places and nowhere else: `MOD_VERSION` in hooks/lib/version.ts, `"version"` in .claude-plugin/plugin.json, and the `Version 0.9.41, MIT.` line at the end of README.md. `grep -rn '0\.9\.41' hooks/lib/version.ts .claude-plugin/plugin.json README.md` prints nothing afterwards.
- CHANGELOG.md gains, directly under `# Changelog` and above `## 0.9.41 — 2026-10-31`, a `## 0.9.42 — 2026-11-01` heading (an em dash, as the headings below it), a blank line, `### Changed`, a blank line, and exactly these four bullets in this order, copied verbatim; the 0.9.41 section and everything below it is unchanged and no `## Unreleased` heading is added.
- Bullet 1: `- **The band stops owing a review for a task whose newest review row accepts it (MOD-255).** Since MOD-231 a newest review row with next=accept resolves the task to its consistent row and merge accepts it, but the band above the prompt kept drawing the review as owed. `liveModel` now drops such a task from the owed rows with `reviewAcceptedAttempt` (the function merge uses), so it draws as consistent; a refuting review still shows its next step. A ledger append advances the live model's generation, so the band redraws at once. Tests in `tests/landnudge-band.test.ts`.`
- Bullet 2: `- **A file a repo=here or outside-root worker made through a script it ran is charged to that worker (MOD-256).** Around each of the worker's Bash commands that is not read-only (`bashReadOnly` in `hooks/lib/norepo.ts`; anything unrecognised counts as a write) the mod snapshots the delta paths before and after (git status for repo=here, the outside listing for an outside root, at most 300 paths) and adds those that appeared or changed (`deltaPaths`) to the worker's write log, so the verifier no longer lists them as changed by someone else. Worktree cards and read-only Bash take no snapshot. Known gap: a sibling's write during the same command is charged to the worker too (MOD-261). Tests in `tests/norepo.test.ts`.`
- Bullet 3: `- **`/delegation config` says when the repo file's `project` overrides yours (MOD-257).** When `.chassis-delegation.json` sets `project` and your `/config` value differs, its line gains `(your /config value <v> is overridden by the repo file)` (`overriddenNote` in `hooks/lib/configcmd.ts`); other fields are unchanged.`
- Bullet 4: `- **Tests only (MOD-258, MOD-259).** Engine tests for `orphanReview` (an unmatched reviewer hand-back is adopted once by task, attempt and sha) and the `N lanes share the engine gate` note (`tests/review.test.ts`, `tests/dispatchsays.test.ts`), and for the land overlap list leaving out a parked and a merged card (`tests/land.test.ts`). No behaviour changed.`
- docs/upgrading.md gains, directly above `### From 0.9.40 to 0.9.41`, a `### From 0.9.41 to 0.9.42` section in the same shape as the one below it, these lines in order: `Nothing needs doing to upgrade.`, then `Changed: a repo=here or outside-root worker's script-written files count as its own; `/delegation config` notes a `project` the repo file overrides.`, then `Fixed: the band no longer shows a review as owed after a review accepted the attempt.`, then `Detail: [CHANGELOG 0.9.42](../CHANGELOG.md).`, then a blank line.
- Nothing else changes: `git diff --stat` against the base shows exactly those five files.
- Gates validate, node and test are green.
