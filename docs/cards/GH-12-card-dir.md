---
id: GH-12
title: The card folder is configurable (cardDir), and init in a repo that is itself a plugin picks a folder the engine will not read as agents
domain: mod
tier: standard
status: merged
scope: [hooks/lib/init.ts, hooks/lib/dispatch.ts, hooks/lib/repoconfig.ts, hooks/register.ts, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, agents/**, hooks/lib/verify-native.ts, hooks/lib/gates.ts, hooks/lib/allow.ts, hooks/lib/gitguard.ts]
red_test: a pure test in tests/init.test.ts where initPlan(root, existing) with a `.claude-plugin/plugin.json` among the existing files plans `delegation/tasks/README.md` and the sample card there, and writes cardDir into the config it plans (red because initPlan knows no cardDir), plus one in tests/dispatch.test.ts where the card lookup honours cardDir
gate: node
budget: 2-attempts
---
## Why

Report GH-12, seen dogfooding this repo.
The engine treats `agents/*.md` under a plugin folder as subagent definitions, so in a repo that is
itself a plugin every card the mod writes under `agents/tasks/` is also offered to the engine as an
agent type, and `claude plugin validate` warns about each one ("No frontmatter block found", "No
description in frontmatter"). Adopter repos that are not plugins are unaffected.

## Done when

- A new repo-file key `cardDir` (string, default `agents/tasks`) in hooks/lib/repoconfig.ts, validated
  like `worktreeRoot` (a relative folder, no `..`, no leading `/`). `/dispatch`, the dispatch tool, the
  `--replay` card read (`ls-tree`/`show` argv in hooks/lib/dispatch.ts and the allowlist's exact shapes
  for them in hooks/lib/allow.ts are OUT of your scope: if the replay path hardcodes `agents/tasks/`,
  leave replay on the default folder and say so in the README and your hand-back) and the compaction
  state all read cards from `<root>/<cardDir>/`.
- `init` (hooks/lib/init.ts `initPlan`) picks `delegation/tasks` when the root holds
  `.claude-plugin/plugin.json`, writes that as `cardDir` into the planned `.chassis-delegation.json`
  (with a `_cardDir` comment line), and its output says why: `cards go under delegation/tasks/ (this
  repo is a plugin: agents/ is the engine's subagent folder)`. Otherwise the default stays
  `agents/tasks`. An existing config file is never overwritten, as today.
- The card README that init writes names the folder it actually used.
- README: the config table row for `cardDir`, and one sentence under Install about plugin repos.
  CHANGELOG Unreleased entry naming GH-12.
- Save the red output to `.delegation/GH-12/red-1.txt` and name it `red=` in your report. Red then green;
  `claude plugin validate .`, the node suite and `claude plugin test .` green in your worktree (quote their
  last lines; only `node` is in the gate map). Do NOT move this repo's own cards; the brain does that.
