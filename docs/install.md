# Install and setup

Load the mod, and what `/delegation setup` checks.

## Install on a new machine

1. **Clone**:

       git clone https://github.com/nelsben/chassis-delegation.git ~/chassis-delegation

2. **Load the plugin:**

   | Route | How |
   | --- | --- |
   | Terminal, one session | `claude --plugin-dir ~/chassis-delegation` |
   | Running session, VS Code or desktop | Hot reload (below), no restart |
   | Every session | `CLAUDE_CODE_PLUGIN_DIRS` in your shell or the `env` block of `~/.claude/settings.json`; not a hot-reload folder |

   Hot reload: invoke the `plugin-authoring` skill, which names
   `~/.claude/dev-mods/<session-id>/`. Clone the mod into
   `~/.claude/dev-mods/<session-id>/chassis-delegation` (a real copy),
   then answer **Enable for this session**.

3. **Restart Claude Code** after the flag or the setting.
4. **Run `/delegation setup`** in your repo. It writes nothing until required
   checks hold (see [Setup](#setup)). `/delegation init` is the bare scaffold.
   Either adds these and never overwrites a file:
   - `agents/tasks/README.md`;
   - `agents/tasks/OPS-000-sample.md` (bare init only);
   - `.chassis-delegation.json`, every key with its default and a `_comment` (setup fills `gateMap`, `baseRef`, `cardDir`);
   - a `.delegation/` line in `.gitignore`.

   If an update is pending, restart once.

In a plugin repo (`.claude-plugin/plugin.json`), init puts cards under
`docs/cards/` and writes `"cardDir": "docs/cards"`, since the engine reads every
`agents/*.md` as a subagent. `--replay` reads `agents/tasks/` at the base commit.

`tests/selfcheck.sh` runs `claude plugin validate` and `claude plugin test`. If the rollout switch is off, it also
prints two `settings.json` hook entries (see
[Without the engine](internals.md#without-the-engine-two-settingsjson-hooks)).

## Setup

`/delegation setup` (or the `setup` tool) prints a line per check: `✓` or `✗`
for required, `·` for advice, with the fix under a failure. The
[host-command allowlist](configuration.md#the-host-command-allowlist) has no
`git init`, commit, remote or install: run the fixes, then setup again.

Required:

1. a git repo (`git init -b main`);
2. the session root is the repo top level;
3. a first commit;
4. a gate: `package.json` `scripts.test` (`pnpm test` or `yarn test` by lockfile), `pytest`, `cargo test` or `go test ./...`;
5. on PATH: `git` and the runner (`node` and its package manager, `python3` and `pytest`, `cargo`, `go`);
6. no `~/.claude/skills/{delegation,dispatch}` or `~/.claude/commands/{delegation,dispatch}.md` shadows the mod.

Advice (never blocks):

- mode: `origin/main` resolves is worktree mode; no remote is `repo=here` (setup writes `"baseRef"`; dispatch with `--here`);
- a lockfile;
- a nested, gitignored child repo;
- a plugin repo (cards under `docs/cards/`);
- `gh` on PATH (a `pr=` claim needs it);
- uncommitted changes in worktree mode;
- the debrief spending an agent.

Once required checks hold, setup:

1. runs init (no sample card);
2. writes `.chassis-delegation.json` with `gateMap: {"test": "<detected>"}`; an existing config stays;
3. writes `spendByTier`: economy 5, standard 15, frontier 35 if a gate command starts with `sf` or `sfdx` or names `deploy`, `--target-org`, `gcloud`, `aws`, `az` or `terraform`; else 3, 10, 25;
4. prints a `config:` line per key set (`gateMap.test`, `baseRef`, `cardDir`, `spendByTier`);
5. asks for the first task, with an example that fits the detected gate.

The `setup` tool adds `Ask the person for the first task, then call the card tool. On go, call dispatch and make the Agent call its result ends with (the spawn block, verbatim): that call starts the worker.`

Nothing needs committing before a dispatch: a worktree dispatch reads the card
from the main checkout; in `repo=here` mode the card folder is in the
always-applied `ignore=` set. A consistent verdict means the report matches git, not that the work is right.

A git-ignored card folder (`git check-ignore`) prints
`cards: <cardDir> is git-ignored, so cards stay local; /delegation merge marks them merged in place`
([Merging a card](review-and-merge.md#merging-a-card)). With no config, `/delegation` adds `not set up here: run /delegation setup`.
