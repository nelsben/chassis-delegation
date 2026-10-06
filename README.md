# chassis-delegation

![chassis-delegation: the brain writes the task card; dispatch spawns a worker at the opus, sonnet or haiku tier; the verified hand-back comes back](docs/chassis-delegation.png)

Brain-seat delegation for Claude Code. The main model (the "brain") hands a
task card to a worker subagent with one tool call, `dispatch`. The mod does the
rest. It writes the brief, cuts a git worktree and picks the model tier. It
spawns the worker, holding it in a queue while two others run. When the worker
reports, the mod checks the report against the repo itself (branch, sha,
changed files, scope, gate, PR) and hands the brain one verdict line with what
to do next. At a quiet stop it can write a debrief in the background, and it
can run your eval when `origin/main` moves. It is a Claude Code mod (a plugin
of function hooks). It needs nothing from any other repo: no scripts, no
harness, no network. Version 0.4.0, MIT.

## Install on a new machine

1. **Clone** the mod (terminal):

       git clone https://github.com/nelsben/chassis-delegation.git ~/chassis-delegation

2. **Load the plugin.** Pick one:
   - `claude --plugin-dir ~/chassis-delegation` loads it for one session.
     Repeat the flag to load several.
   - `export CLAUDE_CODE_PLUGIN_DIRS=~/chassis-delegation` loads it in every
     process that has the variable.
   - In the desktop app or an SDK host, where no flag can be given, put
     `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of `~/.claude/settings.json`.
3. **Start or restart Claude Code.** A running session does not see a plugin
   added after it started: typing `/delegation` there gets Claude Code's own
   "no command with that name" answer. Quit and start it again with the
   plugin loaded.
4. **Run `/delegation init`** inside Claude Code, in the repo you work on. It
   adds four things and prints what it wrote. It never overwrites a file:
   - `agents/tasks/README.md`, describing the card format;
   - a sample card, `agents/tasks/OPS-000-sample.md`;
   - `.chassis-delegation.json`, holding every key with its default and a `_comment` per key;
   - a `.delegation/` line in `.gitignore`.

   If Claude Code says an update is pending, restart the session once before
   dispatching; init itself needs no re-run.

   In a repo that is itself a plugin (it holds `.claude-plugin/plugin.json`),
   init puts the cards under `delegation/tasks/` instead and writes
   `"cardDir": "delegation/tasks"` into the config, because the engine reads
   every `agents/*.md` of a plugin as a subagent definition. `--replay` still
   reads cards from `agents/tasks/` at the base commit (the allowlist's git
   shapes name that folder).

To check the folder on the new machine, run `scripts/selfcheck.sh`. It runs
`claude plugin validate` and `claude plugin test`, then prints the
`--plugin-dir` line to use.

## Commands and tools

| Name | Who calls it | What it does |
| --- | --- | --- |
| `/delegation` | you type it | shows the delegation state and where the config came from |
| `/delegation init` | you type it | scaffolds the repo (step 4 above) |
| `/dispatch <ID> [--dry-run\|--scope\|--forbid\|--replay\|--base\|--here\|--force-overlap]` | you type it | dispatches a card; the model can also run it through the tool. `--here` shares the session's own checkout (see [repo=here](#repohere-the-main-checkout)) |
| `mcp__chassis-delegation__dispatch` | the model, on its own | the same dispatch, as a tool |
| `mcp__chassis-delegation__init` | the model, on its own | the same scaffold as `/delegation init`, as a tool |

A user skill or command named `delegation` or `dispatch` under
`~/.claude/skills` or `~/.claude/commands` shadows the mod's commands; remove it.

## Sixty seconds

1. **Write a card.** Copy `agents/tasks/OPS-000-sample.md` to
   `agents/tasks/OPS-1-fix-the-thing.md`. Give it a real id, title, scope,
   red test and gate, and set `status: queued`.
2. **Ask the brain.** Say "dispatch OPS-1". The brain calls the `dispatch`
   tool; you can also type `/dispatch OPS-1` yourself. The tool reports what
   it did, one line per step:

       1. card …/agents/tasks/OPS-1-fix-the-thing.md (status queued, domain ops)
       2. brief …/.delegation/briefs/OPS-1.brief.md written (tier=standard, model=sonnet, budget=2-attempts)
       3. worktree …-OPS-1 on agent/ops/OPS-1 from origin/main
       4. spawned general-purpose agent agent-7 on claude-sonnet-…

3. **The worker hands back.** The brain's conversation gains one row:

       chassis-delegation: OPS-1 attempt 1/2 verified · sonnet · $0.41 · next=accept

   A failed check names its first failed claim, and `next=` tells the brain
   what to do:

       chassis-delegation: OPS-1 attempt 1/2 refuted on files (files= does not match the actual delta …) · sonnet · $0.38 · next=resume agent=agent-7

4. **`/delegation`** prints what is running, pending, queued and owed, plus
   the last verdicts and where the config came from.

## What the person sees

The brain does the typing. You see:

- the tier decision under each spawn, such as `tier=standard → sonnet (brief)`.
  The tier comes from the brief header's `tier=`, else the caller's `model`,
  else the classifier. The classifier is called only when there is no header
  and no caller model, and the debug log names the source:
  `T-7: tier=economy picked by the brief header's tier= (no classify call)`;
- the status line, `<n> workers · $<usd> · ctx <pct>%`;
- toasts: `debrief running in the background`, `T1 63/63`, `started queued OPS-3`;
- the verdict rows the brain answers.

A compaction keeps the delegation loop's position. While anything runs or is
owed, the system prompt carries a short "Delegation state" section, at most 40
lines.

## The card

Each card is one file, `agents/tasks/<ID>-<slug>.md`: YAML frontmatter, then
the spec in markdown. `<ID>` is `<PREFIX>-<number>[letter]`, for example
`OPS-12`, `BE-101` or `FE-7b`.

    ---
    id: OPS-12
    title: One line that says what done looks like
    domain: ops                 # one of `domains`; the branch is agent/<domain>/<id>
    tier: standard              # economy | standard | frontier → haiku | sonnet | opus (tierMap)
    status: queued              # /dispatch takes queued or claimed; template, merged … are refused
    scope: [src/feature/**, docs/feature.md]
    forbid: [src/secrets/**]
    red_test: npm test -- feature.test.ts
    gate: test                  # ids in gateMap, comma-separated
    budget: 2-attempts          # spawns + resumes before it comes back to you
    repo: here                  # optional: no worktree, the worker shares this checkout (see repo=here)
    ---
    ## Why … ## Done when …

Glob rules for `scope` and `forbid`:

- `*` crosses folders;
- `**` is the same as `*`;
- `?` is one character;
- a trailing `/` means everything under the folder.

A card whose scope is prose can still be dispatched with `--scope <globs>`.

A `budget` that is not `<n>-attempts`, such as a chassis `frontier-60m`, falls
back to `defaultBudget`, and `/dispatch` says so once:
`warning: budget "frontier-60m" is not <n>-attempts; using the default 3`. A
spawn whose header carries such a budget logs the same line to debug. The
`frontier` part is never taken as the tier: the card's `tier` stays the tier.

## The contracts

**Brief.** `/dispatch` writes `<root>/.delegation/briefs/<ID>.brief.md`. It
starts with one header line:

    [[brief v=1 task=<ID> subtask=main purpose=build tier=<tier> model=<alias> scope=<globs> forbid=<globs> red_test="<cmd>" gate=<ids> budget=<n>-attempts report=chassis.report.v1]]

The body comes from `templates/brief.md`. It tells the worker to:

- work only in its worktree;
- install first, by the lockfile at the repo root:

  | Lockfile | Install step |
  | --- | --- |
  | `package-lock.json` | `npm ci` |
  | `pnpm-lock.yaml` | `pnpm i --frozen-lockfile` |
  | `yarn.lock` | `yarn install --immutable` |
  | `requirements.txt` | `pip install -r requirements.txt` |
- write the red test first, and before changing any source save its failing
  output to `.delegation/<ID>/red-<attempt>.txt` in the worktree (a new file
  for each attempt);
- get the gate green and leave the tree clean;
- commit and hold: never push, never open a PR, never commit on main;
- end with the report line.

The repo file's `briefExtra` adds lines for the repo. An existing brief is
reused, never overwritten (and it decides the mode: a reused `repo=here`
brief dispatches with no worktree, whatever the flags say). Two more fields
are optional: `scope_globs=` and `forbid_globs=` replace a prose scope or
forbid. Other header fields are optional too:

- `repo=none` marks a task with no git repo, and `repo=<dir>` names the folder to verify;
- `repo=here` marks a task worked in the session's own checkout, no worktree (see [repo=here](#repohere-the-main-checkout));
- `base=<ref>` names where the delta starts when the worker commits (GH-10): a branch, `HEAD~2`, a sha. It beats `baseRef` and the `origin/main` chain. A value that is not a git ref (one starting with `-`, or a `a..b` range) makes the brief **refused**;
- `ignore=<globs>` (repo=here only) names paths taken off the delta before scope and files are checked.

A repo=here brief's body comes from the template's `{{#here}}` sections
instead of its `{{#worktree}}` ones. It tells the worker that it shares the
checkout with the brain and maybe other workers, to touch only its scope, not
to commit unless the card says so, and to report `branch=<current>` and
`sha=HEAD` (or the sha it committed). A template of your own without the
sections renders the same in both modes.

**Inline header.** A spawn needs no brief file. The header can sit in the
Agent prompt itself, which suits a subtask or a brain that does not use
cards. When the prompt names no `….brief.md` file and its header has all of
these:

- `task=`;
- `scope=` or `scope_globs=`;
- `gate=` or `repo=none`;

the mod writes the header, then the rest of the prompt, to
`<root>/.delegation/briefs/<task>.<subtask>.brief.md` (or `briefDir`). The
hand-back is verified against that file like any brief. A file already there
is reused, never overwritten, so a later attempt keeps its amend blocks. A
header that lacks a field is not verified, and the row names what is missing:

    note: no brief file named in the prompt; the inline header lacks gate= (or repo=none); verify skipped

**Report.** The worker's hand-back ends with the report line. The mod reads
the last one across the worker's final answer and its SubagentHandback
message; for a background worker it reads that message from the worker's own
transcript:

    [[report v=1 task=<ID> subtask=main branch=<branch> pr=<none|n|url> sha=<sha> gate=pass|fail red=<path|none> files=<a,b>]]

`red=` names the red test's failing output (GH-20): a file the worker
saved before changing any source, relative to its worktree, such as
`.delegation/<ID>/red-1.txt`. `.delegation/` is gitignored; the verifier reads
the tree, not git. A resume or respawn writes a new file for its attempt. The
field is optional: a brief whose `red_test=` is empty or `none` asks for no
evidence, and the worker may write `red=none`.

**Amend.** A worker that had to change a file outside its scope says so on its
own line, just above the report:

    [[amend v=1 scope+=<path> reason=<one line>]]

The mod appends the block to the brief before verifying. It never rewrites
the header. The verifier discloses each block it applied as
`amendment: #n …`.

- **`scope+=` and `forbid+=`** go in on the worker's word.
- **A `scope+=` inside a forbid glob** waits for you too: forbid wins over scope, so to allow a path under a forbid glob you must shrink the forbid with `forbid-=`; `scope+=` alone does nothing. The row says `amend needs approval: scope+=P lies inside forbid Y; scope+= alone does nothing, shrink the forbid`. `/dispatch` warns of the same at render, once per entry: `warning: scope entry X is inside forbid Y and can never be touched; shrink the forbid (forbid-=) to allow it`. The dispatch still proceeds.
- **`scope-=` and `forbid-=`** wait for you. The row says `amend needs approval: …`, and the verdict is the un-amended brief's.
- **`ignore+=<globs>`** (repo=here) takes more paths off the delta. Since it hides paths from the check, it always waits for you, like `scope-=`.
- **A malformed block** makes the scope unknowable. The scope claim is then left unchecked.

## How a report is verified

The worker's tree is the `repo=` in the brief header, else the worker's
worktree, else the session root. Verification uses read-only git in that tree
and runs the gate there. It never uses a fresh checkout and never installs
anything. Each claim is held, failed or unchecked.

| Claim | Held when |
| --- | --- |
| `branch` | `refs/heads/<branch>` (or `refs/remotes/origin/<branch>`) exists |
| `sha` | it resolves (`rev-parse --verify <sha>^{commit}`) and is an ancestor of the branch. A sha that does not exist is **failed** (fabrication) |
| `scope` | every path changed between `merge-base(<base>, sha)` and the sha matches a scope glob and no forbid glob. `<base>` is a replay's own base, else the brief's `base=`, else `baseRef`, else the first of `origin/main`, `main`, `origin/master`, `master` |
| `files` | `files=` equals that changed set exactly. A path missing from it or invented in it is named. An entry ending in `/` stands for the changed files under that folder; a folder with none changed is an invented path |
| `gate` | the tree's HEAD is the sha and `git status --porcelain` is empty. Then each gate id runs from `gateMap` in the worktree: exit 0 under `gate=pass` holds, non-zero is failed and shows the last 8 output lines, and `gate=fail` with a red gate holds (an honest stop) |
| `red` | only when the brief's `red_test=` is set (not empty, not `none`). The `red=` file lies in the worker's tree, is not empty, holds a failure marker (`fail`, `error`, `not ok`, `✗`, `exit code 1`-`9`, `exit 1`, `AssertionError`, `expected`; any case), and is not byte-identical (sha-256) to an earlier attempt's red file for the same task and subtask. Held shows its size and first failure line. No `red=` or no marker is unchecked; a path outside the tree, a missing or empty file, or an earlier attempt's file again is **failed** |
| `pr` | `pr=none`, or `gh pr view <n> --json state` finds it |

The gate is left unchecked, never failed, in these cases:

- the tree is dirty, or HEAD is not the sha;
- the gate id is not in the map;
- the gate exits 126 or 127, meaning the environment, not the code.

The changed paths are written to `<root>/.delegation/<ID>/files.txt` before
the gate runs. A gate command can take them as `{files}`, and the absolute
path of the tree it runs in (the worktree, or the root for `repo=here`) as
`{worktree}`: `claude plugin validate {worktree}`. Each takes an absolute path
with no `..`, once per word.

The verdict:

- any failed claim → **refuted**;
- else any unchecked claim → **unverified**;
- else **verified**;
- an unusable brief → **refused**;
- no report line → **no-report**.

`repo=none` changes the check (and the row says `(no repo)`). The verifier
then checks only three things:

- every `files=` path exists;
- every path lies in scope and outside forbid;
- the gate exits 0.

That gate is a map id, or a bare allowlisted command such as
`claude plugin validate <folder>`.

**Cardless hand-backs.** An ad hoc spawn (the Agent tool with no header and
no brief file) that hands back a `[[report …]]` line is verified too, for what
git can say without a brief. The tree is the spawn's cwd, else the session
root. `branch`, `sha`, `files` and `pr` are checked as above; `scope`, `gate`
and `red` are unchecked, with this reason:

    no brief: no scope=/gate=/red_test= to check against

So a cardless verdict is refuted (a sha off the branch, a files= that invents
a path) or unverified, never verified. No gate runs and no files.txt is
written. The row is posted like any other, the attempt is recorded under the
report's `task=` (or `adhoc-<key>` when it names none) with `adhoc: true`, and
the ledger line is written. No budget ladder applies: `next=` says `accept`
for verified, `check the diff` otherwise, and never resume or respawn. A
cardless attempt never counts toward a later dispatch of that task: the
budget and the escalation ladder read only attempts that had a brief. An ad
hoc spawn that hands back no report is judged as before: `no-report` in the
foreground, nothing in the background.

### repo=here: the main checkout

`repo=none` is the far end (no git at all). `repo=here` is the middle: a git
repo, but no worktree. It suits a repo with no `origin` (a local-only repo),
code in a nested child repo, or evidence (traces, results) that lives only in
the main checkout and would vanish with a worktree (GH-16, GH-19, GH-10).

**Dispatch.** `/dispatch <ID> --here` (the tool's `here: true`, or the card's
`repo: here`) writes the brief with `repo=here`, `base=<ref>` when one is
named, and `ignore=<globs>`. It runs no fetch and no `git worktree add`; the
worker spawns with its folder set to the session root. The only git it runs
reads the current branch (`rev-parse --abbrev-ref HEAD`), and the sha `HEAD`
is at when `baseRef` is `HEAD`. The steps say:

    3. no worktree (repo=here): the worker shares /path/to/root

- **`base=`** is a sha given with `--base`, else `baseRef`. A `baseRef` of
  `HEAD` is pinned to the sha HEAD is at when you dispatch, so a worker that
  commits is measured from where it started. With neither, the brief names no
  base and the verifier uses the chain.
- **`ignore=`** is the config's `ignore` (default `.delegation/**`) plus the
  files= already claimed by the other repo=here cards in flight in this
  checkout. A card is in flight while one of its store records
  (`delegation.tasks.<ID>`, marked with this root) has no verdict yet.
- **The overlap check.** If an in-flight repo=here card in this checkout has a
  scope glob that overlaps this card's (one glob's literal prefix matches the
  other glob, the same conservative rule as the scope-inside-forbid warning),
  the dispatch is refused before anything is written:

      /dispatch BE-101: refused — BE-101 scope src/** overlaps in-flight GH-19 scope src/lib/** in the shared checkout; both would claim the same paths (pass --force-overlap to dispatch anyway)

  `--force-overlap` (the tool's `forceOverlap: true`) lets it through with a
  `warning:` line instead. A record whose worker died stays "in flight" until
  it gets a verdict; force past it, or judge it.
- `--here` and `--replay` do not mix: a replay works in its own worktree.

**Verify.** The tree is the session root. Each claim:

| Claim | Held when |
| --- | --- |
| `branch` | it is the checkout's current branch (`rev-parse --abbrev-ref HEAD`). Another branch is unchecked, not failed: the brain may have switched |
| `sha` | `HEAD`, `none`, or a sha that resolves. A sha that does not resolve is **failed** (fabrication) |
| `scope`, `files` | as for any brief, on the subtracted delta (below) |
| `gate` | each gate runs at the root on the tree as it stands. The dirty-tree rule does not apply, and the gate line says so: `… (gate=pass confirmed; repo=here: the dirty tree is allowed, the clean-tree rule does not apply)` |
| `pr` | as for any brief |

The delta:

1. With `sha=HEAD` or `sha=none`, it is every path
   `git status --porcelain=v1 --untracked-files=all -z` names: staged,
   unstaged and untracked, a rename as its new path. With a real sha, it is
   `merge-base(<base>, sha)..sha` as above.
2. Then the brief's `ignore=` globs (plus any `ignore+=` amend, and the
   config's `ignore`) come off.
3. Then the files= of the other repo=here cards in flight in this checkout,
   read from the store at verify time, come off. A worker's files= is written
   to its record when its hand-back arrives, before its own verify, so two
   workers that hand back together each see the other's.

One line, before the scope and files claims, names every subtraction (five
paths a group at most):

    ignored: 1 path by ignore= (.delegation/briefs/BE-101.brief.md), 1 path belonging to GH-19 (src/b.ts)

What it does not verify: who wrote a path. A file another worker is still
editing and has not claimed yet is in the delta; so is a card's work after
its verdict is in and before you commit it. Commit (or stash) an accepted
repo=here card's files before the next hand-back is verified, or add them to
`ignore`. A repo=here worker does not commit unless its card says so, and the
git guard still denies a commit on `main`.

**A nested child repo.** Run Claude Code with the child as the session root
(`cd child && claude`). The mod reads only `<root>/.chassis-delegation.json`,
so the parent's file is never consulted; `/delegation init` there writes the
child's own files (cards, config, `.gitignore` line). Dispatch from the child
with `--here`, or with worktrees if the child has an `origin`.

**Escalation.** A failing verdict while the budget lasts is handled in two
steps. The first failure advises `next=resume agent=<id>`, which means
SendMessage the worker the claim lines. A later one advises
`next=respawn at <next tier>`, the same brief one tier up. With `autoEscalate`
the mod does either one itself. The budget counts spawns and resumes per task.
Past it the next spawn is denied.

Unverified is actionable too. While the budget lasts, an unverified verdict
advises a resume naming each unchecked claim and its reason (cut to 160
characters):
`next=resume agent=<id> — prove: gate (tree not at sha: 1 uncommitted path …), red (…)`.
That resume counts against the budget like a failing verdict's, and
`autoEscalate` performs it, sending the unchecked claim lines. Past the budget,
or with no agent id, the advice stays `check by hand — unverified is not a pass`.

**The git guard (Bash).** It covers the write verbs `commit`, `merge`,
`cherry-pick`, `rebase` and `push`. A command that runs one on a branch in
`guardBranches` is denied:

    chassis-delegation: no <verb> on <branch>; branch first (git checkout -b agent/<domain>/<id>)

To find the branch, the guard reads `git rev-parse --abbrev-ref HEAD` in the
command's folder. It follows `cd` and `-C`, and a `checkout -b` earlier in the
same command. A push that names a guarded branch (`git push origin main`,
`HEAD:main`, `--all`) is denied from any branch. On a guarded branch, a push
is a push of that branch only when it has no refspecs, or one is `HEAD`, the
branch's name, `<branch>:<x>`, `--all` or `--mirror`; tag pushes
(`git push origin v1.2.3`, `--tags`) and deletes or pushes of other branches
(`git push origin --delete agent/mod/GH-21`) pass. The guard reads command
words, not text, so a heredoc body that mentions `git commit` never triggers
it.

## Configuration

Three layers, in order of precedence:

    built-in defaults  <  <repo>/.chassis-delegation.json  <  /config (user settings)

Settings win. Maps (`gateMap`, `agentTypes`, `tierMap`) merge key by key;
other keys are replaced whole. In `/config`, a shared key left empty (`""`,
or `0` for `maxWorkers`) means "not set here", so the repo file speaks.

The repo file is JSON; keys starting with `_` are comments. It is read at
session start and again on every dispatch and verify. A bad key or value is
ignored, named in a toast, and logged.

`baseRef` and `ignore` are read from the repo file today. The settings layer
reads them from `/config` too, but `/config` shows only what the manifest
(`.claude-plugin/plugin.json`) declares; `baseRef`, `ignore` and `cardDir` are declared there.

| Key | Repo file | `/config` | Default | What it does |
| --- | --- | --- | --- | --- |
| `gateMap` | object | JSON string | `{}` | gate id → command, run by argv with no shell. `{files}` is files.txt, `{worktree}` the tree the gate runs in; chain with ` && `. A command the allowlist would refuse is dropped at load and named. No `sf`, `git`, `gh`, network, `rm` or publish. An id not in the map is "gate not re-run" (unverified) |
| `agentTypes` | object | JSON string | `{}` | card domain → subagent type. A domain not named runs on a subagent type of the same name if the session offers one, else `general-purpose` |
| `tierMap` | object | JSON string | `{economy: haiku, standard: sonnet, frontier: opus}` | tier → alias. `fable` is never spawned; it becomes opus, and when a brief, the caller or the map asks for fable the notice says so (`tier=frontier → opus (fable requested; fable is never spawned by the mod)`) and the attempt record keeps `requestedAlias: fable` |
| `domains` | array | comma string | `frontend, backend, ops, dispatcher, cross, shared` | the domains a card may name |
| `maxWorkers` | number | number (0 = unset) | `2` | briefed workers at once; the next one waits in a queue |
| `worktreeRoot` | string | string | `""` (siblings: `<root>-<id>`) | worktrees go to `<worktreeRoot>/<repo name>-<id>` |
| `cardDir` | string | string | `agents/tasks` | the folder the task cards live in, relative to the repo root (no leading `/`, no `..`); `/dispatch` and the dispatch tool read cards from it. `init` writes `delegation/tasks` in a plugin repo. `--replay` stays on `agents/tasks/` |
| `briefTemplate` | string | string | `templates/brief.md` | the brief body template file |
| `briefExtra` | string | string | `""` | repo-specific lines added to every brief |
| `evalCommand` | string | string | `""` | what the T1 eval runner runs; no command means no eval |
| `evalLiveCommand` | string | string | `""` | what the T2 (live, paid) runner runs |
| `autoEval` | boolean | boolean | `false` | run `evalCommand` once per new `origin/main` sha while idle (needs `evalCommand`) |
| `baseRef` | string | string | `""` (the chain: `origin/main`, `main`, `origin/master`, `master`) | where the delta starts when a brief names no `base=`. Used as given (`main`, `develop`, `HEAD~2`); a repo=here dispatch writes it into the brief as `base=`, and pins `HEAD` to its sha |
| `ignore` | array | comma string | `[".delegation/**"]` | globs always taken off a repo=here delta; `[]` in the repo file ignores nothing |

Settings only (`/config`, or `pluginConfigs["chassis-delegation"].options` in `settings.json`):

| Key | Default | What it does |
| --- | --- | --- |
| `autoEscalate` | `false` | perform the resume or respawn instead of advising it |
| `applyAmends` | `true` | append `scope+=` / `forbid+=` blocks to the brief before verifying |
| `defaultBudget` | `3` | attempts when the brief names no budget: spawn, resume, respawn |
| `verdictVerbosity` | `line` | `line`: one row; `full`: the row plus every claim line; `silent`: a toast only |
| `briefDir` | `""` | where briefs go; empty means `<root>/.delegation/briefs/`, and Claude Code's session scratchpad only when the root is not writable |
| `ledgerFile` | `true` | append one JSON line per judged attempt to `<root>/.delegation/ledger.jsonl` |
| `gitGuard` | `true` | the git guard on Bash |
| `guardBranches` | `main,master` | the branches it holds |
| `autoDebrief` | `true` | write a debrief in the background at a clean stop |
| `debriefIdleMinutes` | `20` | minutes without a turn before the clean-stop check |
| `debriefMinNewLines` | `25` | the harness breadcrumb lines a debrief needs, when a breadcrumb file exists |
| `debriefMinEvents` | `5` | without breadcrumbs, the corrections, tool denials and refutes a debrief needs |
| `debriefCooldownHours` | `6` | hours between two debriefs of one session |
| `debriefAgent` | `general-purpose` | the debrief's subagent type |
| `evalIdleMinutes` | `10` | minutes without a turn before the eval looks at `origin/main` |
| `evalLive` | `false` | run T2 after a clean T1, once a session, within the cost cap |
| `evalLiveMaxUsd` | `1` | what one T2 run may spend |
| `sessionUsdCap` | `50` | T2 never starts past this session cost |
| `evalAgent` | `general-purpose` | the eval runner's subagent type |
| `probeModels` | `false` | once a day, ask each of `candidateIds` one token and toast the first answer |
| `candidateIds` | `""` | comma-separated model ids to probe |

**The debrief.** When `~/.claude/commands/debrief.md` exists, the mod runs it.
Otherwise it runs the built-in `templates/debrief.md`. That template writes
`<root>/.delegation/debriefs/YYYY-MM-DD-<slug>.json` and adds one line to
`<root>/.delegation/ledger.md`. The friction signal also has two sources:

- **With a breadcrumb file** (`~/.claude/harness/breadcrumbs/<session>.jsonl`),
  it counts the lines past the file's `.done` watermark.
- **Without one**, it counts what the mod saw since the last debrief:
  - a prompt whose first word is no, stop, don't or actually;
  - a denied tool call;
  - a refuted verdict.

## The host-command allowlist

`$.process.run` runs with no permission prompt. So every argv the mod would
run passes `hooks/lib/allow.ts` first, and a refused argv never runs; the log
says `chassis-delegation: refused argv [...] (<reason>)`. The list, verbatim:

    git [-C <dir>] diff|merge-base|rev-parse|status|log …   (no --output, --ext-diff, --textconv;
                                        repo=here reads status --porcelain=v1 --untracked-files=all -z
                                        and rev-parse --abbrev-ref HEAD through this line)
    git [-C <dir>] worktree list [--porcelain|-v|--verbose|-z]
    git [-C <dir>] fetch [-q] origin main                    (exact)
    git -C <root> worktree add -q -b agent/<domain>/<id>[-replay] <worktree> <origin/main|7-40 hex sha>
                                        (<domain>: the configured domains, by default
                                         frontend|backend|ops|dispatcher|cross|shared;
                                         <worktree>: <root>-<id>[-replay], or
                                         <worktreeRoot>/<repo name>-<id>[-replay];
                                         the literal -replay suffix on both or neither)
    git -C <root> ls-tree --name-only <sha> agents/tasks/    (exact; /dispatch --replay)
    git -C <root> show <sha>:agents/tasks/<id>-<name>.md     (exact; /dispatch --replay)
    gh pr list|view …                                        (no --web)
    claude plugin validate|test <absolute folder>            (exact; a no-repo brief's gate)
    a gate-map command, word for word, `{files}` and `{worktree}` filled by absolute paths

`<id>` is `<PREFIX>-<number>[letter]`. Everything else is refused, including:

- `sf`, `curl`, `rm`;
- `git push`, `commit`, `reset` and `checkout`;
- any other git global option (`-c`, `--exec-path`, …);
- `gh pr merge` and `gh pr create`;
- any script or package command the gate map does not name exactly.

A gate-map command is refused when it contains any of these:

- shell syntax;
- a first word of `sf`, `curl`, `ssh`, `sudo`, `rm`, `git`, `gh`, `eval`, `env` or the like;
- a shell run with a flag;
- a package manager's publish or login verb.

A refused command yields no template, so its argv can never run. The same
check runs when the repo file or `/config` is loaded, with sample paths in
place of `{files}` and `{worktree}`: a command the allowlist would refuse at
verify time (say `claude plugin validate .`, which is not an absolute folder)
is dropped from the map then, and named in the toast and log with its reason,
so it is not found a gate run later.

The mod never runs your eval, your tests or a deploy itself. The eval runner
and the debrief are ordinary subagents, under the session's own permissions.

## The cost formula

Each verdict row carries `usd`, the session's cost growth over the attempt:

    usd = session cost at the verdict − session cost when the worker was spawned (or resumed)

It is read from `$.session.usage().cost.usd`, kept to 4 places in the store
and shown to 2. It includes whatever the main loop spent at the same time, so
treat it as approximate. A per-turn, per-model price is built in
`hooks/lib/cost.ts` but not wired in 0.2.0:

    usd = (in·P_in + out·P_out + cacheRead·P_in·0.1 + cacheWrite·P_in·1.25) / 1e6

Prices are dollars per million tokens, from a small table: opus-5-5 4/20,
opus-5 5/25, sonnet-5-5 2/10, sonnet-5 3/15, haiku-4-5 1/5.

## Known issues

- **Function-hook plugins need the engine's rollout switch.** Where it serves
  off, the mod does not load. `claude plugin test` then refuses with "hooks
  modules are turned off in this process: the rollout switch served off".
  `scripts/selfcheck.sh` says so instead of failing. The pure tests also run
  under plain node (see Developing).
- **A gate runs in the worker's worktree, as the worker left it.** If a tool
  the gate needs is missing there, the gate exits 127, which reads as
  unchecked, not refuted. The brief tells the worker to install first.
- **`usd` is approximate.** See the cost formula.
- **Concurrent workers can starve the machine.** `maxWorkers` (2) caps briefed
  workers. It does not count ad hoc agents.
- **The git guard reads the command text.** It cannot see a commit made inside
  a script, or a folder named through a variable.
- **The background runners act on the session's permissions.** The built-in
  debrief is told to write only under `<root>/.delegation/`; your own
  `~/.claude/commands/debrief.md` writes where it says. The eval is off until
  you set `evalCommand`.
- **Not wired in 0.2.0.** The dashboard band and pane (`hooks/lib/dashboard.ts`,
  `metrics.ts`) and the per-turn cost (`cost.ts`) are built and tested as
  libraries, but not hooked up. `/delegation` prints the state as text.

## Store and ledger

- **`<root>/.delegation/ledger.jsonl`** gets one JSON line per judged attempt,
  holding the attempt fields plus `verdict`, `next` and `sessionId`.
- **The store** is `~/.claude/plugins/store/chassis-delegation_<id>.json`, with
  these keys:
  - `delegation.tasks.<ID>`: every attempt (a repo=here attempt also carries `here`, the root it shares, and `files`, what its hand-back claimed; a cardless one carries `adhoc: true`; one where fable was asked for and opus spawned carries `requestedAlias: fable`);
  - `delegation.recent.<session>`: the verdict lines;
  - `delegation.debrief.<session>`;
  - `delegation.friction.<session>`;
  - `delegation.evals`.
- **`$.state`** holds `chassis-delegation.workers`, `.status`, `.lastVerdict`
  and `.queue`, declared in `types/index.d.ts`.

## Developing

    claude plugin validate <this folder>     # the gate: manifest + what the module hooks and calls
    claude plugin test <this folder>         # every test, the hook tests included (needs the rollout switch)
    tsc -p <this folder>                     # once the engine has laid .claude-plugin/types
    node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs
                                             # the pure tests and the real-git suite, under plain node

The code is laid out like this:

- **`hooks/lib/*.ts`** are pure (no `$`):
  - `verify-native.ts` holds the verifier, `gates.ts` the gate commands and `allow.ts` the allowlist;
  - `repoconfig.ts` reads the repo file, `init.ts` scaffolds and `gitguard.ts` holds the guard;
  - `dispatch.ts` covers the card, the brief and the worktree;
  - `cleanstop.ts` decides the debrief and `evaltrigger.ts` the eval.
- **`hooks/register.ts`** holds every `$` call. `$` is only ever spelled
  `$.noun.method(...)` or passed to a function, never stored.
- **`tests/harness.ts`** answers every `$` call from memory. No test spawns,
  dispatches or runs anything real.
- **`tests/node/verify-native.git.node.mjs`** builds temporary git
  repositories under `tests/.tmp/`. It checks these cases: verified, a sha off
  the branch, a sha that does not exist, a dirty tree, a files mismatch, a red
  gate, a red file in the worktree (held, then refuted when named again), and a
  dirty repo=here checkout shared with another worker.

If `claude plugin test` refuses with the rollout-switch message, wait a minute
and retry. If it still refuses, the node runner covers every pure test, and
the hook tests are owed until the switch is on.
