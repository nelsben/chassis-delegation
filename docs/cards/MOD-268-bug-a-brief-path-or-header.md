---
id: MOD-268
title: Bug: a brief path or header path with a space in it is found and parsed, so the worker runs as its task, not ad hoc
domain: mod
tier: standard
status: merged
scope: [hooks/lib/brief.ts, hooks/lib/dispatch.ts, hooks/register.ts, tests/brief.test.ts, tests/dispatch.test.ts, tests/dispatchtool.test.ts, tests/spawn.test.ts, tests/crossrepo.test.ts, tests/harness.ts, tests/node/**, CHANGELOG.md]
forbid: []
red_test: tests/brief.test.ts: findBriefPath('Your brief is the file /a/Client Sandbox/x/.delegation/briefs/OPS-4.brief.md. Read it whole, then follow it exactly.') returns '/a/Client Sandbox/x/.delegation/briefs/OPS-4.brief.md' (fails today: undefined)
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

findBriefPath (hooks/lib/brief.ts:202) finds the brief in a spawn prompt with a path class that excludes whitespace, so a brief under a folder with a space in its path never matches: planSpawn sees no brief, the spawn runs ad hoc at the floor tier, the verdict tool finds no attempt, and the header's spend, budget and resources (exclusive locks) are not applied. Verified: the regex returns null for `Your brief is the file /a/Client Sandbox/x/.delegation/briefs/OPS-4.brief.md. Read it`. The same space breaks the brief header itself: dispatch renders `repo=`, `outdir=` and `scratch=` unquoted (hooks/lib/dispatch.ts:243-247), and header fields split on whitespace.

## Done when

- `spawnPrompt` (hooks/lib/dispatch.ts) wraps the brief path in backticks when it contains whitespace (`Your brief is the file `<path>`. Read it whole, then follow it exactly.`); a path with no whitespace renders exactly as today, so every existing spawn prompt and test is unchanged.
- `findBriefPath` tries, in order: (1) a backtick-, double- or single-quoted absolute path ending `.brief.md`, which may contain spaces; (2) today's unquoted absolute regex, unchanged; (3) an unquoted absolute path that may contain single spaces inside a segment but never a space followed by `/` (so `see /tmp and the file /x/y.brief.md` still yields `/x/y.brief.md`); (4) today's relative regex, unchanged. Unit tests cover each, the reporter's exact prompt, a quoted path, and the `/tmp ... /x/y.brief.md` case.
- The brief header renders `repo=`, `outdir=` and `scratch=` double-quoted when the value contains whitespace (as `red_test=` already is), `parseHeader` reads them back whole, and `setHeaderField` keeps a quoted value quoted. A value with no whitespace renders exactly as today.
- An engine test with a session root or `briefDir` whose path contains a space runs dispatch → Agent spawn with the printed prompt → hand-back → verdict tool: the spawn is recorded as the task's attempt 1 at the card's tier and model (not `adhoc-`, not the floor tier), and the verdict tool returns that attempt's row.
- A cross-repo card (`repo` an absolute checkout path with a space) renders a header whose `repo` parses back to that path, in a unit test.
- No other behaviour changes; existing tests pass untouched. CHANGELOG.md gets an `## Unreleased` entry under `### Fixed`. Gates validate, node and test are green.
