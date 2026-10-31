---
id: MOD-218
title: Land redaction leaves dotfolder path segments and the target repo's own name alone, and the Project add has a repo and a per-call opt-out
domain: mod
tier: standard
status: merged
scope: [hooks/lib/redact.ts, hooks/lib/land.ts, hooks/lib/configeff.ts, hooks/register.ts, tests/*.test.ts, tests/node/*.mjs, docs/configuration.md, CHANGELOG.md]
forbid: [hooks/lib/allow.ts, hooks/lib/version.ts, .claude-plugin/plugin.json, docs/cards/**]
red_test: claude plugin test . (dotfolder, same-repo and project opt-out cases fail now)
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Adopter feedback: land redaction rewrote `~/.<name>/` to `~/.<repo>/` because the repo-name rule matched a dotfolder path segment; and the Project auto-add has no per-repo or per-call opt-out, since the user-level `project` option wins over the repo's config, so the only way to keep one repo's issues out was to edit the global file.

## Done when

- hooks/lib/redact.ts: the repo-name and word-list rules do not match a name that is a path segment starting with a dot (preceded by `.` right after `/` or `~/`, e.g. `~/.name/`, `/x/.name`); the home, person and email rules are unchanged. Node tests cover `~/.name/` kept, `/Users/x/.name` still scrubbed to `<home>/.name`, and a bare name in prose still replaced.
- land and land_plan skip the origin and repo-name rules when the issue goes to the same repo as origin (its name is already public there); every other rule still applies. Debrief redaction is unchanged.
- Project add precedence: a repo-level `project` value (the repo's own config file the mod already reads, including the value `none`) wins over the user-level option; `none` adds nothing and prints no line. land and land_plan take `project: false` (and `/delegation land --no-project`), which skips the item-add for that call only. docs/configuration.md says the precedence in one sentence.
- Tests (engine): same-repo land keeps the repo name in title and body; a dotfolder path survives; repo-level `project none` beats a user-level project; `project: false` runs no item-add.
- CHANGELOG.md gains Fixed and Added entries under `## Unreleased` naming MOD-218. validate, the node tests and the engine suite pass.

## Review

Consistent on attempt 1 (sonnet, $0.60). Redaction skips names after `/.`; land and land_plan set sameRepo (they always file to origin, so its name is already public there); repo-file project wins over the user option, `none` adds nothing; project: false / --no-project per call. Follow-ups: the plugin.json project description still says /config wins (plugin.json was forbidden; fold into the release card), /delegation config project shows the user value even when the repo says none, and `none` is stripped before the repo config parser rather than taught to it.
