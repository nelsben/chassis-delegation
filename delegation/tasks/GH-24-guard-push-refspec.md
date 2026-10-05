---
id: GH-24
title: The git guard lets a tag push and a remote-branch delete through from main; only a push OF a guarded branch is denied
domain: mod
tier: standard
status: merged
scope: [hooks/lib/gitguard.ts, tests/gitguard.test.ts, tests/hooks.test.ts, README.md, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, agents/**, hooks/register.ts, hooks/lib/verify-native.ts]
red_test: cases in tests/gitguard.test.ts where, on main, `git push origin v0.3.0`, `git push origin refs/tags/v0.3.0`, `git push --tags`, `git push origin --delete agent/mod/GH-21` and `git push origin agent/mod/GH-5` are NOT denied, while `git push`, `git push origin main`, `git push origin HEAD`, `git push origin HEAD:main`, `git push --all`, `git push origin :main` and `git push origin --delete main` still are (red: the first group is denied today)
gate: node
budget: 2-attempts
---
## Why

Report GH-24, seen twice while releasing
0.3.0 from this repo. On `main`, `git push origin v0.3.0` (a tag) and `git push origin --delete
agent/mod/GH-21` (a remote feature branch) were both denied with `no push on main; branch first`.
Neither touches `main` on the remote. The guard treats any `push` run while on a guarded branch as a
push of that branch unless the command names another branch.

## Done when

- In hooks/lib/gitguard.ts, a `push` is a push OF the current branch only when its refspecs are empty,
  or one of them is `HEAD`, `HEAD:<x>`, the current branch's name, `<current>:<x>`, or `--all`
  (`--mirror` too). A refspec that is a tag name (`v1.2.3`, `refs/tags/…`), `--tags`, `--delete <other>`
  / `:<other>` for a non-guarded ref, or another branch's name is not. The existing rule stays: a push
  that names a guarded branch as the DESTINATION (`origin main`, `HEAD:main`, `x:main`, `:main`,
  `--delete main`, `--all`, `--mirror`) is denied from any branch. `-f`/`--force` change nothing here.
  The guard still reads command words only.
- The deny line is unchanged. README's git-guard paragraph says what a push of the current branch is and
  that tag pushes and deletes of other branches pass. CHANGELOG Unreleased entry naming GH-24.
- Save the red output to `.delegation/GH-24/red-1.txt` and name it `red=` in your report. Red then green;
  `claude plugin validate .`, the node suite and `claude plugin test .` green in your worktree (quote their
  last lines; only `node` is in the gate map).
