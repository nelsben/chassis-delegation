---
id: MOD-8
title: delegateOnly reads ~, $HOME, $PWD and variables set earlier in the same command before deciding a Bash write is in the repo, so a write to a folder outside the repo is never denied
domain: mod
tier: standard
status: merged
scope: [hooks/lib/brain.ts, hooks/register.ts, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/lib/allow.ts, hooks/lib/verify-native.ts, hooks/lib/gitguard.ts, hooks/lib/card.ts, hooks/lib/setup.ts, hooks/lib/scheduler.ts, hooks/lib/dispatch.ts, hooks/lib/attempts.ts, hooks/lib/update.ts, hooks/lib/cleanstop.ts]
red_test: pure tests in tests/brain.test.ts, root /repo and home /home/u: bashWrites("M=/home/u/.claude/m; cat >> $M/p.md <<'EOF'\nhi\nEOF", '/repo', '/home/u') gives no paths; "echo hi >> ~/.claude/m/p.md" and "echo hi > ${HOME}/x.md" give no paths; "D=src; echo x > $D/a.ts" gives /repo/src/a.ts; "echo x > $PWD/hooks/a.ts" gives /repo/hooks/a.ts; "echo x > $UNSET/a.ts" gives no paths; "echo x > hooks/a.ts" still gives /repo/hooks/a.ts; engine test in tests/hooks.test.ts: with delegateOnly deny and the session model claude-fable-5-1, a main-loop Bash call appending to $M/p.md with M set to a folder outside the root is allowed and one writing $PWD/hooks/x.ts is denied naming the card tool; red first
gate: validate, node, test
budget: 2-attempts
spend: 6
---
## Why

With delegateOnly deny and a fable or opus brain, the brain's Bash command `M=/Users/<name>/.claude/projects/<p>/memory; cat >> $M/project_state.md <<'EOF' … EOF` was refused as a source edit, though it writes the brain's memory folder outside the repo. bashWrites in hooks/lib/brain.ts hands the target `$M/project_state.md` to relativeTo unexpanded; a path not starting with / is read as relative to the root, so it lands inside the repo, fails isAllowedPath and is denied. `~/…` is misread the same way. The README says a write wholly outside the repo is allowed; the tripwire should keep that promise for the ordinary shell spellings.

## Done when

- bashWrites resolves a write target before relativeTo: a leading ~ or ~/ and $HOME / ${HOME} become the home folder; $PWD / ${PWD} become the root; $NAME or ${NAME} assigned a literal value (NAME=value, quotes stripped, no $ or backtick inside) in an earlier segment of the same command, or as a prefix assignment of the same segment, becomes that value, and a relative value resolves against the root as today
- a target that still holds $, a backtick or $( after that is unknown: it is not counted as a write in the root (the tripwire is for accidents, as its doc comment says) and adds nothing to the paths
- the home folder is a parameter (bashWrites(command, root, home)); register.ts passes the one it already knows (process.env.HOME or the engine's equivalent), and a missing home leaves ~ and $HOME targets unknown
- the delegateDecision table and isAllowedPath are unchanged; a literal relative or absolute target inside the root is decided exactly as today
- README's delegateOnly paragraph says which spellings are resolved and that an unresolvable target is not counted; CHANGELOG entry
