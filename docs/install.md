# Install and setup

Every way to load the mod, and what `/delegation setup` checks.

## Install on a new machine

1. **Clone** the mod (terminal):

       git clone https://github.com/nelsben/chassis-delegation.git ~/chassis-delegation

2. **Load the plugin.** Pick the route that fits where you run Claude Code:
   - **Terminal, one session:** start it with
     `claude --plugin-dir ~/chassis-delegation`. Repeat the flag to load several.
   - **Any session already running, including VS Code and the desktop app,
     with no restart:** hot reload. Ask Claude to invoke the
     `plugin-authoring` skill; the skill's first paragraph names this
     session's hot-reload folder, `~/.claude/dev-mods/<session-id>/`. Clone the
     mod into a child of it as a real copy (`git clone
     https://github.com/nelsben/chassis-delegation.git
     ~/.claude/dev-mods/<session-id>/chassis-delegation`; the watcher does not
     follow a symlink). When the turn ends, Claude Code asks "Enable hot
     reloading for this session?": answer **Enable for this session**. The mod
     loads then, and reloads after each later change to that folder. This is
     the way in for the VS Code extension, which takes no `--plugin-dir` flag.
   - **Every session, permanently:** `CLAUDE_CODE_PLUGIN_DIRS` in your shell,
     or in the `env` block of `~/.claude/settings.json`. It applies to every
     project and every new process. Point it at a checkout of your own that
     you update deliberately, never at a session's hot-reload folder, and not
     while some session also hot-loads the mod, or that session loads it twice.
3. **Start or restart Claude Code** if you chose the flag or the setting. A
   running session does not see a plugin added that way after it started:
   typing `/delegation` there gets Claude Code's own "no command with that
   name" answer. Hot reload needs no restart.
4. **Run `/delegation setup`** inside Claude Code, in the repo you work on. It
   checks the repo and the tools the mod needs (see [Setup](#setup)), names the
   exact fix for each one that fails, and writes nothing until every required
   check holds. Run the fixes, then run it again. Once they hold it scaffolds
   the repo and asks you for your first task in a sentence. `/delegation init` is the bare
   scaffold, with no checks. Either way it adds four things and prints what it
   wrote. It never overwrites a file:
   - `agents/tasks/README.md`, describing the card format;
   - a sample card, `agents/tasks/OPS-000-sample.md` (bare `/delegation init` only; setup does not write it);
   - `.chassis-delegation.json`, holding every key with its default and a `_comment` per key (setup also fills in `gateMap`, and `baseRef` or `cardDir` when it found the need);
   - a `.delegation/` line in `.gitignore`.

   If Claude Code says an update is pending, restart the session once before
   dispatching; init itself needs no re-run.

   In a repo that is itself a plugin (it holds `.claude-plugin/plugin.json`),
   init puts the cards under `docs/cards/` instead and writes
   `"cardDir": "docs/cards"` into the config, because the engine reads
   every `agents/*.md` of a plugin as a subagent definition. `--replay` still
   reads cards from `agents/tasks/` at the base commit (the allowlist's git
   shapes name that folder).

To check the folder on the new machine, run `tests/selfcheck.sh`. It runs
`claude plugin validate` and `claude plugin test`, then prints the
`--plugin-dir` line to use. If the engine's rollout switch is off there, it
also prints the two `settings.json` hook entries that carry the verifier and
the git guard without the mod (see
[Without the engine](internals.md#without-the-engine-two-settingsjson-hooks)).

## Setup

`/delegation setup` (or the `setup` tool) checks the repo and prints one line
per check, `✓` or `✗` for the required ones and `·` for advice, with the fix on
the line under a failing one. The mod cannot run the fixes itself (its
[host-command allowlist](configuration.md#the-host-command-allowlist) has no `git init`,
commit, remote or install), so the brain or you run them, then run setup again.
It is idempotent.

Required:

1. a git repo (`git init -b main`);
2. the session root is the repo's top level;
3. a first commit;
4. a gate: `package.json` `scripts.test` (not npm's placeholder; `pnpm test` or
   `yarn test` by lockfile), `pytest`, `cargo test` or `go test ./...`;
5. the tools on PATH: `git`, and the stack's runner (`node` and its package
   manager, `python3` and `pytest`, `cargo`, `go`);
6. no `~/.claude/skills/{delegation,dispatch}` or
   `~/.claude/commands/{delegation,dispatch}.md` shadowing the mod.

Advice (never blocks): the mode (`origin/main` resolves: worktree mode; no
remote: `repo=here`, setup writes `"baseRef"` and cards dispatch with
`--here`); a lockfile for the brief's install step; a nested, gitignored child
repo (start Claude Code inside it to delegate there); a plugin repo (cards
under `docs/cards/`); `gh` on PATH (a report's `pr=` claim is checked only with
it); uncommitted changes in worktree mode (a worker's worktree lacks them); the
background debrief spending an agent at a quiet stop.

When every required check holds, setup runs the init scaffold (the card
folder's README, `.chassis-delegation.json`, the `.gitignore` line; no sample
card), writes `.chassis-delegation.json` with `gateMap: {"test": "<detected>"}`
(an existing config is left as it is and setup prints what it would have set),
also writes `spendByTier` (GH-116): economy 5, standard 15, frontier 35 when a gate
command starts with `sf` or `sfdx` or names `deploy`, `--target-org`, `gcloud`,
`aws`, `az` or `terraform` (a cloud deploy plus remote test runs cost $10 to $15
before any thinking), else the defaults (economy 3, standard 10, frontier 25),
prints one `config:` line per key it set in a fresh config (`gateMap.test`, and
`baseRef` or `cardDir` when set, and `spendByTier`), and ends by asking for the first task:

    Set up. Tell Claude your first task in a sentence, for example: "add a
    function that reads a file header and returns its size, with a unittest".
    Claude writes the card, shows you the brief, and when you say go dispatches
    it and makes the Agent call that starts the worker; the mod shapes and
    verifies it.

The example follows the detected gate. Through the `setup` tool the result adds
`Ask the person for the first task, then call the card tool. On go, call
dispatch and make the Agent call its result ends with (the spawn block,
verbatim): that call starts the worker.` Setup prints
init's file lines but not init's own "Next:" line. Nothing needs committing
before a dispatch: a worktree dispatch reads the card from the main checkout,
and in `repo=here` mode the card folder is in the always-applied `ignore=` set.
A consistent verdict means the report matches git, not that the work is right:
read the diff.
`/delegation` in a root with no config adds `not set up here: run /delegation setup`.
