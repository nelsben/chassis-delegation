---
id: GH-11
title: A gate-map command may name the worker's worktree with {worktree}, and a command the allowlist would refuse is refused when the config loads
domain: mod
tier: standard
status: merged
scope: [hooks/lib/gates.ts, hooks/lib/allow.ts, hooks/lib/repoconfig.ts, hooks/lib/verify-native.ts, hooks/register.ts, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, agents/**, hooks/lib/handback.ts, hooks/lib/scheduler.ts, hooks/lib/gitguard.ts, hooks/lib/init.ts]
red_test: a pure test in tests/allow.test.ts (or a new tests/gates.test.ts) where the gate-map command "claude plugin validate {worktree}" resolves to argv ["claude","plugin","validate","/abs/worktree"] and the allowlist accepts it (red because {worktree} is unknown today), and one where "claude plugin validate ." is refused at config load with a reason naming the absolute-folder rule
gate: node
budget: 2-attempts
---
## Why

Report GH-11, seen dogfooding this repo. The
gate map had `"validate": "claude plugin validate ."`. `gateCommandTemplates` accepted it (no denied first
word, no shell syntax), but at verify time `checkClaude` in hooks/lib/allow.ts refused it: only
`claude plugin validate|test <absolute folder>` is allowed, and a gate runs with the worker's worktree as
cwd but the only placeholder a gate-map command may carry is `{files}`. The verdict read
`unverified on gate (… claude plugin validate . is not an absolute folder)`, a hundred dollars after the
config was written. Today this repo's gate map is `node` only for that reason.

## Done when

- `{worktree}` is a second placeholder beside `{files}` in hooks/lib/gates.ts: filled with the absolute
  path of the tree the gate runs in (the worker's worktree, or the shared checkout for repo=here), and
  `matchesTemplate` accepts an argv whose word is the template with `{worktree}` filled by an absolute
  path with no `..`, the same rule `{files}` uses. A word may carry `{worktree}` once; `{files}` and
  `{worktree}` may both appear in one command. `fillFiles` becomes a fill of both (keep the old name as
  an alias if tests use it).
- The verifier passes the tree path through (hooks/lib/verify-native.ts `resolveGateRuns` gets the
  repo; register.ts already knows it).
- **Refuse at config load what the allowlist would refuse at run time.** When the repo file or /config
  gate map is parsed (hooks/lib/repoconfig.ts, and wherever register.ts loads the settings layer), each
  command is also checked by filling `{files}` and `{worktree}` with a sample absolute path and running
  it through the allowlist's own check (`checkArgv` in allow.ts, or the gate-template path it uses). A
  command that fails is dropped from the map and named in the existing bad-key toast and log line with
  the allowlist's reason, e.g. `gateMap.validate: claude plugin validate . is not an absolute folder;
  write {worktree}`. Pure logic in gates.ts/allow.ts; the toast text in register.ts.
- README: the gate-map row and the allowlist section name `{worktree}`; the "Known issues" entry about
  gates, if any, is updated. CHANGELOG Unreleased entry naming GH-11.
- Save the red output to `.delegation/GH-11/red-1.txt` and name it `red=` in your report. Red then green;
  `claude plugin validate .`, the node suite and `claude plugin test .` green in your worktree (quote their
  last lines; only `node` is in the gate map). Do NOT edit this repo's `.chassis-delegation.json`; the
  brain adds the validate/test gates back after this lands.
