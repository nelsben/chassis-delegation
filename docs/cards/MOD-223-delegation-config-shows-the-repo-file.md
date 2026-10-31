---
id: MOD-223
title: /delegation config shows the repo file's project (including none) as the value in effect
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/configcmd.ts, hooks/lib/configeff.ts, tests/configcmd.test.ts, tests/node/*.mjs, CHANGELOG.md]
forbid: [hooks/lib/allow.ts, hooks/lib/version.ts, .claude-plugin/plugin.json, hooks/lib/land.ts, docs/cards/**]
red_test: claude plugin test . (a new tests/configcmd.test.ts case fails now: a repo file with project none shows the user's acme/3)
gate: validate, node, test
budget: 2-attempts
spend: 6
---
## Why

Since MOD-218 a `project` in the repo file (`.chassis-delegation.json`), including `none`, wins over the user option for the land add. But the repo value is stripped before the repo config parser (hooks/lib/configeff.ts about line 174) and kept apart in `repoProject` (hooks/register.ts about line 1089), so `/delegation config project` and the short view still show the user value as if it were in effect.

## Done when

- With a repo file that sets `project` to `owner/number` or `none`, `/delegation config project` shows that value with the source `(repo)`, e.g. `project = none (repo)`; when the user option is also set, the line names it as overridden in the same way other options that the repo file beats are shown (follow the existing wording for an overridden source; do not invent a new one).
- The short `/delegation config` view lists `project` under its group with the repo value and `(repo)`, and the count line counts it as a repo-set option.
- With no `project` in the repo file, the view is exactly as today (the user value, or the default).
- What land actually adds to is unchanged: `effectiveProject()` keeps its MOD-218 behaviour, and no land test changes.
- tests/configcmd.test.ts gains cases: repo `none` with user `acme/3` shows `none` from the repo; repo `acme/9` with user `acme/3` shows `acme/9` from the repo; no repo project shows `acme/3 (yours)`.
- CHANGELOG.md gains a Fixed entry under `## Unreleased` naming MOD-223. validate, the node tests and the engine suite pass.

## Review

configView now takes the repo file's project (owner/number or none) as the value in effect, with source repo; land's effectiveProject is untouched. The first verify ran out of time under machine load (load average about 100 from other sessions); the re-verify was green. No overridden-value note: the code has no wording for a user value the repo beats. Accepted.
