---
id: GH-109
title: /delegation setup checks the repo and the tools it needs, tells the brain exactly what to fix, and once everything holds scaffolds the config from what it found and hands over the first card
domain: mod
tier: standard
status: merged
scope: [hooks/lib/setup.ts, hooks/lib/init.ts, hooks/lib/repoconfig.ts, hooks/register.ts, hooks/types/**, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/types/**, .chassis-delegation.json, docs/**, hooks/lib/allow.ts, hooks/lib/gates.ts, hooks/lib/gitguard.ts, hooks/lib/verify-native.ts, hooks/lib/scheduler.ts]
red_test: pure tests in a new tests/setup.test.ts for setupChecks(probe) over a table of probes (no git repo; a repo with no commit; a repo with no origin; a node repo whose package.json has a test script; a plugin repo; a nested gitignored child repo; a shadowing ~/.claude/commands/dispatch.md), each expecting the exact check lines and fixes; and an engine test in tests/hooks.test.ts where /delegation setup in an empty folder lists the failing checks and writes nothing, then, with the world made green, writes the four init files plus gateMap.test and prints the first-card handover (red: no setup command exists)
gate: validate,node,test
budget: 2-attempts
spend: 10
---
## Why

A person starting a new project has to know, before the mod is any use, that it needs a git repo with a
first commit, a remote with `main` for worktree mode (or `repo=here` without one), a test command that
passes, a lockfile, and no user skill named `delegation` or `dispatch`. Today they learn each of these
from a failure. One adopter never reached `/dispatch` at all because the README did not tell them which
mode fit their repo. `/delegation init` scaffolds files but checks nothing.

## What to build

A command `/delegation setup` and a model-callable tool `mcp__chassis-delegation__setup` (no input),
both running one function, `runSetup`. Idempotent: run it, fix what it names, run it again.

**The mod cannot fix the repo itself.** Its host-command allowlist (hooks/lib/allow.ts, forbidden to you)
admits read-only git and the gate commands only: no `git init`, commit, remote, push, install. So the
wizard CHECKS with allowlisted reads and `$.fs`, and for every failing check prints the exact fix as a
command the brain (or the person) runs. The tool's description says so: "Checks the repo for
chassis-delegation and returns what to fix; run the fixes, then call it again. When every required check
holds it scaffolds the config and returns the first card to write."

### Phase 1: the checks (pure logic in a new hooks/lib/setup.ts; register.ts gathers the probe)

Gather a probe with allowlisted git reads in the session root (`rev-parse --is-inside-work-tree`,
`rev-parse --show-toplevel`, `rev-parse --abbrev-ref HEAD`, `rev-parse --verify --quiet HEAD`,
`rev-parse --verify --quiet origin/main`, `status --porcelain`), `$.fs.exists`/`$.fs.read`/`$.fs.list`,
and `$.env.get('PATH')` / `$.env.get('HOME')`. Then `setupChecks(probe)` returns ordered lines, each
`required` or `advice`, `ok` or `fix`, with the fix text:

Required:
1. **A git repo.** Fix: `git init -b main`.
2. **The session root is the repo's top level.** If not, fix: start Claude Code in `<toplevel>`.
3. **A first commit.** Fix: `git add -A && git commit -m "Initial commit"`.
4. **A gate.** Detect a test command: `package.json` `scripts.test` (not npm's placeholder
   "no test specified") → `npm test` (or `pnpm test` / `yarn test` by lockfile); `pyproject.toml` or
   `pytest.ini` or a `tests/` folder of `test_*.py` → `pytest`; `Cargo.toml` → `cargo test`; `go.mod` →
   `go test ./...`. None found: fix "add a test command that passes on the empty project, then run setup
   again", with the stack's usual example.
5. **The tools on PATH**, by scanning the PATH directories with `$.fs.exists`: `git` always; the stack's
   runner (`node` and the lockfile's package manager, or `python3`/`pytest`, `cargo`, `go`). Fix: name what
   is missing.
6. **No shadowing command.** `~/.claude/skills/delegation`, `~/.claude/skills/dispatch`,
   `~/.claude/commands/delegation.md`, `~/.claude/commands/dispatch.md` absent. Fix: name the file to remove.

Advice (does not block):
7. **The mode.** `origin/main` resolves → worktree mode. No remote → `repo=here`, and setup will write
   `"baseRef": "main"` (or the current branch) and say that cards dispatch with `--here`; offer the remote
   as the alternative: `gh repo create <name> --private --source . --push` (the person's call).
8. **A lockfile** for the brief's install step (package-lock.json, pnpm-lock.yaml, yarn.lock,
   requirements.txt); else say the worker will have no install step.
9. **A nested repo.** A child folder of the root holding `.git` that the root's `.gitignore` ignores:
   say "code in <child> is its own repo; to delegate there, start Claude Code in <child>".
10. **A plugin repo** (`.claude-plugin/plugin.json`): the cards will go under `docs/cards/`.
11. **`gh`** on PATH: say a report's `pr=` claim can be checked only with it.
12. **Uncommitted changes**: in worktree mode they are not in a worker's worktree; commit first.
13. **Background debrief** on: say it spends an agent at a quiet stop, and how to turn it off in `/config`.

Output: a header line `chassis-delegation setup in <root>: <n> of <m> required checks hold`, then one
line per check (`✓` / `✗` / `·` for advice), each fix on the line under it, indented. While any required
check fails, stop there and write nothing.

### Phase 2: scaffold (only when every required check holds)

- Run the existing init plan (never overwrite a file). If `.chassis-delegation.json` did not exist before
  this run, write it from the template with what setup found: `gateMap: {"test": "<detected command>"}`,
  `baseRef` when no remote, `cardDir` for a plugin repo. If it already existed, change nothing in it and
  print what setup would have set, as advice.
- **Hand over the first card.** Print, ready to save as `<cardDir>/<PREFIX>-1-<slug>.md` (PREFIX `OPS`
  unless the config's domains suggest one), a filled card skeleton: `tier: standard`, `status: queued`,
  `gate: test`, `budget: 2-attempts`, `scope:` and `forbid:` as globs with a placeholder the person
  replaces, and a `## Why` / `## Done when` body. Then the two next lines: "Write the task into it, then
  `/dispatch OPS-1 --dry-run` to see the brief, then `/dispatch OPS-1`" (with `--here` in repo=here mode),
  and "Read the diff before you accept: a verified verdict means the report matches git, not that the work
  is right."

### Also

- `/delegation` with no argument, in a root with no `.chassis-delegation.json`, adds one line:
  `not set up here: run /delegation setup`.
- README: step 4 of "Install on a new machine" becomes `/delegation setup` (init stays as the bare
  scaffold); a short "Setup" section listing the checks; the commands table gains setup and the tool.
- CHANGELOG (GH-109).
- Save red output to `.delegation/GH-109/red-1.txt`, name it `red=`. The gate map runs the three gates.
