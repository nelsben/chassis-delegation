# chassis-delegation

![chassis-delegation: the brain writes the task card; dispatch spawns a worker at the opus, sonnet or haiku tier; the hand-back comes back with its verdict](docs/chassis-delegation.png)

Brain-seat delegation for Claude Code. The main model (the "brain") hands a
task card to a worker subagent with one tool call, `dispatch`, then makes the
one Agent call it gets back. The mod does the rest. It writes the brief, cuts a
git worktree and picks the model tier, and returns the spawn for the brain to
make (holding the task in a queue while two others run). The brain makes the
spawn; the mod shapes it (tier, slot, attempt record) and sees the worker
through every hook it has. When the worker reports, the mod checks the report
against the repo itself (branch, sha, changed files, scope, gate, PR) and hands
the brain one verdict line with what to do next. At a quiet stop it can write a
debrief in the background, and it can run your eval when `origin/main` moves.
It is a Claude Code mod (a plugin of function hooks). It needs nothing from
any other repo: no scripts, no harness, no network. Version 0.9.1, MIT.

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
[Without the engine](#without-the-engine-two-settingsjson-hooks)).

## Upgrading

Upgrade between turns, with no worker running. Type `/delegation update`: it
finds the loaded folder (`$.plugin.root`, the `loaded from` line of
`/delegation`) and, for a git clone, runs `git fetch origin main` then
`git merge --ff-only origin/main` there; a dirty tree or a non-fast-forward
refuses with git's reason and changes nothing. It prints
`update: <old version> (<old sha>) → <new version> (<new sha>), n commits`, the
CHANGELOG sections newer than the old version (at most 40 lines, with a pointer
to the README's `From <old> to <new>` section when there is one), adds to
`.chassis-delegation.json` every key that has a built-in default and is missing
(with a `_<key>` note; nothing else in the file moves), and ends with what is
left: a folder under `~/.claude/dev-mods` reloads when the turn ends; for any
other folder the window must be reloaded (VS Code: Developer: Reload Window;
terminal: restart `claude`; the session can be reopened with its transcript),
since nothing reloads a folder outside `~/.claude/dev-mods`. A folder that is
not a clone is left alone and the command prints the `git clone` that replaces
it. It refuses while a worker is running. `/delegation` itself adds
`update: n commits behind origin/main · run /delegation update` when the loaded
clone is behind (one fetch per ten minutes), and nothing when it is current.
Nothing updates by itself.

**Why a reload matters.** A session runs the mod it loaded, and keeps it: the code,
and the templates that code renders (`hooks/templates/brief.md`, `review.md`,
`debrief.md`), which the mod reads once when it loads and never again until a reload. Pulling the folder under a running session therefore changes nothing in that
session, and it cannot mix old code with a new template: before the templates were kept,
a pull that brought a new section into `brief.md` while the session still ran the code
that predates it wrote briefs with raw `{{#none}}` and `{{/repo}}` markers, and each
worker guessed which sections applied. A brief that still holds a `{{` marker after it is
rendered is now refused at dispatch, naming the marker and the template; nothing is
written and no worktree is made. A `briefTemplate` the repo file names is the repo's own
file, read at each dispatch, and is held to the same check.

**The `code:` line.** `/delegation` reads `hooks/lib/version.ts` on disk (as text, not an
import) and, when it names a version other than the one running, prints
`code: running 0.8.0, folder holds 0.9.0 — reload the window to run it` under the `mod:`
line. It means the folder has moved on and this session has not: reload the window (VS
Code: Developer: Reload Window; terminal: restart `claude`) to run what is on disk. For a
folder under `~/.claude/dev-mods` the line says the folder reloads when the turn ends
instead. `/delegation update` prints the same line after a merge that moved the version.
No line means the running code and the folder agree (or the folder holds no readable
`version.ts`).

The steps below are the fallback by hand; they are written so the agent in the
session that loads the mod can follow them.

1. **Find the loaded copy.** Type `/delegation`. From 0.5.0 on, one line reads
   `mod: chassis-delegation <version> loaded from <folder>`. An older version
   has no such line: the folder is the session's hot-reload clone,
   `~/.claude/dev-mods/<session-id>/chassis-delegation`, or the one named by
   `--plugin-dir` or `CLAUDE_CODE_PLUGIN_DIRS`.

`/delegation` also prints what each alias resolved to at the last spawn and
when it moved (the model alias is the engine's, so the mod only reports what
it saw):
`aliases: haiku → claude-haiku-5-5 (since 10-08; was claude-haiku-4-5-20251001 until 10-07) · sonnet → … · opus → …`.
When an alias moved in the last 7 days a second line says so, for example
`haiku moved on 10-08: economy cards now run on Haiku 5.5; re-run the economy
cases of tests/eval/classifier-cases.jsonl`.
2. **Update that folder.**

       git -C <folder> pull --ff-only origin main

   If the pull refuses with "unrelated histories", the clone was made before
   2026-10-05, when this repository was republished with a fresh history.
   Delete the folder and clone it again:

       git clone https://github.com/nelsben/chassis-delegation.git <folder>

   A folder that is a plain copy, not a git clone, is replaced the same way.
3. **Load it.** A hot-reload folder reloads when the turn that changed it ends,
   so run the pull from inside that session; a pull from a terminal between
   turns may not be noticed. A `--plugin-dir` or `CLAUDE_CODE_PLUGIN_DIRS`
   folder needs Claude Code restarted.
4. **Check it.** `/delegation` names the new version. Then run
   `/delegation setup` in the repo: in a repo already set up it changes no
   file, checks the repo, and says what it would have set.
5. **Read what changed** for your step below, so the brain expects it.

### From 0.9.0 to 0.9.1

What the brain will see:

- **The brain and worker cost figures follow each model's own price (MOD-47).** `/delegation` and the dashboard now follow each model's own cache-read price, and 1-hour cache writes at 2x, so the money line can read higher than before on the same session.
- **The brain sees what driving costs it (MOD-48).** `/delegation` and the dashboard show a brain calls row and a warn row, on by default, with the options `driveWarn` and `driveWarnTokens`.
- **The legacy verdict word `verified` is no longer read by a reader of its own (MOD-49).** A stored record or row that still carries it is read as `consistent` by one normaliser, with no further deadline.

What to do: nothing in an existing repo's config needs to change; set `driveWarn` to `false` in `/config` to silence the warn row.

### From 0.8.3 to 0.9.0

What the brain will see:

- **The brain can delegate into another local git repo (MOD-44, public issue 95).** `card` and `dispatch` take `repo` as the absolute path of another git checkout, and the task's card, base, worktree, gate and verifier are that repo's. Run `setup` with that path first when the repo has no `.chassis-delegation.json`.
- **`init` and `setup` take a path (MOD-45).** The brain can scaffold a sibling repo before delegating into it, without writing anything in the session's own root.
- **The old verdict word `verified` stopped being read in this release (MOD-49).** A stored record or recent row that still carries it is read as `consistent` once, and the ledger keeps it as written.

What to do: nothing in an existing repo's config needs to change.

### From 0.8.2 to 0.8.3

What the brain will see:

- **A verdict wake for a task merged before it is delivered no longer arrives (MOD-42).** While the brain's turn is open, a consistent verdict's task is checked for merged again at delivery; a merged one is dropped with `wake skipped: <id> merged before delivery`. Refuted, over-spend, no-report and `ready:` wakes always arrive.
- **The correction detector catches pushback and challenge questions, not only an opening "no" or "stop" (MOD-39, public issue #89).** Messages such as `i don't agree`, `shouldn't it …?` or `looks wrong` are caught wherever they appear in the message.
- **A card's frontmatter value with a space and a hash is no longer cut there (MOD-40).** A title or red_test holding ` #` is double-quoted and read back whole.
- **A worker resumed after a consistent verdict is judged again when it hands back (MOD-41).** A hand-back at a new sha is recorded as the next attempt and gets a verdict row; a hand-back at the same sha changes nothing.
- **The debrief check accepts a correction the transcript holds (MOD-38, public issue #90).** A correction the session transcript holds at its time no longer counts toward the flag.
- **The session's money figures count only its own attempts (MOD-37, public issue #91).** Ad hoc spawns get their own figure, and an unattributed remainder closes the sum.

### From 0.8.1 to 0.8.2

What the brain will see:

- **A verdict wake is skipped for a task already merged, an accept is on the ledger, and each verdict row is written once (MOD-35, public issue #84).** A verdict wake no longer arrives for a task already merged; its row is still posted. Accepts are recorded on the ledger, and no verdict row is written twice.
- **Per-domain lessons reach every brief in the domain (MOD-34, public issue #65).** A `lessons/<domain>.md` file beside the cards is appended to each brief for that domain, capped at 40 lines; `/delegation lesson` adds one.
- **`/delegation debrief apply` turns the debrief's proposals into actions you approve (MOD-33).** `apply` lists the latest proposals, and each one you approve or dismiss is recorded; the mod writes nothing but its own record.
- **After a clean debrief check the mod tells the agent to mark its watermark, and a false refute is one fact (MOD-32).** A refute that a re-judge found consistent at the same sha is shown once, as a false refute.
- **The mod asks whether to post a debrief's findings (MOD-31).** A new `postFindings` option, `ask` | `auto` | `off` (default `ask`), decides whether the findings are posted to the issue repo.

What to do: set `redact` in `/config` before any session posts, and set `postFindings` to `auto` only after that.

### From 0.8.0 to 0.8.1

What the brain will see:

- **The debrief prompt carries only the facts inside its window, dated (MOD-26, public issue #55).** A breadcrumbs debrief names the window it covers and carries only the facts inside it, each dated; a boundary-only window spawns nothing, so no debrief is written for a window with nothing new in it.
- **`files=` takes a folder glob, and the red claim quotes the line that failed (MOD-27, public issue #56).** A brief's `files=` may name a folder glob as well as a path, and a red claim quotes the line of the red file that failed.
- **The mod reads its templates once, at load, and says when the folder is newer than the code (MOD-28).** A brief with a template marker left in it is refused before any worktree is made, and `/delegation` says when the folder on disk holds a newer version than the code running.
- **The card dry run warns when a forbid collides with the card (MOD-29, public issue #63).** A `forbid` glob that matches the card's own scope or done-when is named in the dry run, and the card tool says that `*` crosses folders.
- **After `/delegation update`, reload the window.** The new code runs only after the window is reloaded, and `/delegation` now says so itself when the folder is ahead of the code running.

### From 0.7.0 to 0.8.0

What the brain will see:

- **The verdict word is `consistent`, not `verified` (MOD-19, public issue #1).**
  Every row that said `verified` now says `consistent`:
  `attempt 1/2 consistent · sonnet · $0.19 · next=accept`, `verdict=consistent`,
  the attempt records, the ledger, the dashboard and the debrief. It means every
  claim of the report that the mod can check matches git (branch, sha, files,
  scope, gate, red evidence). Consistent is not a review: nothing in the check
  reads the diff, so read it before you accept. The old word `verified` stopped being read in this release (MOD-49); a script that parses an old row should accept both words.
- **A verdict wakes you, and the posture line says to act (MOD-15).** After the
  mod posts the row for a background worker's hand-back it submits that row with
  its next action as a turn of your own: the model reads "The
  chassis-delegation plugin sent a message", and you act on it without waiting
  for the person to type. The "Delegation state" section carries one posture line
  while a `ready:` row, a respawn block or a pending review block is out: make
  that call without asking; ask only when a verdict is refuted on a claim you
  cannot amend, a worker is over its spend, or an amend needs approval. A
  `ready:` worktree row you leave unclaimed for 10 minutes is started by the mod
  itself, outside its hooks; `repo=here` and `repo=none` rows always wait for
  you. `wakeOnVerdict` and `readyFallbackMinutes` turn these off.
- **An optional reviewer stage, off by default (MOD-21, public issue #1).** With
  `review` set to `on` (or `on-frontier`), a consistent verdict says
  `next=review` and ends with a spawn block for a fresh read-only reviewer, one
  tier below the worker's: make that Agent call verbatim. It labels each claim of
  the hand-back confirmed, refuted or unverifiable and edits nothing. With none
  refuted the next is `next=accept`; with one refuted it is a resume of the
  worker with the rows quoted, spent from its `budget=`. The reviewer never
  counts against the budget. With `review` off, nothing about a verdict changes.
  See [Review](#review).
- **Research cards: `repo=none` and `repo=here` with outputs outside the repo
  (MOD-22, public issues #32 and #33).** The `card` tool takes `repo`
  (`worktree`, `here`, `none`); `scope` and `forbid` take absolute paths and
  globs, and the first absolute scope entry is the output folder. The brief
  header gains `outdir=` and `scratch=`: deliverables go in the output folder,
  helper files in scratch, never in the repo. A `repo: none` card has no
  worktree and no git. The verdict also checks the outside folder (a changed path
  outside the scope is refuted) and the report's new `artefacts=` (each path must
  exist and not be empty) and `metrics="k=v"` (recorded, never judged); a
  gate-map command may name `{outdir}`. See [Research cards](#research-cards).
- **Resources and lanes (MOD-23 and MOD-24, public issues #33 and #32).** A card
  may name `resources: [blender-live]`. A dispatch, or your own Agent call, for a
  card whose resource a running worker holds is queued, free slot or not:
  `queued: OPS-9 — waiting for resource blender-live (held by OPS-8)`. The mod
  prints no spawn block for it; the hand-back that frees the resource carries the
  `ready:` line. A `repo=here` card that shares only a resource is queued the
  same way; one whose scope overlaps an in-flight `repo=here` card is still
  refused, and still needs `--force-overlap`. The `card` tool also takes
  `lanes: [{ title, scope, doneWhen? }]` and writes one card per lane (all or
  none, sequential ids, disjoint scopes, a shared forbid); `dispatch: true`
  dispatches each in order. The dashboard shows the resource a worker holds. See
  [Exclusive resources and fan-out](#exclusive-resources-and-fan-out).
- **A worker's Bash carries its own identity (MOD-16, public issue #24).** Every
  Bash call of a recorded worker runs behind
  `export CHASSIS_SESSION_ID=<task>-a<attempt> CHASSIS_TASK=<task> CHASSIS_ATTEMPT=<n>`,
  so a lock script keyed on the session id tells sibling workers apart. Your own
  Bash, ad hoc agents and the debrief and eval runners are never rewritten. A
  `briefExtra` line asking workers to prefix their lock calls by hand is no
  longer needed. See [A worker's identity](#a-workers-identity).
- **A settings.json fallback for hosts that do not load the mod (MOD-17, public
  issue #2).** Where the engine's rollout switch serves off, two ordinary
  `settings.json` command hooks from `bin/chassis-hook.mjs` still print the
  verdict row (`via=settings-hook`, nothing recorded, `repo=here` and `repo=none`
  briefs engine-only) and run the git guard. It needs node 22.18 or newer. See
  [Without the engine: two settings.json hooks](#without-the-engine-two-settingsjson-hooks).
- **The debrief shows the agent's own proposals, and a post refuses while
  `redact` is empty (MOD-18).** When a debrief hands back, the mod prints
  `proposals: n for you to review (never posted)`: the agent's process changes,
  one line each, which are never written to the findings and never posted.
  `issueRepo` now defaults to the mod's own repository, so mod findings can be
  filed from any repo the mod runs in. `/delegation debrief post <n|all>` files
  nothing while the `redact` option in `/config` is empty, and says to set it
  first. See [Posting the findings](#posting-the-findings).
- **A gate red only on timeouts is run once more (MOD-20).** When a gate fails
  with nothing but the engine's `timed out after N ms` in tests the delta did not
  touch, the verifier runs it again; the claim reads
  `gate green on rerun (first run: 2 timeouts in untouched tests)`, and a second
  red is refuted as before. Engine gates take turns (a verdict detail line says
  `waited 40 s for MOD-x's engine gate`), so two workers no longer false-refute
  each other under load.
- **The upgrade is `/delegation update`.** It prints the CHANGELOG slice newer
  than your version.

What to do:

- Nothing in `.chassis-delegation.json` has to change, and every new option is
  off or has a default. You may want to set three things. To have a reviewer read
  each consistent verdict, set `"review": "on"` in the repo file (`/config`
  wins); leave it out and nothing reviews. Before you post any debrief finding,
  set `redact` in `/config` to the product, customer, employer and repo names
  this session must never publish, or `post` refuses. Set `issueRepo` only to
  send findings somewhere other than the mod's own tracker. A repo file written
  by an earlier init that already carries `"issueRepo": ""` keeps posting off
  until you remove that line.

### From 0.6.1 to 0.7.0

What the brain will see:

- **Dispatch prints an Agent call; you make it (MOD-12, public issue #22).**
  `/dispatch` and the dispatch tool still write the brief, cut the worktree and
  pick the tier, but they spawn nothing. The result ends with `spawn: Agent` and
  a fenced JSON object; make that Agent call verbatim, with the same
  `subagent_type`, `model` and `prompt`. A hand-back's `ready: <id>` line means
  make the next call: run that brief's spawn block (`/dispatch <id>` prints it
  again). A respawn verdict prints the call instead of starting it, one tier up
  after a refute. A full house answers `queued:` and the mod tells you when a
  slot frees. A second spawn of a brief that still runs is refused, naming the
  attempt. `autoEscalate` now performs resumes only.
- **Workers run under the mod's hooks (MOD-13).** The git guard names a
  worker's task in its refusal, the spend ceiling posts one row at `spend=` and
  denies the worker's next tool call at twice its ceiling (`SubagentHandback`
  still passes), and a worker's steps are set to an effort by tier from the new
  `effortByTier` key (economy `low`, standard `medium`, frontier `high`; a
  card's `effort:` wins). `/delegation` prints the effort.
- **The upgrade is `/delegation update`.** It prints the CHANGELOG slice newer
  than your version.

What to do:

- Nothing in `.chassis-delegation.json` has to change; `effortByTier` has its
  defaults until you set it.

### From 0.6.0 to 0.6.1

What the brain will see:

- **`/delegation debrief` runs now and ends with scrubbed findings (MOD-6).**
  The command starts the background debrief at once, one at a time, and prints
  the agent id, the mode and the folder. Every debrief writes
  `<name>.findings.json` with the mod's own findings, scrubbed of home paths,
  the repo, its origin, the git user and the `redact` words.
- **`/delegation debrief post` and `issueRepo` (MOD-7).** With `issueRepo` set
  (`owner/name`), `post` prints the findings as they would be filed, `new` or
  `covered by #k`; `post 1,3` or `post all` files the new ones. The allowlist
  gains `gh issue create`, `gh issue comment` and `gh issue list` for that repo
  only. `/delegation` prints `issues: <repo>` when it is set; empty is off.
- **`delegateOnly` resolves `~`, `$HOME`, `$PWD` and earlier variables (MOD-8).**
  A write to `$M/p.md` after `M=~/.claude/m` is a write outside the repo and
  runs, not a denied source edit.
- **`delegateOnly` follows `cd` and `git -C` and judges `git commit` (MOD-9).**
  A relative write after `cd <worktree>` is read against that folder. A commit
  outside the root is never an edit; in the root, a commit of only card,
  `docs/`, `.delegation/`, repo-file or CHANGELOG paths runs. BSD
  `sed -i ''` is read right.
- **A debrief is bounded to its window and validated (MOD-10, public issue
  #50).** Entries outside the window are stripped and a list the window cannot
  contain is flagged; the record moves only on a clean check. Findings about
  the host go to `host_findings`, which `post` never files.
- **The upgrade is `/delegation update`.** It prints the CHANGELOG slice newer
  than your version.

What to do:

- Nothing in `.chassis-delegation.json` has to change; `issueRepo` is off until
  you set it.

### From 0.5.0 to 0.6.0

What the brain will see:

- **The live dashboard (GH-112).** A band above the prompt while a worker is
  live, queued or owed a verdict, and `/delegation dashboard` for the pane. On
  a screen that shows no mod panes it prints the dashboard as markdown
  instead. `dashboardBand` turns the band off.
- **Aliases and the classifier's second opinion (GH-114, public issue #34).**
  `/delegation` prints what each model alias resolved to and when it moved. The
  card tool's dry run prints `card says <tier> · classifier says <tier>` (or
  `agrees`); `classifierSecondOpinion` turns it off.
- **Escalation only on sha, gate or red (GH-115, public issue #34).** A scope,
  files, branch or pr refute holds the tier on respawn and says `(held: a scope
  refute)` or `(held: a files refute)`, with the advice to amend the scope or
  list the paths in `files=`.
- **The brain's own spend, apart (GH-113).** `/delegation` prints `brain: … ·
  workers … · brain share p%`, and the dashboard shows it as its own tile and
  row. Fable is priced.
- **`delegateOnly` (GH-113).** `off`, `warn` or `deny` keeps an opus or fable
  brain from editing source itself; under `deny` a source edit is refused and
  names the card tool.
- **Spend defaults 3, 10 and 25 dollars (GH-116, public issue #34).** Setup
  proposes higher ceilings, written as `spendByTier`, when a gate deploys or
  runs remotely.
- **`base=` in a reused brief (MOD-2, public issue #37).** A dispatch with
  `--base <sha>` sets or replaces `base=` in a brief already on disk and says
  which; with no base it cuts from the brief's own.
- **One proof of red per task (MOD-1, public issue #35).** A red file
  identical to an earlier attempt's is held again, not refuted.
  `/dispatch <ID> --verify <sha>` at the last attempt's sha re-judges that
  attempt: no new record, no budget spent.
- **`/delegation update` (MOD-3).** It fast-forwards the loaded git clone to
  origin/main, migrates the repo config, and says what reload is left. It
  refuses while a worker runs.
- **Owed rows retire (MOD-4, public issue #23).** A row leaves the state block
  when its work is on origin/main; `/delegation accept <id> [note]` closes one;
  the block counts the older ones as `n older owed rows: <ids>`.
- **From 0.6.0 on, the upgrade is `/delegation update`.** A session still on
  0.5.0 has no such command and follows the hand steps above once.

What to do:

- Nothing in `.chassis-delegation.json` has to change; a key you never set
  takes its default.

### From 0.4.0 to 0.5.0

What the brain will see:

- **A prose scope stops the dispatch.** A card whose `scope:` reads as prose
  stops before the worktree and the spawn; dispatch again with
  `--scope <globs>`, or write globs on the card. Before, the worker ran and
  the brief was refused afterwards.
- **A spend ceiling.** New briefs carry `spend=<usd>` from `spendByTier`
  (economy 3, standard 10, frontier 25 dollars), and the worker is told it. A
  run that ends past it with no report gets one wrap-up message; at twice it
  the attempt is `over-spend`. Set `spend:` on a card or `spendByTier` in the
  repo file to change it; `0` means no ceiling.
- **Rows show the worker's own cost**, priced from its own usage. A `~` marks
  the old figure, the session's cost growth, when no usage came back.
- **The queue reads differently.** Refusals say `(1 live: A; 1 queued: B)`; a
  second dispatch of a queued task answers `already queued since HH:MM`; a
  queued task that is refused keeps its place and the refusal is a row.
- **No escalation on a missing report.** A `no-report` respawns at the same
  tier. Finished work found in a worktree gives `next=verify sha=…`: run
  `/dispatch <ID> --verify <sha>`.
- **`--base <sha>` is written into the brief** as `base=`, and the verifier
  diffs a stacked task against it.
- **A moved file is listed once, at its new path.**
- **Unknown card tiers are named**, and a model name is read as its tier
  (`tier: opus` is frontier).
- **New: `/delegation setup` and the `card` tool.** Say a task in a sentence;
  Claude writes the card, shows the brief, and dispatches when you say go.
- **`repo=here` leaves the card folder out of the delta**, so nothing needs
  committing before a dispatch.
- **Claude Haiku 5.5.** The economy tier maps to the alias `haiku`, which
  Claude Code 2.1.294 and later resolves to Claude Haiku 5.5 on the Anthropic
  API; on Bedrock, Vertex and Foundry it still resolves to Haiku 4.5. The mod
  toasts the change once: `haiku now resolves to claude-haiku-5-5 (was …)`.

What to do:

- Nothing in `.chassis-delegation.json` has to change; a key you never set
  takes its default.
- A brief already written is reused and never rewritten, so a task whose brief
  predates the upgrade dispatches without a spend ceiling. For a task not yet
  started, delete `<root>/.delegation/briefs/<ID>.brief.md` before its next
  dispatch to get one.
- Give cards with a prose scope glob scopes, or pass `--scope`.

### From 0.3.0 or earlier

Clone again (step 2: the history changed), then read `CHANGELOG.md` from your
version up.

## Dashboard

A live view of what delegation is doing and spending, in two places:

- **The band above the prompt**, drawn only while a worker is live, a spawn is
  queued or a verdict is owed (nothing otherwise):
  `delegation · 2 live · 1 queued · $4.12 ·` a sparkline of the last 30
  minutes of spend, and a `[ details ]` button that opens the pane. The whole
  band is a hover scope: hover it and a card opens beneath the row with the
  first three blocks below. Turn the band off with the `dashboardBand`
  setting in `/config` (default on); `/delegation dashboard` still opens the pane.
- **The pane**, opened by `/delegation dashboard` or the band's `[ details ]`
  and never on its own. It draws all four blocks, then "Across sessions" (the
  six cross-session sparklines over the last 14 sessions) and the open items.

The four blocks:

1. **Tiles**: live workers, queued, spend this session, and how many cards
   came back consistent on the first attempt (n of m).
2. **Spend over time**: cumulative session dollars as one line with a light
   area, in the surface's text colour (it is the total, not a model), with a
   tick on the time axis for each spawn and verdict. On desktop, VS Code and
   mobile it is an Svg with a crosshair tooltip (time, dollars so far, the
   nearest event); the terminal draws the same as a grid of block glyphs.
3. **Worktrees**: one row per task this session plus any worktree on disk
   under the mod's naming (`<repo>-<ID>`, or under `worktreeRoot`): task, model
   (a chip in the model's colour and its name), state (`live 04:12`,
   `queued #2`, `verdict owed`, or the verdict with its icon), worktree folder
   and branch, tokens, cost, and attempt over budget. While a worker holds an
   exclusive resource (MOD-23; see [Exclusive resources](#exclusive-resources-and-fan-out)),
   a `resource` column names it (`blender-live`), and a queued row waiting for one
   says `waits blender-live`; the column is absent while no row has one.
4. **Spend by model**: a bar each for haiku, sonnet and opus (anything else is
   "other"), labelled `sonnet · $3.10 · 412k tok · 4 consistent`.

What is live and what is not. The spend line samples the session's cost every
15 seconds while a worker is live or queued and every 60 seconds otherwise
(the last 240 points are kept, and survive a reload), and the live and queued
counts and the `live mm:ss` clock follow the engine's agent list. The mod adds
a worker's cost from each of its `turn.complete` events, so **a worker's tokens
and cost, and the by-model bars, update when a run ends**, not per step. Since
MOD-12 every worker is the brain's own Agent call and the engine shows the mod
its steps too (public issue #22); reading them mid-run is the next card. The
tokens column is the total the run reported; the dollar figure is the worker's
own cost.

A screen that shows no mod panes (the VS Code extension today) answers
`/delegation dashboard` with the same blocks as markdown text instead: the
headline, the spend over the session, the worktree table and spend by model.

## Commands and tools

| Name | Who calls it | What it does |
| --- | --- | --- |
| `/delegation` | you type it | shows the delegation state and where the config came from |
| `/delegation setup [path]` | you type it | checks the repo and tools, names the fixes, then scaffolds and asks for your first task (see [Setup](#setup)) |
| `/delegation init [path]` | you type it | the bare scaffold, no checks (step 4 above) |
| `/delegation update` | you type it | brings the loaded copy of the mod to origin/main (fast-forward only), migrates this repo's config and says whether the session reloaded or needs a restart (see [Upgrading](#upgrading)) |
| `/delegation debrief` | you type it | runs the background debrief now and ends with scrubbed findings about the mod, ready to post (see [The debrief now](#the-debrief-now)) |
| `/delegation dashboard` | you type it | opens the live dashboard pane (see [Dashboard](#dashboard)); nothing opens it unasked |
| `/dispatch <ID> [--dry-run\|--scope\|--forbid\|--replay\|--base\|--here\|--repo <abs path>\|--force-overlap]` | you type it | dispatches a card: the brief, the worktree and the tier, then the spawn block, the one Agent call that starts the worker (see **Spawn** under [The contracts](#the-contracts)); the model can also run it through the tool. `--here` shares the session's own checkout (see [repo=here](#repohere-the-main-checkout)) |
| `/dispatch <ID> --verify <sha>` | you type it, or the brain after a `work present` row | spawns nothing: runs the verifier on the work already in the task's worktree at that sha (see **Look before you respawn** under [How a report is verified](#how-a-report-is-verified)) |
| `mcp__chassis-delegation__dispatch` | the model, on its own | the same dispatch, as a tool; the model then makes the Agent call its result ends with |
| `mcp__chassis-delegation__card` | the model, on its own | you say a task in a sentence; the model looks at the repo, calls this with the title, why, done-when, scope globs and red test (and `repo`: `none` or `here` for research or extraction with outputs outside the repo, see [Research cards](#research-cards), or the absolute path of another local checkout, see [Delegating into another repo](#delegating-into-another-repo); `resources` for a live app only one worker may use, and `lanes` to write several research cards at once, see [Exclusive resources and fan-out](#exclusive-resources-and-fan-out)); it writes the card, runs the dry run and returns the one-line summary, a line `card says <tier> · classifier says <tier>` (or `· classifier agrees`; one classifier call per card written, never on dispatch, off with `classifierSecondOpinion`) and the brief header. Dispatch when you say go (the `dispatch` tool, or `card` again with `dispatch: true`) |
| `mcp__chassis-delegation__init` | the model, on its own | the same scaffold as `/delegation init`, as a tool (optional `path`, as for `setup`) |
| `mcp__chassis-delegation__setup` | the model, on its own | the same checks and scaffold as `/delegation setup`, as a tool (optional `path`: another local checkout to set up instead, see [Delegating into another repo](#delegating-into-another-repo)) |

A user skill or command named `delegation` or `dispatch` under
`~/.claude/skills` or `~/.claude/commands` shadows the mod's commands; remove it.

## Setup

`/delegation setup` (or the `setup` tool) checks the repo and prints one line
per check, `✓` or `✗` for the required ones and `·` for advice, with the fix on
the line under a failing one. The mod cannot run the fixes itself (its
[host-command allowlist](#the-host-command-allowlist) has no `git init`,
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

## Sixty seconds

1. **Set up, then say the task.** Run `/delegation setup` once. Then tell
   Claude what you want in a sentence ("add a function that reads a file
   header and returns its size, with a unittest"). Claude looks at the repo,
   calls the `card` tool, and shows you the card's path, a one-line summary and
   the brief header:

       wrote …/agents/tasks/OPS-1-add-a-function-that-reads.md
       OPS-1 · standard → sonnet · scope game_decompiler/**, tests/** · gate test · red: python3 -m unittest tests.test_rom · 2 attempts · $6 ceiling

       [[brief v=1 task=OPS-1 subtask=main purpose=build tier=standard model=sonnet …]]

       Say go and Claude dispatches OPS-1.

2. **Say go.** Claude calls the `dispatch` tool (or the `card` tool again with
   `dispatch: true`); you can also type `/dispatch OPS-1` yourself. The tool
   reports what it did, one line per step, and ends with the spawn block:

       1. card …/agents/tasks/OPS-1-fix-the-thing.md (status queued, domain ops)
       2. brief …/.delegation/briefs/OPS-1.brief.md written (tier=standard, model=sonnet, budget=2-attempts)
       3. worktree …-OPS-1 on agent/ops/OPS-1 from origin/main
       4. spawn prepared: general-purpose on sonnet · tier=standard (brief) · attempt 1/2 — nothing runs until the Agent call below is made
       brief …/OPS-1.brief.md · worktree …-OPS-1 · branch agent/ops/OPS-1 · tier=standard → sonnet

       spawn: Agent
       ```json
       { "subagent_type": "general-purpose", "model": "sonnet", "description": "OPS-1 standard sonnet", "prompt": "Your brief is the file …/OPS-1.brief.md. Read it whole, then follow it exactly." }
       ```
       The worker starts when you make this Agent call: pass the JSON above as its input, verbatim; …

   Claude makes that Agent call, and the worker starts. The mod's spawn hook
   tiers it, takes a worker slot, records attempt 1 and runs it in its worktree;
   from then on the mod's hooks see the worker (the git guard, its spend, its
   hand-back).

3. **The worker hands back.** The brain's conversation gains one row:

       chassis-delegation: OPS-1 attempt 1/2 consistent · sonnet · $0.41 · next=accept

   A failed check names its first failed claim, and `next=` tells the brain
   what to do:

       chassis-delegation: OPS-1 attempt 1/2 refuted on files (files= does not match the actual delta …) · sonnet · $0.38 · next=resume agent=agent-7

4. **`/delegation`** prints what is running, pending, queued and owed, plus
   the last verdicts and where the config came from.

## What the person sees

The brain does the typing. You see:

- the tier decision under each spawn, such as
  `tier=standard → sonnet (brief) · attempt 1/2`. A briefed spawn's notice
  ends with its attempt of the budget, so a retry's spend is never a
  surprise. The tier comes from the brief header's `tier=`, else the caller's `model`,
  else the classifier. The classifier is called only when there is no header
  and no caller model, and the debug log names the source:
  `T-7: tier=economy picked by the brief header's tier= (no classify call)`;
- the status line, `<n> workers · $<usd> · ctx <pct>%`;
- toasts: `debrief running in the background`, `T1 63/63`, `started queued OPS-3 (waited 4 min)`;
- the verdict rows the brain answers.

A compaction keeps the delegation loop's position. While anything runs or is
owed, the system prompt carries a short "Delegation state" section, at most 40
lines.

Three rules keep that section about what is still live:

- **An owed row retires by itself when the task's work is on the default
  branch.** The last attempt's sha is an ancestor of `origin/main`, or the
  task's card on `origin/main` (in the configured `cardDir`) reads `status:
  merged`. The check runs at most once per 15 minutes per task, and a check that
  gets no answer leaves the row as it is. The attempt record keeps `retired:
  merged`.
- **`/delegation accept <id> [note]` closes one by hand.** It records
  `accepted` and the note on the task's last attempt, retires its row and
  prints one line; an unknown id prints one line and changes nothing.
- **The block keeps the live rows and counts the rest.** Running workers,
  pending verdicts and owed rows not yet checked or younger than 24 hours print
  in full; the older checked ones become one line, `n older owed rows: <ids>`.
  The 40-line cap holds.

## The card

Each card is one file, `agents/tasks/<ID>-<slug>.md`: YAML frontmatter, then
the spec in markdown. The `card` tool writes cards from a sentence (the next
free id for the domain's prefix, a slug from the title, scope given as globs,
a gate id that exists in `gateMap`, a red test or `none`), and refuses with the
fix when a field is wrong, writing nothing. You can still write one by hand. `<ID>` is `<PREFIX>-<number>[letter]`, for example
`OPS-12`, `BE-101` or `FE-7b`.

    ---
    id: OPS-12
    title: One line that says what done looks like
    domain: ops                 # one of `domains`; the branch is agent/<domain>/<id>
    tier: standard              # economy | standard | frontier | premium, or a model name (haiku | sonnet | opus | fable) as its tier; anything else runs at standard with a warning
    status: queued              # /dispatch takes queued or claimed; template, merged … are refused
    scope: [src/feature/**, docs/feature.md]
    forbid: [src/secrets/**]
    red_test: npm test -- feature.test.ts
    gate: test                  # ids in gateMap, comma-separated
    budget: 2-attempts          # spawns + resumes before it comes back to you
    spend: 4                    # optional: dollars one attempt may spend (else spendByTier; 0 = no ceiling)
    repo: here                  # optional: here = no worktree, the worker shares this checkout (see repo=here); none = no repo at all (see Research cards); an absolute path = another local repo (see Delegating into another repo)
    outdir: /out/hair           # optional: the output folder outside the repo; default the folder of the first absolute scope entry
    scratch: /tmp/hair-scratch  # optional: where the worker puts helper files; default <system temp>/chassis-delegation/<ID>
    resources: [blender-live]   # optional: exclusive resources the worker holds while it runs; a card naming one a running worker holds waits in the queue (see Exclusive resources)
    ---
    ## Why … ## Done when …

Glob rules for `scope` and `forbid`:

- `*` crosses folders;
- `**` is the same as `*`;
- `?` is one character;
- a trailing `/` means everything under the folder.

The dry run (and `/dispatch`) checks each `forbid` glob against the card and prints
one warning line per collision (MOD-29). The card is still written; nothing is refused:

    warning: forbid artifacts/*.html matches scope artifacts/kit/**
    warning: forbid artifacts/*.html matches artifacts/kit/index.html named in done-when

A forbid collides with a scope entry it can name, or with a path-like word of a
`Done when` line (a word with a slash and a dot, in backticks or bare). Each uses the
verifier's rule for its entry: in a repo path `*` crosses folders, so `artifacts/*.html`
covers `artifacts/kit/index.html`, and no repo glob stays in one folder (list the
files); an absolute entry keeps `*` inside one folder. Fix the card (shrink the forbid
or list the files) before you say go.

Two more lines come from the same dry run and the real dispatch (MOD-54); nothing is refused or changed on the card:

    warning: scope names 8 files (and 1 globs); cost tracks the files a card touches: split it
    hint: tier economy would do: 2 files in scope, 3 done-when lines, a red test

The warning fires when the scope holds more than 6 literal entries (an entry with no glob
character); glob entries are counted in the line but never trigger it. The hint fires for
a standard card whose scope (leaving out entries under `tests/` or `test/`) holds at most
2 entries and none is a glob, whose `Done when` holds at most 3 statements, and whose
`red_test` is not `none`. The card tool's dry-run summary carries the same two lines.

An entry may also be an absolute path or glob (MOD-22), and a leading `~` is
the home folder (expanded at dispatch, so the brief header holds the absolute
path). It names a folder outside the repo; the first absolute scope entry is the
card's output folder (see [Research cards](#research-cards)). An absolute entry
is matched the way a `repo=none` brief's always was: `*` stays inside one
folder, `**` spans folders, and `dir/**` is the folder and everything below it.
No spaces in an entry (a path with one reads as prose).

A card whose scope is prose is caught at dispatch (GH-103). `/dispatch` and the
tool write the brief, print its header and the prose scope, and stop before the
worktree and the spawn:

    stopped: the card scope is prose; pass --scope <globs> (or scope on the tool) and dispatch again

Dispatch again with `--scope <globs>` (the tool's `scope`, which must be globs
and replaces the card's scope in the header); the brief written the first time
is reused. `--dry-run` behaves as before.

A `budget` that is not `<n>-attempts`, such as a chassis `frontier-60m`, falls
back to `defaultBudget`, and `/dispatch` says so once:
`warning: budget "frontier-60m" is not <n>-attempts; using the default 3`. A
spawn whose header carries such a budget logs the same line to debug. The
`frontier` part is never taken as the tier: the card's `tier` stays the tier.

## Lessons

A lesson that lives only in the brain's context reaches a worker when the brain remembers
to restate it on each card, and is gone after a compaction or in a new session. The first
adopter's run (issue #65) showed what restating buys: driving the live page after each
merge found bugs the verifier cannot see, and the two cards that restated those lessons as
rules in their Why were consistent on attempt 1 and needed no fixes after merge, the first
time in that run.

So a lesson is a committed file beside the cards, one per domain:
`<cardDir>/lessons/<domain>.md`. Dispatch appends it to every brief in that domain under
`## Lessons (<domain>)`, after the card, as the file stands; the brief tells the worker it
binds like the Rules. The cap is 40 lines: a longer file is cut at 40 with a last line
`(n more lines not carried; prune <path>)`, and the dispatch output warns once. A missing
file adds nothing.

- `/delegation lesson <domain> <text>` appends `- <YYYY-MM-DD> <text>`, creating the folder
  and file; a domain not in the repo's `domains` is refused, naming the list; it prints the
  file's line count and the cap.
- `/delegation lesson <domain>` prints the file.
- The card tool's dry run and dispatch print `lessons: n lines from <path>` when a file
  exists. The file is under the card folder, so it is writable under `delegateOnly`.

## The contracts

**Brief.** `/dispatch` writes `<root>/.delegation/briefs/<ID>.brief.md`. It
starts with one header line:

    [[brief v=1 task=<ID> subtask=main purpose=build tier=<tier> model=<alias> scope=<globs> forbid=<globs> red_test="<cmd>" gate=<ids> spend=<usd> budget=<n>-attempts report=chassis.report.v1]]

A card with an output folder or no repo adds `repo=`, `outdir=<abs>` and
`scratch=<abs>` after the gate and before `spend=` (see [Research cards](#research-cards)),
and a card that names resources adds `resources=<a,b>` after those (see
[Exclusive resources and fan-out](#exclusive-resources-and-fan-out)).

`spend=` is the per-attempt ceiling in dollars (GH-106): the card's `spend:`
when it has one, else the tier's entry in `spendByTier`; `0` writes none. The
body's Rules carry the line "Spend: about $<spend> for this attempt. Do what
the card asks and no more; when you are near it, stop and hand back what you
have with the report line." See Spend ceiling below.

The body comes from `hooks/templates/brief.md`. It tells the worker to:

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
- know its identity: `CHASSIS_SESSION_ID`, `CHASSIS_TASK` and
  `CHASSIS_ATTEMPT` are already set in every Bash call it makes (see "A worker's
  identity"), so it never sets them;
- commit and hold: never push, never open a PR, never commit on main;
- end with the report line.

The repo file's `briefExtra` adds lines for the repo. An existing brief is
reused, never overwritten (and it decides the mode: a reused `repo=here`
brief dispatches with no worktree, whatever the flags say). Two more fields
are optional: `scope_globs=` and `forbid_globs=` replace a prose scope or
forbid. A brief whose `scope=` is prose and that has no `scope_globs=` is not
refused: the verifier marks the scope claim `unchecked` (add `scope_globs=` to
check it), checks every other claim, and the verdict is `unverified` at worst.
Only a brief with no `scope=` at all is refused. Other header fields are optional too:

- `repo=none` marks a task with no git repo; `repo=<abs path>` (MOD-44) names the other local git checkout the task is for, and its worktree is the sibling `<path>-<ID>` (see [Delegating into another repo](#delegating-into-another-repo)); an older `repo=<dir>` with no `<dir>-<ID>` beside it still names the tree to verify. A `repo: none` card dispatches with no worktree, no fetch and no git (see [Research cards](#research-cards));
- `outdir=<abs>` is the card's output folder, outside the repo: the card's `outdir:`, else the folder of its first absolute scope entry. A gate command may name it as `{outdir}`, and a relative `artefacts=` path is read against it. `scratch=<abs>` is where the worker puts helper files (the card's `scratch:`, else `<system temp>/chassis-delegation/<ID>`), never in the repo; the brief template says so. `scratch=` is written whenever there is an `outdir=`, the card is `repo: none` or `repo: here`, or it names a scratch folder, and neither is written for a plain worktree card, so its header is the one it always was;
- `resources=<a,b>` (MOD-23) names the exclusive resources the task holds while its worker runs: free-form words such as `blender-live` (letters, digits, `.` `_` `:` `-`). A spawn of a brief that names a resource another running worker holds is queued, not started (see [Exclusive resources and fan-out](#exclusive-resources-and-fan-out)). Absent, the brief holds nothing and is held up by nothing;
- `repo=here` marks a task worked in the session's own checkout, no worktree (see [repo=here](#repohere-the-main-checkout));
- `base=<ref>` names where the delta starts when the worker commits (GH-10): a branch, `HEAD~2`, a sha. It beats `baseRef` and the `origin/main` chain. A value that is not a git ref (one starting with `-`, or a `a..b` range) makes the brief **refused**. `/dispatch <ID> --base <sha>` (and the tool's `base`) writes it whenever the base is not the default `origin/main`, in worktree mode and repo=here alike (GH-105): a card stacked on an unpushed sibling is cut from that sha and judged on what the worker added to it, not on the sibling's files. The brief's `base=` is the cut point and the diff base, and a dispatch that names a base writes it (MOD-2): against a reused worktree brief it sets or replaces `base=` in the header alone, amend blocks and body untouched, and the reuse line says so (`reused, base= set to <sha>` or `reused, base= replaced <old> → <new>`); a dispatch naming no base against a reused brief that carries one cuts the worktree from it. `--verify <sha>` takes its delta from the same `base=`. The verdict's scope line names the base it diffed from (`every changed path since <base> is within …`);
- `ignore=<globs>` (repo=here only) names paths taken off the delta before scope and files are checked.

A repo=here brief's body comes from the template's `{{#here}}` sections
instead of its `{{#worktree}}` ones. It tells the worker that it shares the
checkout with the brain and maybe other workers, to touch only its scope, not
to commit unless the card says so, and to report `branch=<current>` and
`sha=HEAD` (or the sha it committed). A template of your own without the
sections renders the same in both modes. A repo=none brief keeps the template's
`{{#none}}` sections instead; `{{#repo}}` (the red-test lines) is kept for the
other two modes; `{{#outdir}}` and `{{#scratch}}` are kept when the brief names
the folder, and `{{reportExtra}}` is the report line's `artefacts=` and `metrics=`
placeholders.

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

**Spawn.** `/dispatch` and the dispatch tool spawn no worker (MOD-12, public
issue #22). After the brief, the worktree and the tier, the result ends with the
spawn block, the Agent tool's input as fenced JSON, and one line:

    spawn: Agent
    ```json
    {
      "subagent_type": "<agent type>",
      "model": "<the tier's alias>",
      "description": "<ID> <tier> <alias>",
      "prompt": "Your brief is the file <brief>. Read it whole, then follow it exactly."
    }
    ```
    The worker starts when you make this Agent call: pass the JSON above as its input, verbatim; the mod tiers it, records the attempt and verifies the hand-back.

The brain passes the JSON to its Agent tool as it is. The engine raises the
mod's `agent.spawn` hook for that call as for any spawn, and the hook shapes it:
it finds the brief, keeps the call's model when it is the tier's alias (else the
brief's tier decides, and the debug log says so), runs the worker in the folder
`/dispatch` prepared (the worktree, or the root for repo=here: the Agent tool
takes no folder), takes a worker slot and records the attempt (`kind: spawn`,
`source: brief`). From there the hand-back, the verdict, the ladder and the
ledger are what they always were. Because the brain made the spawn, the engine
runs the mod's other hooks for the worker too: the git guard on its Bash calls,
its turn usage, its hand-back. A subagent a plugin starts with `$.agent.spawn`
is stepped past by that plugin's own hooks, which is why the mod starts only its
debrief and eval runners that way: they need none of the hooks (and, as a last
resort, a ready worktree row the brain never claimed: see **The queue** below).

The hook refuses a spawn with the same one line the dispatch result gives:

- a second spawn of a brief whose attempt still runs:
  `chassis-delegation: BE-101 not spawned — already running as attempt 1 (agent agent-7); wait for its hand-back`;
- a spawn past the budget, or one whose worktree holds finished work (see
  **Look before you respawn** below);
- a spawn while every worker slot is taken:
  `queued: BE-101 — the mod will tell you when a slot frees (2 live: BE-99, BE-100; 1 queued: BE-101)`;
- a spawn of a brief whose `resources=` names one a running worker holds (MOD-23), a free slot or not:
  `queued: BE-101 — waiting for resource blender-live (held by BE-99)`.

**The queue.** The queue is advice. A queued task waits; when a hand-back frees
a slot, the verdict row says `ready: BE-101 — run its spawn block (/dispatch
BE-101 prints it again)` once, and the "Delegation state" section of the brain's
next prompt says it while it holds (a worker that ended with no hand-back frees
its slot there). The brain makes the spawn, which takes the task's queued place
(`started queued BE-101 (waited 4 min)`). A respawn verdict carries the next
spawn block in its advice the same way. While any row is ready or a respawn block
is pending, or a reviewer's spawn block is (MOD-21: `owed: T-4: review`), the
state section carries one posture line: make a ready row's spawn call, a respawn
block's Agent call or a pending review block's Agent call, without asking the
person; ask only when a verdict is refuted on a claim the brain cannot amend, a
worker is over-spend, or an amend needs the person's approval.

A row that waits for a resource (MOD-23) is not ready while a running worker, or a
queued row ahead of it, names the same resource, whatever the free slots: the
state section says what it waits for, `- queued: BE-101 (position 1) — waiting
for resource blender-live (held by BE-99)`, and no posture line comes of it. The
hand-back of the worker that held the resource carries the `ready:` line for the
next row that wanted it, and only that row: a second card for the same resource
stays queued behind the first. A row with no resources is never held up.

When the brain still does not act, `readyFallbackMinutes` (default 10; `0` is off)
is the last resort: a ready row left unclaimed that long is started by the mod
itself, through the same tier, budget and slot decision the brain's spawn takes,
and the attempt is recorded with `source: fallback`. Only a worktree brief is
started this way. A `repo=here` worker shares your checkout and a `repo=none`
brief has no worktree, so those always wait for the brain; past the timeout their
ready line says how long they have waited (`ready: BE-101 — run its spawn block
(/dispatch BE-101 prints it again) — waited 12 min; a repo=here worker shares
your checkout, so the mod never starts it`). A worker the mod starts itself runs
outside the mod's hooks, because the engine steps a plugin's own hooks past any
subagent that plugin starts: no git guard, no effort setting, and its cost known
only when it ends. The row the mod posts says so (`chassis-delegation: BE-101 was
ready for 10 min and the brain had not spawned it; the mod started it itself …`).
A row the brain spawns first, or one still waiting behind a full house, is never
started.

**Waking the brain.** A verdict row used to reach the brain only inside the
person's next message. Now, after the mod posts the row for a background worker's
hand-back, it calls `$.prompt.submit` once with that row and its next action
(`next=accept`, `next=resume agent=…`, the `ready:` line the hand-back freed, or
the respawn spawn block): a turn of the brain's own once the session is idle,
which the model reads as "The chassis-delegation plugin sent a message". It is
never submitted as the person's words (no `asUser`), and while the person is
mid-prompt the engine holds it until idle. One submit per verdict: a verdict the
brain produced itself with `/dispatch <id> --verify` in its own turn, and a
foreground worker's verdict, which rides its Agent result, wake nothing; an
over-spend verdict does wake, so the brain can tell you. `wakeOnVerdict` (default
`true`) turns it off, and the row is posted all the same.

A verdict whose task is already merged does not wake (MOD-35). Before it submits,
the mod asks MOD-4's retire check about a consistent hand-back: the attempt's sha an
ancestor of `origin/main`, the card there reading `status: merged`, or an accept
already recorded. When the answer is yes the row is still posted, no wake is sent,
and the debug log says `wake skipped: <id> already merged` (a `ready:` line the
hand-back freed is still submitted). A refuted, no-report, over-spend or reviewed
verdict is never skipped by this rule.

The same check runs again at delivery (MOD-42). While the brain's own turn is open
the engine could only deliver a wake after it, by which time the brain has usually
read the verdict from the ledger and merged. So a wake raised during that turn is
held in the mod's session state and submitted at the turn's end, as one message,
after re-running the merged check for each consistent verdict; one whose task is
merged or accepted by then is dropped with the debug line
`wake skipped: <id> merged before delivery`. Refuted, over-spend, no-report and
`ready:` wakes are never dropped. A wake raised while the session is idle is submitted
at once. If the session ends before the turn does, nothing is lost: the ledger and the
state section hold every verdict.

**Report.** The worker's hand-back ends with the report line. The mod reads
the last one across the worker's final answer and its SubagentHandback
message; for a background worker it reads that message from the worker's own
transcript:

    [[report v=1 task=<ID> subtask=main branch=<branch> pr=<none|n|url> sha=<sha> gate=pass|fail red=<path|none> files=<a,b> artefacts=<a,b> metrics="k=v,k=v"]]

`red=` names the red test's failing output (GH-20): a file the worker
saved before changing any source, relative to its worktree, such as
`.delegation/<ID>/red-1.txt`. `.delegation/` is gitignored; the verifier reads
the tree, not git. A resume or respawn writes a new file for its attempt. The
field is optional: a brief whose `red_test=` is empty or `none` asks for no
evidence, and the worker may write `red=none`.

`artefacts=` and `metrics=` are optional too (MOD-22). `artefacts=` is a comma
list of the files the worker delivered, relative to the brief's `outdir=` (else
the tree) or absolute; the verifier checks each exists and is not empty (a folder:
has an entry), and the claim fails naming the first that is missing or empty.
`metrics="k=v,k=v"` is numbers or words worth keeping, such as
`metrics="tris=1200,len_s=2.4"`: they are recorded on the attempt (`metrics`) and
shown in the verdict detail as `metrics: tris=1200, len_s=2.4`, and never judged.
Both are absent from the report line of a brief with no output folder.

**Amend.** A worker that had to change a file outside its scope says so on its
own line, just above the report:

    [[amend v=1 scope+=<path> reason=<one line>]]

The mod appends the block to the brief before verifying. It never rewrites
the header. The verifier discloses each block it applied as
`amendment: #n …`.

- **`scope+=` and `forbid+=`** go in on the worker's word.
- **A `scope+=` inside a forbid glob** waits for you too: forbid wins over scope, so to allow a path under a forbid glob you must shrink the forbid with `forbid-=`; `scope+=` alone does nothing. The row says `amend needs approval: scope+=P lies inside forbid Y; scope+= alone does nothing, shrink the forbid`. `/dispatch` warns of the same at render, once per entry: `warning: scope entry X is inside forbid Y and can never be touched; shrink the forbid (forbid-=) to allow it`. The dispatch still proceeds.
- **`scope-=` and `forbid-=`** wait for you. The row says `amend needs approval: …`, and the verdict is the un-amended brief's.
- **A gate failure only a forbidden file can fix** (MOD-55): the brief tells the worker not to touch the file but to hand back gate=fail with `[[amend v=1 forbid-=<the forbid entry that covers it> scope+=<path> reason=<the one-line fix>]]`. The verdict's next step, for a refuted gate or a confirmed gate=fail whose lines hold an `amend needs approval:` line carrying `forbid-=`, is `approve the amend (append it to <brief>), then resume agent=<id> to make the fix; or refuse it` (with no agent left, the same brief respawned at the same tier). It never escalates the tier, and an exhausted budget still stops. `/dispatch` also warns once when a path-like word of `red_test` is outside the scope (`warning: red_test names <path>, which is outside scope`) or inside a forbid (`… which is inside forbid <glob>`); nothing is added to the scope.
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
| `scope` | every path changed between `merge-base(<base>, sha)` and the sha matches a scope glob and no forbid glob. `<base>` is a replay's own base, else the brief's `base=`, else `baseRef`, else the first of `origin/main`, `main`, `origin/master`, `master`. A brief with absolute scope or forbid entries (MOD-22) is also held to the outside delta (see [Research cards](#research-cards)), and a refute names the delta it came from |
| `files` | `files=` equals that changed set exactly. A moved file is listed once, at its new path (git's rename detection; an old path listed too is dropped, not refuted). A path missing from it or invented in it is named. An entry ending in `/` stands for the changed files under that folder; `dir/**` for every changed file under `dir/`, and `dir/*` for those exactly one level under it (MOD-27); a folder entry with none changed is an invented path |
| `gate` | the tree's HEAD is the sha and `git status --porcelain` is empty. Then each gate id runs from `gateMap` in the worktree: exit 0 under `gate=pass` holds, non-zero is failed and shows the last 8 output lines, and `gate=fail` with a red gate holds (an honest stop). A gate red only on timeouts in tests the delta never touched is run once more (see below) |
| `red` | only when the brief's `red_test=` is set (not empty, not `none`). The `red=` file lies in the worker's tree, is not empty, holds a failure marker (`fail`, `error`, `not ok`, `✗`, `exit code 1`-`9`, `exit 1`, `AssertionError`, `expected`; any case), and, if byte-identical (sha-256) to an earlier attempt's red file for the same task and subtask, that attempt's own red claim held (one proof per task: it is held again, `attempt n's proof, reused`). Held shows its size and first failure line: the first marker line with a failing word (`Fail`, `failed`, `not ok`, `✗`, `✕`), else the first marker line whose outcome does not read as passing (a whole-word `pass`, `passed` or `ok`, or a `✓`/`✔` mark, with no failing word), so a passing test named `…Error…` is not quoted (MOD-27). No `red=` or no marker is unchecked; a path outside the tree, a missing or empty file, or an earlier attempt's file that did not itself hold is **failed** |
| `artefacts` | only when the report names `artefacts=` (MOD-22). Each path exists and is not empty (a relative one is read against the brief's `outdir=`, else the tree); the first that is missing or empty fails the claim, named. Unreadable is unchecked. No `artefacts=` is no claim |
| `pr` | `pr=none`, or `gh pr view <n> --json state` finds it |

The gate is left unchecked, never failed, in these cases:

- the tree is dirty, or HEAD is not the sha;
- the gate id is not in the map;
- the gate exits 126 or 127, meaning the environment, not the code.

**A gate that ran beside another worker's (MOD-20).** The engine suite gives
each test 5 seconds, and two suites on one machine at once blow it: tests the
worker never touched time out and a clean branch reads as refuted. So a red gate
whose every failing test failed only with the engine's `timed out after N ms`,
and none of them in a test file the delta changed, is run once more before the
claim is made. When the second run is green the claim says so:

    claim gate: held — gate green on rerun (first run: 2 timeouts in untouched tests) at a1b2c3d (gate=pass confirmed)

When it is red again the attempt is refuted as it always was, the last 8 lines
are the second run's, and a `note:` line says the gate was run twice. A failure
that is not a timeout (an assertion, an error), a timeout in a test file the
delta changed, and any output the mod cannot read as a list of failing tests
(no `(fail)` lines, or a `fail` total that counts more than were read) are never
run again. The rerun reads the output of `claude plugin test` (`(fail) <name>`
under a `<file>:` header, `Error: timed out after 5000 ms` under it).

**Engine gates take turns (MOD-20).** A gate-map command that runs
`claude plugin test <folder>` is an engine gate. The verifiers of one session
run them one at a time: a verifier takes `delegation.engineGate` in the store
before its engine gate and clears it after, and one that finds another's lock
still live waits, looking again every 5 seconds. The lock expires after the gate's own
timeout (9 minutes), so a crash never wedges the rest, and if the store cannot
be read the gate runs without a turn. A rerun stays inside the turn. The wait is
one line of the verdict detail, ahead of the gate claim:

    waited 40 s for MOD-x's engine gate

Other gates (`claude plugin validate`, a node suite) take no turn.

The changed paths are written to `<root>/.delegation/<ID>/files.txt` before
the gate runs. A gate command can take them as `{files}`, and the absolute
path of the tree it runs in (the worktree, or the root for `repo=here`) as
`{worktree}`: `claude plugin validate {worktree}`. A research card's output
folder (MOD-22) is `{outdir}`: `node scripts/check.mjs {outdir}`. Each takes an
absolute path with no `..`, once per word. A command that names `{outdir}` when
the brief has no `outdir=` is "gate not re-run".

The verdict:

| Verdict | When | The row's `next=` |
| --- | --- | --- |
| **refuted** | any claim failed | `resume agent=<id>`, then a respawn |
| **unverified** | no claim failed, but one could not be checked | `resume … — prove: <claims>` while the budget lasts, else `check by hand` |
| **consistent** | every claim held | `accept` |
| **consistent**, `review` on | every claim held, and the `review` option calls for a reviewer | `review`, with the reviewer's spawn block under the row (see [Review](#review)) |
| **refused** | the brief is unusable | `fix the brief` |
| **no-report** | no report line | `resume`, then a respawn at the same tier |

`consistent` means every machine-checkable claim of the report matches git:
the branch, the sha, the files, the scope, the gate and the red evidence all
held. It is not a review. Nothing in the check reads the diff, so a worker that
cleanly builds the wrong thing gets the same row as one that builds the right
thing, and the brain still reads the diff before it accepts (or, with the
`review` option on, a reviewer reads it first: see [Review](#review)). A report that
declares `gate=fail` honestly is never accepted, whatever else holds: its row
reads `consistent (report gate=fail)` and `next=` resumes the worker.

**Deprecated: `verified`.** Up to 0.7.0 this verdict was called `verified`. The
mod stopped writing that word at 0.8.0 (the verdict row, the `verdict=` line,
the attempt records, the ledger lines, the dashboard, the state block and the
debrief all say `consistent`). One read-only normaliser reads a stored attempt
record, verdict line or metrics count that still carries the old word as
`consistent` (MOD-49), so it escalates, retires, accepts and counts as a
success exactly as a consistent one does. A ledger line already written keeps
its word, because the file is append-only. A script that parses the row text,
`verdict=` or `.delegation/ledger.jsonl` should accept both words.

`repo=none` changes the check (and the row says `(no repo)`). The verifier
then checks only these things:

- every `files=` path exists;
- every path lies in scope and outside forbid;
- the gate exits 0;
- and, for a brief with an output folder (MOD-22), the outside delta and the
  `artefacts=` (see [Research cards](#research-cards)); the metrics are shown.

That gate is a map id, or a bare allowlisted command such as
`claude plugin validate <folder>`.

**Cardless hand-backs.** An ad hoc spawn (the Agent tool with no header and
no brief file) that hands back a `[[report …]]` line is verified too, for what
git can say without a brief. The tree is the spawn's cwd, else the session
root. `branch`, `sha`, `files` and `pr` are checked as above; `scope`, `gate`
and `red` are unchecked, with this reason:

    no brief: no scope=/gate=/red_test= to check against

So a cardless verdict is refuted (a sha off the branch, a files= that invents
a path) or unverified, never consistent. No gate runs and no files.txt is
written. The row is posted like any other, the attempt is recorded under the
report's `task=` (or `adhoc-<key>` when it names none) with `adhoc: true`, and
the ledger line is written. No budget ladder applies: `next=` says `accept`
for consistent, `check the diff` otherwise, and never resume or respawn. A
cardless attempt never counts toward a later dispatch of that task: the
budget and the escalation ladder read only attempts that had a brief. An ad
hoc spawn that hands back no report is judged as before: `no-report` in the
foreground, nothing in the background.

**A worker stopped by a usage limit (MOD-56).** The engine's `turn.complete` event
carries no error text (only `reason`), so the mod reads the hand-back text, and only
when it holds no `[[report]]` block (a worker writing rate-limit code is never taken
for a stopped one). Any of `hit your weekly limit`, `usage limit`, `rate limit`, `too many requests`, or a `429` beside http, status, error or api (never a bare `429`: a sha, a line number or a count),
in any case, marks the stop. The attempt record and its ledger row then carry
`stop: rate_limited` (and `resetsAt` when the text names a reset time), and the
verdict row reads `no-report (rate limited[, resets <time>])`. `next=` is what a
no-report always had: `verify sha=<sha>` when finished work is in the worktree. While
the last worker of the session stopped this way, a freed slot does not announce a
queued task ready; the row reads

    held: <task> queued; the last worker stopped on a usage limit at HH:MM[, resets <time>]; dispatch it when the limit resets

and the mod's own ready fallback starts nothing. The hold clears on the next spawn the
brain makes.

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
- **`ignore=`** is the config's `ignore` (default `.delegation/**`) plus the card folder (`<cardDir>/**`, GH-111, so a new card is never in the worker's delta) plus the
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
  it gets a verdict; force past it, or judge it. **A shared resource is not
  overlap** (MOD-24): a card whose `resources` name one that an in-flight
  repo=here card's brief names is not refused. Overlapping paths corrupt each
  other's dirty-tree delta, which is why a scope overlap refuses; a shared resource
  only needs sequencing, which the queue does. The card is dispatched, and while a
  worker that holds the resource still runs it is queued with the waiting line
  (`queued: BE-101 — waiting for resource blender-live (held by GH-19)`, see
  [Exclusive resources](#exclusive-resources-and-fan-out)) and made ready when that
  worker hands back. No `--force-overlap` is needed for it. A scope overlap
  refuses exactly as above, with or without a shared resource, and still needs
  `--force-overlap`.
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
SendMessage the worker the claim lines. A later one advises a respawn with the
same brief. After a refuted report, or a `gate=fail` the verifier confirmed
(the verdict is consistent), that is `next=respawn at <next tier>`, one tier up.
After a no-report it is `next=respawn at <same tier>`: a missing report line
is a reporting defect, not a reason to pay for a bigger model, so a no-report
never moves the tier up (a respawn after an attempt that was already
escalated keeps that attempt's tier, and the debug line says it was picked by
the last attempt's tier). A refute whose first failed claim is `scope`,
`files`, `branch` or `pr` holds the tier too: it says the brief's globs (or the
base) were wrong, not that the worker was out of its depth. Only a refute on
`sha`, `gate` or `red` (or a record from before the mod kept `firstFailed`)
earns the next tier. A scope refute advises
`next=resume agent=<id> — amend: [[amend v=1 scope+=<path> reason=…]]` with the
first out-of-scope path filled in (for a path from the outside delta, `remove <path>, or amend: …`); a files refute advises listing the paths in
`files=` (or reverting the extras); a later respawn says
`(held: a scope refute)` or `(held: a files refute)`. A respawn verdict carries
the next spawn block under its row (the tier the spawn hook will pick); the
brain makes it, and with `autoEscalate` on as well: `autoEscalate` performs a
resume itself (a message to the worker), never a spawn. The budget counts spawns,
resumes and verify attempts per task. Past it the next spawn is denied.

Resuming after accept: the brain may also resume a worker whose last attempt was judged
consistent (or unverified), with a `SendMessage` of its own, when reading the diff shows
a problem the claims could not. When that worker hands back a report at a different sha,
the mod records the next attempt (kind resume, same lineage, counted against `budget=`)
and judges it like an advised resume's: the verdict row posts and the ledger gains its
row. A hand-back at the same sha is the `--verify` re-judge and changes nothing. Past
`budget=` it is still judged, and the row says the budget is spent.

Unverified is actionable too. While the budget lasts, an unverified verdict
advises a resume naming each unchecked claim and its reason (cut to 160
characters):
`next=resume agent=<id> — prove: gate (tree not at sha: 1 uncommitted path …), red (…)`.
That resume counts against the budget like a failing verdict's, and
`autoEscalate` performs it, sending the unchecked claim lines. Past the budget,
or with no agent id, the advice stays `check by hand — unverified is not a pass`.

**Look before you respawn.** Before a respawn (the brain's spawn of the same
brief, from a spawn block or by hand, and a dispatch preparing one) and before
it advises or performs a resume, the mod reads the worker's worktree with allowlisted git reads only: `rev-parse HEAD`,
`status --porcelain` and `log --format=%H <base>..HEAD` (`<base>` as the
verifier takes it). Work is present when HEAD has commits ahead of the base,
the tree is clean, and the verifier has not judged that sha yet. Then nothing
is spawned or resumed, the attempt is recorded as `work-present` (kind
`verify`, the head as its `sha`), and the row says:

    chassis-delegation: T-4 attempt 1/3 no-report · sonnet · $0.41 · next=verify sha=<sha>
    work present at abcdef1 on agent/frontend/T-4: verify it (next=verify sha=<sha>)

A respawn by hand is refused with the same line. A repo=here or repo=none
task, and a worker with no worktree of its own, are not looked at. A refuted
attempt whose HEAD is still the sha it reported is not new work, so its resume
or respawn goes ahead as before.

**`/dispatch <ID> --verify <sha>`** (the tool's `verify`) judges that work with no
spawn. It reads the task's existing brief and runs the verifier in the task's
worktree (the root for repo=here) at the sha, with a synthetic report:

    [[report v=1 task=T-4 subtask=main branch=agent/frontend/T-4 pr=none sha=<sha> gate=pass files=<the delta>]]

`files=` is the delta `merge-base(<base>, sha)..sha`; `gate=pass` means the
gate is re-run, so a red one refutes; `red=` names the newest
`.delegation/<ID>/red-<n>.txt` in the tree when the brief has a red test. The
verdict lands in one of two places. When the sha is the one the last attempt
record already names (a hand-back the brain is re-judging, say after amending
the brief), it re-judges that attempt: the same attempt number, no new record,
no budget spent, the first line `re-judging attempt n/b at <sha>`, and the
attempt's verdict and advice replaced. Otherwise it lands on the work-present
attempt, or on a new `verify` attempt. The advice follows as for any hand-back:
`accept`, or a resume of the worker that did the work. `--verify` takes no other option, and it is refused while
a worker of the task is still running.

**The git guard (Bash).** It covers the write verbs `commit`, `merge`,
`cherry-pick`, `rebase` and `push`. A command that runs one on a branch in
`guardBranches` is denied:

    chassis-delegation: no <verb> on <branch>; branch first (git checkout -b agent/<domain>/<id>)

A worker the mod recorded (matched by the `agentId` its tool calls carry) is
held to the same rules, and its refusal names its task:
`chassis-delegation: no push on main (T-7); branch first (...)`. A `repo=here`
worker on `main` is refused a commit or a push like the brain; a worktree
worker on its own `agent/<domain>/<id>` branch is untouched.

To find the branch, the guard reads `git rev-parse --abbrev-ref HEAD` in the
command's folder. It follows `cd` and `-C`, and a `checkout -b` earlier in the
same command. A push that names a guarded branch (`git push origin main`,
`HEAD:main`, `--all`) is denied from any branch. On a guarded branch, a push
is a push of that branch only when it has no refspecs, or one is `HEAD`, the
branch's name, `<branch>:<x>`, `--all` or `--mirror`; tag pushes
(`git push origin v1.2.3`, `--tags`) and deletes or pushes of other branches
(`git push origin --delete agent/mod/GH-21`) pass. The guard reads command
words, not text, so a heredoc body that mentions `git commit` never triggers
it. It sees every worker as well as the brain: a worker is the brain's own Agent
call (MOD-12), so the engine runs the mod's `tool.call` hook for the worker's
Bash calls, and a repo=here worker on `main` cannot commit there.

### Delegating into another repo

A brain rooted in one repo is sometimes asked to build something in a sibling: the first version of a
new project, with its own `origin/main`, its own gates (`npm run build`, `npm test`) and no
`.chassis-delegation.json`. Give `repo` as the absolute path of that git checkout (the folder holding
`.git`; `~` is expanded) on the `card` tool, on the `dispatch` tool (`repo`) or on `/dispatch`
(`--repo <path>`), or write `repo: /path/to/checkout` in a card. For that task every place the mod
touches a repo uses that path instead of the session root:

- **The card** is written to that repo's card folder when it has a `.chassis-delegation.json` (its
  `cardDir`), else under this session's own `.delegation/cards/<repo folder name>/`, so another
  project's work never lands on this project's board. Ids stay unique across both boards. The tool
  remembers the repo for the id, so `dispatch` with the id alone finds the card.
- **The base and the worktree.** `git -C <path> fetch -q origin main`, then the worktree is cut from
  that repo's `origin/main` beside it: `<path>-<ID>` on `agent/<domain>/<ID>`. The brief header carries
  `repo=<path>`; the brief itself, the ledger row and the verdict row stay with the session.
- **The verifier, the scope delta, the red file and the gate** run in that worktree, against that
  repo's `origin/main`. The attempt record's `root` (MOD-37) is that repo. The merged check that retires
  an owed row asks that repo's `origin/main`.
- **Its config.** The repo's own `.chassis-delegation.json` supplies the gate map, domains, `cardDir`
  and spend when it exists. When it does not, the gate is the repo's own detected gate, the one
  `/delegation setup` would write (`package.json` `scripts.test`, else pytest, cargo or go test), as the
  gate id `test`; the card tool's `gate` may also be one command written out (`"npm run build"`: words
  only, no comma, under the gate rules). The dry run prints
  `repo: <path> (config: its own | none, gate: <cmd>)`, and the worker's brief names the command.
- **The allowlist** accepts the same git forms with `-C` equal to the task's repo path, for a task that
  names it and for no other (`worktree add` only for that task id, that path, that repo's domains). The
  git guard refuses a worker's commit or push on that repo's `main` or `master` exactly as for the
  session root.
- **The scheduler, the dashboard and `/delegation`** show the repo folder name beside such a task:
  `T-1 [notes-app]`.

Refused in one line, naming why: a path that is not absolute (`repo ../notes-app is not an absolute
path`), the session's own repo (leave `repo` unset), a folder with no `.git`, and a path with characters
a git argument should not carry. `worktree`, `here` and `none` are unchanged. Not supported:
`--replay` for another repo.

**Setting the other repo up first (MOD-45).** `/delegation setup <path>` and `/delegation init <path>`, and
the `setup` and `init` tools with `path`, run their checks and their scaffold against that checkout
instead of the session root, and write nothing in the session root: the card folder README, its
`.chassis-delegation.json` with the detected gate, and the `.delegation/` line in its `.gitignore`,
through the mod's own write path (so `delegateOnly` is not involved). Never overwriting a file, as
at the root. The path is absolute (`~` expanded) and holds a `.git`; anything else is refused in one
line. Setup's handover for a path ends with `Next: call the card tool with repo set to <path>`, so
the next card goes into that repo. With no path both commands are unchanged.

An example, with the session rooted in `/Users/you/api-server` and a new sibling `/Users/you/notes-app`:

    You: build the first version of notes-app next door: an add and a list command.
    Claude calls card { repo: "/Users/you/notes-app", title: "notes add and notes list work",
                        scope: ["src/**", "tests/**"], redTest: "npm test", ... }
      wrote /Users/you/api-server/.delegation/cards/notes-app/OPS-1-notes-add-and-notes-list.md
      repo: /Users/you/notes-app (config: none, gate: npm test)
    You: go.   Claude calls dispatch { task: "OPS-1" }
      3. worktree /Users/you/notes-app-OPS-1 on agent/ops/OPS-1 from origin/main

### Research cards

Some lanes do not change code. They extract a model from a running app, render
images, record a sound, write notes: the outputs land in a folder outside the
repo, the work often needs the live checkout and its running app, and there is
no test to turn green and nothing to commit. Run as ad hoc spawns, those lanes
made claims nobody could check (a report said a glTF validator passed when none
was installed; another claimed byte-identical output nobody had run, and left
scratch files inside the repo). A research card is an ordinary card with four
changes, and it goes through the same dispatch, hand-back and verdict:

1. **`repo: none` or `repo: here`.** The `card` tool takes `repo` (`worktree`,
   the default; `here`; `none`) and writes it on the card; `/dispatch` reads it
   from the card exactly as it reads `--here`. `here` shares the session's
   checkout (the live app is there); `none` is no repo at all: no worktree, no
   fetch, no git, the worker runs in the session folder. The tool's description
   says when: research or extraction with outputs outside the repo, repo none or
   here, scope = the output folder.
2. **Scope names the output folder.** `scope` and `forbid` may hold absolute
   paths and globs (`~` is the home folder). The first absolute scope entry is the
   card's `outdir` unless the card names `outdir:` itself, and the header gains
   `outdir=<abs>` and `scratch=<abs>`. The brief tells the worker to put
   deliverables in the output folder and every helper file in the scratch folder,
   never in the repo.
3. **The verifier lists the folders before and after.** At dispatch the mod
   lists (relative path, size, modification time) every absolute scope and forbid
   *root*, the folder of each absolute entry, and stores the listings
   (`delegation.outside.<ID>`). At hand-back it lists them again. The scope claim
   covers both deltas: every git path against the repo entries, and every
   *changed* outside path (added, removed, or a different size or time) against the
   absolute entries: inside a scope entry and outside every forbid entry. A
   refute names the delta it came from:

       claim scope: failed — out-of-scope path: /out/notes/scratch.txt (outside delta)
       claim scope: failed — out-of-scope path: scratch.py (repo delta)

   A root that does not exist yet lists as empty. A root that exists but cannot be
   read, or holds more than 10000 files, leaves the claim **unchecked**, never held;
   so does a root nobody listed at dispatch while others were (a root an amend
   added). A brief with no listing at all (one that never went through `/dispatch`)
   is checked as it always was, plus `note: outside delta not checked: …`. The mod can only see
   the folders the card names, so name what you want watched: a `forbid` entry such
   as `~/exports/avatar/**` is listed too, and a change under it fails the claim.
4. **The gate runs against the folder, and the report can say what it made.** A
   gate-map command may carry `{outdir}`, filled with the brief's `outdir=` at
   verify time; the allowlist accepts it word for word with only `{outdir}` and
   `{worktree}` filled. The report gains `artefacts=` and `metrics=` (see **Report**
   under [The contracts](#the-contracts)): the `artefacts` claim fails naming the
   first path that is missing or empty, and the metrics are recorded and shown,
   never judged.

A `repo: none` card's gate runs in the output folder (the folder of its first
scope entry), so name a gate script by an absolute path or put it on `PATH`; a
`repo: here` gate runs in the checkout, so a path relative to the repo works.

`repo: none` and `repo: here` cards go through the same claims; the git ones
(branch, sha, files, red, pr) apply only to `here`, and a `none` card keeps the
`repo=none` check (`files=` exist and are in scope, the gate exits 0) with the
new claims added. A `none` card's report reads `branch=none sha=none red=none
files=none`.

**Worked example: a hair lane.** The lane exports the hair model from the running
app, renders two turntable views and checks its own output. The repo has a script,
`scripts/check-hair.mjs <folder>`, that fails when `hair.gltf` does not validate
(and when no validator is installed), and exports twice to compare hashes. The
gate map names it, so the claim "validator passed" and the claim "byte-identical"
are both re-run by the verifier rather than taken from the report.

`.chassis-delegation.json`:

    { "gateMap": { "hair-check": "node scripts/check-hair.mjs {outdir}" } }

The card (the `card` tool writes this from `repo: "here"`, `scope: ["~/exports/hair/**"]`
and `forbid: ["~/exports/avatar/**"]`, with the next free id):

    ---
    id: OPS-40
    title: Export the hair model and two turntable renders from the running app
    domain: ops
    tier: standard
    status: queued
    repo: here
    scope: [~/exports/hair/**]
    forbid: [~/exports/avatar/**]
    red_test: none
    gate: hair-check
    budget: 2-attempts
    ---
    ## Why

    The hair model is rebuilt by hand each time. Export it from the running app
    into the output folder, with front and side renders, and say what you measured.

    ## Done when

    - `hair.gltf`, `front.png` and `side.png` are in the output folder and not empty
    - `scripts/check-hair.mjs` passes on the folder (it validates the glTF and exports twice to compare)
    - nothing else changed: no scratch files in the repo, none under `~/exports/avatar/`

The brief header `/dispatch` writes (home folder `/home/ana`):

    [[brief v=1 task=OPS-40 subtask=main purpose=build tier=standard model=sonnet scope=/home/ana/exports/hair/** forbid=/home/ana/exports/avatar/** red_test="none" gate=hair-check repo=here ignore=.delegation/**,agents/tasks/** outdir=/home/ana/exports/hair scratch=/tmp/chassis-delegation/OPS-40 spend=10 budget=2-attempts report=chassis.report.v1]]

The worker's last line, then the verdict:

    [[report v=1 task=OPS-40 subtask=main branch=main pr=none sha=HEAD gate=pass red=none files=none artefacts=hair.gltf,front.png,side.png metrics="tris=18400,export_s=3.1"]]

    chassis-delegation: verdict=consistent task=OPS-40 attempt=1/2 …
    claim scope: held — every changed path is within scope=[/home/ana/exports/hair/**], forbid=[/home/ana/exports/avatar/**] untouched; outside delta: 3 changed paths under /home/ana/exports/hair, /home/ana/exports/avatar, every one within scope and none in forbid
    claim files: held — files= matches the dirty-tree delta exactly
    claim artefacts: held — 3 artefacts exist and are not empty: hair.gltf (212004 bytes), front.png (88120 bytes), side.png (87904 bytes)
    claim gate: held — gate green in the shared checkout … (gate=pass confirmed; …)
    metrics: tris=18400, export_s=3.1

Had the worker left `scratch.json` in the repo, the scope claim would have failed
on the repo delta; had it written into `~/exports/avatar/`, on the outside delta;
had it named a render it never made, the artefacts claim would have failed naming
it; and had the check script failed, the gate claim would have said so, whatever
the report said.

### Exclusive resources and fan-out

Two research lanes could not run at once because there was one live Blender with
one open file. Until MOD-23 that was a line the brain wrote into every brief and
hoped was followed. A card can now name the resources it holds, and the queue
enforces them; and the `card` tool can write several lanes from one sentence.

**Resources.** A card may carry `resources: [blender-live]` (a list of free-form
words: letters, digits, `.` `_` `:` `-`; the name means nothing to the mod beyond
"the same word is the same thing"). The brief header carries them as
`resources=blender-live` after `outdir=` and `scratch=`, before `spend=`. A card with no resources writes
the header it always did and is held up by nothing.

- A worker holds its card's resources from its spawn until it hands back (or its
  run ends with no hand-back).
- A dispatch, or the brain's own Agent call, for a card whose resource is held by
  a running or starting worker is **queued**, whether or not a slot is free, with
  `queued: OPS-9 — waiting for resource blender-live (held by OPS-8)`. The dispatch
  result prints no spawn block and the hook starts nothing; a second ask keeps its
  place (`…; already queued since 14:02 (position 1)`).
- **The hand-back that frees the resource carries the `ready:` line for it**
  (`ready: OPS-9 — run its spawn block (/dispatch OPS-9 prints it again)`), in the
  same wake as the verdict row. Of several queued cards that name one resource only
  the first is ready; the others wait for it in turn, and a card with no resources
  or others is ready in its place. A row that waits for a resource takes no worker
  slot, and the "Delegation state" section names what it waits for.
- The worktree table of the dashboard and its text fallback show the resource a
  worker holds and the one a queued row waits for (see [Dashboard](#dashboard)).
- For `repo: here` cards a shared resource **queues, it does not refuse** (MOD-24):
  the overlap check that guards the shared checkout
  (see [repo=here](#repohere-the-main-checkout)) refuses a scope overlap, which would
  corrupt each other's dirty-tree delta, but two cards with disjoint scopes that name
  one resource are both dispatched and the second waits as above. The pane's open
  item for a queued card that waits for a resource reads
  `OPS-9: queued (position 1) — waits for blender-live (held by OPS-8)` instead of
  `… — starts when a worker slot frees`; a card waiting for a slot reads as before.

**Fan-out.** Research usually fans out: two or three workers at once, each owning
an output folder, all wanting the same shared notes file. The `card` tool takes
`lanes: [{ title, scope, doneWhen? }]` beside the shared fields (`title` and
`doneWhen` as the umbrella, `why`, `gate`, `tier`, `repo`, `redTest`, `budget`,
`spend`, `resources`, `forbid`). It writes **one card per lane**, all or none:
sequential ids (`OPS-41`, `OPS-42`), the shared why, gate, tier, repo, resources
and forbid, and each lane its own title, scope (so its own output folder: the first
absolute entry) and `doneWhen` (the shared list when the lane has none). A shared
`scope` beside lanes is refused. Two lanes whose scopes overlap are refused, naming
both:

    card refused: lanes overlap: lane 1 "Extract the hair model" scope /out/avatar/** overlaps lane 2 "Extract the eye model" scope /out/avatar/eyes/**; give each lane its own output folder

The dry run prints every lane's summary and brief header, then says go for all of
them (`Say go and Claude dispatches OPS-41, OPS-42.`); with `dispatch: true` it
dispatches each lane in order, one spawn block per lane under `--- OPS-41 ---`,
and the queue keeps lanes that hold one resource from running together.

**Worked example: two extraction lanes, one notes file.** The avatar is built in a
running Blender; the person wants the hair and the eye model extracted, and both
lanes would like to append to `/out/notes/avatar.md`. That file is the brain's to
merge afterwards, so it is the shared `forbid`: neither lane may touch it, and the
outside delta fails a lane that does. The brain calls the tool once:

    {
      "title": "Extract the avatar parts",
      "why": "The avatar is built in the running Blender; the hair and the eyes are extracted as separate models.",
      "doneWhen": ["each part is a glTF in its lane folder and not empty"],
      "repo": "none",
      "redTest": "none",
      "gate": "hair-check",
      "resources": ["blender-live"],
      "forbid": ["/out/notes/avatar.md"],
      "lanes": [
        { "title": "Extract the hair model", "scope": ["/out/hair/**"] },
        { "title": "Extract the eye model", "scope": ["/out/eyes/**"], "doneWhen": ["eyes.gltf and a render are in the lane folder"] }
      ]
    }

It writes `OPS-41` and `OPS-42`, which differ in title, scope and done-when and
agree on everything else:

    id: OPS-41
    title: Extract the hair model
    …
    repo: none
    scope: [/out/hair/**]
    forbid: [/out/notes/avatar.md]
    resources: [blender-live]

and prints their two headers:

    [[brief v=1 task=OPS-41 … scope=/out/hair/** forbid=/out/notes/avatar.md red_test="none" gate=hair-check repo=none outdir=/out/hair scratch=/tmp/chassis-delegation/OPS-41 resources=blender-live spend=10 budget=2-attempts report=chassis.report.v1]]
    [[brief v=1 task=OPS-42 … scope=/out/eyes/** forbid=/out/notes/avatar.md red_test="none" gate=hair-check repo=none outdir=/out/eyes scratch=/tmp/chassis-delegation/OPS-42 resources=blender-live spend=10 budget=2-attempts report=chassis.report.v1]]

When the person says go, the brain dispatches both and makes both Agent calls.
`OPS-41` starts; the second call is refused, though a worker slot is free:

    queued: OPS-42 — waiting for resource blender-live (held by OPS-41)

`OPS-41` hands back, and its verdict row ends with
`ready: OPS-42 — run its spawn block (/dispatch OPS-42 prints it again)`; the brain
makes the call and `OPS-42` runs with the Blender to itself. Had the lanes needed
no shared app, the card would carry no `resources` and both would run at once, each
in its own folder, still sharing the forbid on the notes file.

## Review

`consistent` says the report matches git. It does not say the work is right:
nothing in that check reads the diff. With the `review` option on, a consistent
verdict is followed by one more agent that does (MOD-21; the second half of
public issue #1). It changed the outcome on roughly one hand-back in three for
the two adopters who first built it by hand.

| `review` | What gets a reviewer |
| --- | --- |
| `off` (default) | nothing: every row, record and ledger line is as it was |
| `on` | every consistent verdict |
| `on-frontier` | a consistent verdict of a frontier or premium attempt only |

Set it in the repo file (`"review": "on"`) or in `/config`; `/config` wins,
and `off` there means "not set here", so the repo file speaks.

**What it checks.** A fresh agent reads the brief, the worker's report and
hand-back, and the diff at the report's sha. It writes one row per factual
claim of the hand-back (what was built, what the tests and the gate show, what
was left alone), each labelled `confirmed`, `refuted` or `unverifiable` and
naming the command it ran or the file and line that decides it, and ends with a
count block:

    confirmed: a/x.ts gains the parser — a/x.ts:12
    refuted: the gate passes — ran npx prettier --check a/x.ts, exit 1
    unverifiable: CI is green — no network from here
    [[review v=1 task=T-4 confirmed=1 refuted=1 unverifiable=1]]

The prompt comes from `hooks/templates/review.md`. The report's own fields
(branch, sha, files, scope, gate, red) were matched against git already; the
reviewer is asked to spend itself on what they cannot say.

**How it runs.** The reviewer is one more Agent call, and the brain makes every
spawn (MOD-12), so the verdict row asks for it the way a respawn does: the row
says `next=review` and ends with a spawn block.

    chassis-delegation: T-4 attempt 1/3 consistent · sonnet · $0.41 · next=review
    spawn: Agent
    ```json
    { "subagent_type": "general-purpose", "model": "haiku", "description": "T-4 review economy haiku", "prompt": "[[review-of v=1 task=T-4 subtask=main attempt=1 worker=<agent> sha=<sha>]]\n…" }
    ```
    The reviewer starts when you make this Agent call: pass the JSON above as its input, verbatim. …

The first line of the prompt is a marker; it is how the spawn hook knows a
spawn is a reviewer's, whatever else the prompt names. The hook records the
reviewer as an attempt of `kind: review` (`source: review`) in the task's
records, and runs it in the worktree the worker used. A reviewer is on no
ladder:

- it never counts against `budget=`, and takes no worker slot (`maxWorkers`),
  and the next worker attempt is numbered as if it had not run;
- it is not a worker on the dashboard; while it runs its task is `pending
  verdict`, and the review is no longer owed;
- it steps at the engine's default effort and keeps the Bash environment it
  inherits (it has no attempt identity).

**What it never does.** It edits nothing. While it runs, the `tool.call` hook
refuses its Edit, Write, MultiEdit and NotebookEdit calls, and any Bash command
the `delegateOnly` lexer counts as a write (a redirection, `tee`, `sed -i`, the
destination of `cp` or `mv`, a `git commit`), read against the worktree it works
in and against the session root. The refusal is one line:

    chassis-delegation: a reviewer never edits (T-4 review): Write refused. Label each claim confirmed, refuted or unverifiable, naming the command or file:line that decides it, and hand back.

That lexer is an accident tripwire, not a sandbox, and the template tells the
reviewer the same rules. The reviewer does not re-run the gate, does not change
the worker's verdict, and does not fix what it finds: it labels, and the worker
fixes.

**At its hand-back** the mod reads the last well-formed `[[review]]` block:

| The block | The row's `next=` | The row says |
| --- | --- | --- |
| `refuted=0` | `accept` | `review: 3 confirmed, 1 unverifiable` |
| `refuted>0` | `resume agent=<the worker>` (while the budget lasts; else `check by hand`) | `review: 3 confirmed, 1 refuted, 0 unverifiable`, and each refuted row quoted under it |
| missing, malformed, or for another task | `accept` | `review: no review block` |

A review never blocks on its own failure: a reviewer that dies, or hands back
without a block, is `next=accept` with the note. With a refuted row the worker is
owed a resume: the brain sends it the refuted rows (`SendMessage`), or, with
`autoEscalate` on, the mod does; that message is the worker's next attempt and
spends `budget=` like any resume. The worker's new hand-back is checked, and if
it is consistent it is reviewed again. The one-line row for a review reads

    chassis-delegation: T-4 attempt 1/3 reviewed · haiku · $0.05 · review: 3 confirmed, 1 unverifiable · next=accept

and the long form (`verdictVerbosity: full`) is
`chassis-delegation: review task=T-4 attempt=1/3 confirmed=3 refuted=0 unverifiable=1 usd=… model=… next=accept`.
The reviewer's attempt keeps the counts (`review: {confirmed, refuted,
unverifiable}`, verdict `reviewed`), and so does its ledger line.

**The reviewer's tier.** One tier below the worker's: a standard worker is
reviewed by a haiku, a frontier worker by a sonnet, a premium worker by an opus
(economy is the floor, so an economy worker is reviewed by a haiku too). The
`tierMap` turns the tier into an alias as for any spawn, and fable is never
spawned. `reviewTier` (repo file or `/config`) pins the tier instead: `"reviewTier":
"frontier"` reviews every hand-back on an opus.

**Cost.** One more agent per reviewed hand-back. The reviewer reads the
hand-back (quoted in its prompt, cut at 6000 characters), the brief and the diff,
and runs a few read-only commands; one tier below the worker keeps it a fraction
of the worker's own cost, and `on-frontier` spends on the cards where a missed
error costs most. Its cost is on its row and ledger line and in the session
total; the dashboard's "workers" dollars count worker attempts only. A refuted
row costs a resume of the worker and, once it hands back again, another review.

**Not reviewed.** A hand-back that is not consistent (refuted, unverified,
`gate=fail`, no-report); a `repo=none` brief (there is no diff); a `--replay`
run; and a cardless hand-back. `/dispatch <ID> --verify <sha>` is reviewed like
a hand-back when its verdict is consistent. A reviewer is a model: `confirmed`
is its reading of the diff, not a proof, and a claim about CI or the runtime is
usually `unverifiable`.

## Configuration

Three layers, in order of precedence:

    built-in defaults  <  <repo>/.chassis-delegation.json  <  /config (user settings)

Settings win. Maps (`gateMap`, `agentTypes`, `tierMap`, `spendByTier`) merge key by key;
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
| `gateMap` | object | JSON string | `{}` | gate id → command, run by argv with no shell. `{files}` is files.txt, `{worktree}` the tree the gate runs in, `{outdir}` a research card's output folder; chain with ` && `. A command the allowlist would refuse is dropped at load and named. No `sf`, `git`, `gh`, network, `rm` or publish. An id not in the map is "gate not re-run" (unverified) |
| `agentTypes` | object | JSON string | `{}` | card domain → subagent type. A domain not named runs on a subagent type of the same name if the session offers one, else `general-purpose` |
| `tierMap` | object | JSON string | `{economy: haiku, standard: sonnet, frontier: opus}` | tier → alias. `fable` is never spawned; it becomes opus, and when a brief, the caller or the map asks for fable the notice says so (`tier=frontier → opus (fable requested; fable is never spawned by the mod)`) and the attempt record keeps `requestedAlias: fable` |
| `domains` | array | comma string | `frontend, backend, ops, dispatcher, cross, shared` | the domains a card may name |
| `spendByTier` | object | JSON string | `{economy: 3, standard: 10, frontier: 25}` | dollars one attempt may spend, per tier (GH-106); `0` means no ceiling; merges per tier; `/dispatch` writes the tier's entry as `spend=` unless the card has its own `spend:` |
| `effortByTier` | object | JSON string | `{economy: low, standard: medium, frontier: high}` | how hard a worker thinks at each step (MOD-13): `low`, `medium`, `high`, `xhigh` or `max`; `0` or empty leaves the engine's default; a card's own `effort:` wins; merges per tier |
| `maxWorkers` | number | number (0 = unset) | `2` | briefed workers at once; the next one waits in a queue, and the mod says `ready:` when a slot frees |
| `worktreeRoot` | string | string | `""` (siblings: `<root>-<id>`) | worktrees go to `<worktreeRoot>/<repo name>-<id>` |
| `cardDir` | string | string | `agents/tasks` | the folder the task cards live in, relative to the repo root (no leading `/`, no `..`); `/dispatch` and the dispatch tool read cards from it. `init` writes `docs/cards` in a plugin repo. `--replay` stays on `agents/tasks/` |
| `briefTemplate` | string | string | `hooks/templates/brief.md` | the brief body template file |
| `briefExtra` | string | string | `""` | repo-specific lines added to every brief |
| `evalCommand` | string | string | `""` | what the T1 eval runner runs; no command means no eval |
| `evalLiveCommand` | string | string | `""` | what the T2 (live, paid) runner runs |
| `autoEval` | boolean | boolean | `false` | run `evalCommand` once per new `origin/main` sha while idle (needs `evalCommand`) |
| `baseRef` | string | string | `""` (the chain: `origin/main`, `main`, `origin/master`, `master`) | where the delta starts when a brief names no `base=`. Used as given (`main`, `develop`, `HEAD~2`); a repo=here dispatch writes it into the brief as `base=`, and pins `HEAD` to its sha |
| `ignore` | array | comma string | `[".delegation/**"]` | globs always taken off a repo=here delta (the card folder is always added to them); `[]` in the repo file ignores nothing |
| `issueRepo` | `owner/name` | string | the mod's own repository (the manifest's `repository`) | the repo `/delegation debrief post` files the mod findings in; `""` in the repo file = posting is off (see [Posting the findings](#posting-the-findings)) |
| `delegateOnly` | `off` \| `warn` \| `deny` | string (`off` = unset) | `off` | keeps an opus or fable brain from doing worker work itself (GH-113; see [The brain's spend](#the-brains-spend)) |
| `review` | `off` \| `on` \| `on-frontier` | string (`off` = unset) | `off` | a fresh read-only reviewer reads each consistent hand-back against the diff before `next=accept` (MOD-21; see [Review](#review)). `on-frontier` reviews frontier and premium cards only; `off` changes nothing anywhere |
| `reviewTier` | `economy` \| `standard` \| `frontier` \| `premium` | string | `""` (one tier below the worker's) | the tier the reviewer runs at; empty = one below the worker's, never below economy (see [Review](#review)) |

Settings only (`/config`, or `pluginConfigs["chassis-delegation"].options` in `settings.json`):

| Key | Default | What it does |
| --- | --- | --- |
| `autoEscalate` | `false` | perform the resume instead of advising it; a respawn is always advice (its verdict carries the spawn block) |
| `wakeOnVerdict` | `true` | after a verdict row, submit it with its next action as a turn of the brain's own, never as your words (MOD-15; see **Waking the brain** under the contracts) |
| `postFindings` | `ask` | `ask` asks once after a debrief whether to post its new mod findings (nothing without a yes); `auto` posts them at once, scrubbed, at most 5 a debrief, and only with `redact` set; `off` neither asks nor posts. `/config` only, never the repo file (MOD-31; see [Posting the findings](#posting-the-findings)) |
| `readyFallbackMinutes` | `10` | minutes a `ready:` worktree row may wait for the brain before the mod starts it itself, recorded with `source: fallback` and running outside the mod's hooks; `repo=here` and `repo=none` rows always wait; `0` = off (MOD-15; see **The queue**) |
| `applyAmends` | `true` | append `scope+=` / `forbid+=` blocks to the brief before verifying |
| `defaultBudget` | `3` | attempts when the brief names no budget: spawn, resume, respawn |
| `verdictVerbosity` | `line` | `line`: one row; `full`: the row plus every claim line; `silent`: a toast only |
| `briefDir` | `""` | where briefs go; empty means `<root>/.delegation/briefs/`, and Claude Code's session scratchpad only when the root is not writable |
| `ledgerFile` | `true` | append one JSON line per judged attempt to `<root>/.delegation/ledger.jsonl` |
| `gitGuard` | `true` | the git guard on Bash |
| `classifierSecondOpinion` | `true` | the card tool's dry run asks the classifier and prints its tier beside the card's; the answer is kept on the card's first attempt record as `classifierTier` |
| `dashboardBand` | `true` | the band above the prompt while a worker is live, queued or owed a verdict (see [Dashboard](#dashboard)) |
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
| `redact` | `""` | comma-separated words the debrief findings scrub replaces with `<redacted>` (see [The debrief now](#the-debrief-now)); `/config` only |

**The debrief.** When `~/.claude/commands/debrief.md` exists, the mod runs it.
Otherwise it runs the built-in `hooks/templates/debrief.md`. That template writes
`<root>/.delegation/debriefs/YYYY-MM-DD-<slug>.json` and adds one line to
`<root>/.delegation/ledger.md`. The friction signal also has two sources:

- **With a breadcrumb file** (`~/.claude/harness/breadcrumbs/<session>.jsonl`),
  it counts the lines past the file's `.done` watermark.
- **Without one**, it counts what the mod saw since the last debrief:
  - a prompt whose first word is no, stop, don't or actually;
  - a prompt with first-person disagreement or an explicit verdict anywhere (`i don't agree`,
    `i disagree`, `that's not right`, `you're wrong`), MOD-39;
  - a challenge question ending in `?` (`shouldn't it …?`, `isn't it supposed …?`,
    `wasn't it supposed …?`, `aren't we/you supposed …?`) or a message ending in `bug?`, MOD-39;
  - a false-report verdict (`reported on something false`, `seems wrong/off/silly`,
    `looks wrong`), MOD-39;
  - a denied tool call;
  - a refuted verdict.

### The debrief now

`/delegation debrief` starts the same background debrief the clean stop starts,
now. It skips the idle, cooldown and minimum-friction tests, keeps one debrief at
a time (a second call while one runs says so in one line and names its agent),
and runs even while a worker is running, saying so in one line and in the
prompt. It prints the agent id, the mode (`breadcrumbs` or `events`) and the
folder the file will land in. The automatic path and the `last debrief:` line
of `/delegation` are unchanged.

**What the prompt carries (MOD-26).** The facts the mod saw go in the prompt one
to a line, each with the kind and its ISO time, `denial 2026-10-10T16:27:14Z:
Bash: git push` (or `correction`, `refuted`, `verdict`), and the prompt tells the
agent to cite that time as `at`. In breadcrumbs mode the prompt carries only the
friction events and verdict rows whose time lies between the first and last
timestamps of the window's breadcrumb lines, inclusive; nothing from before the
window gets in, so a short window cannot be flagged for evidence from hours
earlier. A window whose lines are only `session_start`, `session_end` and
compaction breadcrumbs, with no fact inside it, spawns nothing: `/delegation
debrief` prints `nothing to debrief in lines a-b (session boundaries only)`, the
automatic path logs the same, and the debrief record moves past the window (as
`skippedTo`; the mod still never writes the `.done` mark) so the next debrief
starts after it. Without a breadcrumb file the selection is as it was, the events
past the last debrief and the verdicts since it, now dated.

**Watermark and false refutes (MOD-32).** The `debrief check:` line prints after the
agent has handed back, so the agent never sees it. When the check prints clean, the mod
sends the debrief agent one message, the way `autoEscalate` resumes a worker: `debrief
check: clean. Mark your watermark now, as your instructions say, and stop.` It does so
under your own skill and under the built-in template alike (the template says the same
rule). A flagged or stripped check sends nothing and the printed result says the `.done`
watermark was left as is. The mod still never writes `.done` itself. A verdict fact for
a refute that `/dispatch --verify` later re-judged at the same sha and found consistent
is one line, `verdict <time>: MOD-17 attempt 1/2 refuted on gate, then re-judged
consistent at the same sha (a false refute)`, and the later row is not listed again; a
refute that stood is listed as before. Both prompts tell the agent a false refute is a
`went_wrong` for the verifier or the gate, never a `went_well`.

Both prompts (your `~/.claude/commands/debrief.md`, which is never edited, and
the built-in template) ask for one more top-level key in the debrief JSON,
`mod_findings`: an array of `{ kind: went_well | went_wrong, surface,
fault_class: bug | design | docs | cost | performance, severity: P1 | P2 | P3,
title, body, evidence: [strings] }` about chassis-delegation itself, not the
project, grounded in the facts the prompt gives; empty when there is nothing to
say. When the agent hands back, the mod reads the JSON, scrubs every string of
`mod_findings` and writes `<same folder>/<same name>.findings.json`, holding `{
debrief, modVersion, scrubbed: true, findings }`. It prints one line per finding,
`[1] went_wrong · P2 · <surface> · <title>`, then `drafts: <path>`; with nothing
to say it prints `no findings`. Posting them is a separate step, and two.

The debrief JSON holds three kinds of list, each for one reader, and the mod
keeps them apart (MOD-18):

| list | for | what the mod does with it |
|---|---|---|
| `mod_findings` | the mod's tracker, after your go | scrubbed, written to the `.findings.json`, filed by `/delegation debrief post` |
| `host_findings` | no one public | set aside in the `.findings.json`, counted on the findings lines, never listed or filed |
| the agent's own proposals: `proposed_harness_changes`, `harness_gaps`, `stale_memory` | you | printed after the findings lines, never written to the `.findings.json`, never posted |

The proposals block reads `proposals: n for you to review (never posted)`, then
one line per `proposed_harness_changes` entry, `<target> · <proposed_diff_summary>`
cut to one line, then `harness_gaps: n · stale_memory: n` for the two lists it
only counts. A debrief with none of them prints nothing. `/delegation debrief
post` shows the same block under the findings, read from the debrief the
`.findings.json` was cut from. Whether to change `CLAUDE.md`, a memory file or
a card is yours to decide; the mod only puts the proposals in front of you.

`/delegation debrief apply` turns a proposal into an action you approve (MOD-33):

- `apply` lists the latest debrief's proposals, numbered, each as `[n] <target> ·
  <summary on one line> · open`, or `done: <note> (<date>)` / `dismissed: <reason>
  (<date>)`; none prints `no proposals in <debrief path>`.
- `apply <n>` prints proposal n in full (target, rationale, proposed diff) and one
  instruction for the brain. For `CLAUDE.md`, a memory file, a command or an agent file:
  draft the edit as a diff, show it, apply it only on your yes, then mark it done. For a
  mod surface or code in this repo: write a card with the card tool, show the dry run,
  dispatch on go, then mark it done naming the card id. For `other`: show it and ask.
- `apply <n> done [note]` and `apply <n> dismiss [reason]` record `{ n, status, note, at }`
  in a `proposals_status` array of the `.findings.json` beside the debrief. The next
  debrief's prompt then carries `already done: <summary>` / `dismissed: <summary>`, so the
  agent does not propose the same change again, and the delegation-state section carries
  `n debrief proposals open — /delegation debrief apply` while the latest debrief has open ones.

The mod never writes your `CLAUDE.md`, memory, commands or agents (they live in `~/.claude`,
outside the repo); the brain makes the edit, with your yes. The only thing the mod writes
here is its own record, `proposals_status`.

The scrub (`redact` in `hooks/lib/redact.ts`) turns every `/Users/<name>/…` or
`/home/<name>/…` prefix into `<home>/…`; the session root's folder name and its
origin URL (both `owner/name` and the full URL) into `<repo>`; the git
`user.name` and `user.email` into `<person>`; and every word of the `redact`
list into `<redacted>`, whole words in any case. The origin and the git user are
read from `.git/config` and `~/.gitconfig`.

The `redact` list is a `/config` option and nothing else. It is never read from
`.chassis-delegation.json`: that file is committed, and often public, so a list
of the names you do not want public would publish them. Put the product,
customer, employer and repo names there once, in your own settings.

### What bounds a debrief

In breadcrumbs mode a debrief is held to four rules (MOD-10):

1. **A window.** Both prompts name the lines `(watermark, end]` of the breadcrumb
   file with their first and last timestamps, say to read only transcript entries
   inside it and to take the work summary from assistant and user turns, never
   from tool error text, and ask each `corrections`, `tool_denials` and `outcomes`
   entry for an `at` (a breadcrumb line or a timestamp).
2. **A check at hand-back.** Before the findings file is written, the mod strips
   an entry whose `at` is outside the window, keeps and counts one with none, and
   flags a `corrections` or `tool_denials` list the window's breadcrumbs cannot
   contain. It prints one line each, then `debrief check: clean` or the counts.
   A correction whose `at` is a timestamp inside the window is looked up in the session
   transcript file (`~/.claude/projects/<root with non-alphanumerics as dashes>/<session id>.jsonl`,
   read with the mod's own file read): when its quoted text (surrounding quotes stripped,
   whitespace, case and apostrophes folded, at least 12 characters) sits in a user message
   within two minutes of `at`, the entry is marked `source: transcript` and no longer
   counts toward the flag (MOD-38). If the file cannot be read, the engine's session
   messages call gives user rows without times; the quote alone is matched, the entry is
   marked `source: transcript-untimed` and the check line says so. When that was the only
   flag, the line reads `debrief check: clean (n corrections evidenced by the transcript,
   none in the breadcrumbs)`, the record moves and the
   watermark message is sent. `tool_denials` still need the breadcrumbs.
3. **A record that moves only when clean.** The debrief record (`lastAt`,
   watermark, lines) moves only when nothing was stripped or flagged; otherwise
   the previous record stands and the next debrief covers the window again. The
   mod never writes the `.done` watermark file; the skill does, and the built-in
   template says to do it only after the check line reads clean.
4. **Mod findings only.** `mod_findings[].surface` is one of `card`, `dispatch`,
   `brief`, `verifier`, `gate`, `dashboard`, `debrief`, `update`, `accept`,
   `config`, `allowlist`, `scheduler`. A finding on any other surface, or whose
   text names the host's permission classifier, a host safety check, the engine
   or your own hooks, goes to `host_findings` in the `.findings.json`.
   `/delegation debrief post` never lists or files those and says how many it set aside.

### Posting the findings

`issueRepo` defaults to the mod's own repository, read from the `repository` (or
else `homepage`) field of the mod's `.claude-plugin/plugin.json` as `owner/name`,
so a finding about the mod can be posted from any repo the mod runs in, with no
setting. `/delegation` prints `issues: <owner/name> (the mod's own tracker)` for
the default and `issues: <owner/name>` when the repo file names one. Set
`issueRepo` (`owner/name`) in `.chassis-delegation.json` to post somewhere else;
an explicit `"issueRepo": ""` turns posting off (leaving the key out does not).
Posting is two steps on purpose:

1. `/delegation debrief post` reads the latest `.findings.json` under
   `<root>/.delegation/debriefs/` and prints every finding in full, scrubbed
   again, as it would be posted: the title (`[went well]` first for a went_well
   one), a body whose first line is `**Surface:** … · **Fault class:** … ·
   **Severity:** …`, the text, an Evidence list and a footer `posted by
   chassis-delegation <version> via /delegation debrief`. Each is numbered with
   a status, `new` or `covered by #<k>` (an issue in the repo, read with `gh
   issue list --state all --limit 200`, shares the surface and at least three
   title words). This form posts nothing.
2. `/delegation debrief post 1,3` (or `all`) posts the named findings whose
   status is `new`, one `gh issue create` each, prints `#<n> <url>` and records
   the number in the `.findings.json`, so a later post skips it. A covered
   finding is skipped with its `#k` unless you name it, and then it is added to
   that issue as a comment. Every body is scrubbed once more at post time, and
   the post is refused, naming the finding, if any word of the `redact` list
   survives.

**The redact list must be set first.** The automatic scrub only knows the repo's
folder name, its origin and the git identity; a product name that differs from
the folder name would pass straight into a public issue. So while the `redact`
option in `/config` is empty, `/delegation debrief post <n|all>` files nothing
and says: `set redact in /config to the product, customer, employer and repo
names this session must never publish, then post again`. The read-only
`/delegation debrief post` still shows the drafts, with the same warning on its
first line.

**When the post happens: `postFindings` (MOD-31).** A `/config` option, `ask`
(the default), `auto` or `off`. It is yours and never the repo file's: posting
runs `gh` as you, under your own GitHub account, and the repo file is shared by
every contributor, so `.chassis-delegation.json` is never read for it.
`/delegation` prints `post findings: <mode> → <issueRepo>` beside the issues
line.

- **ask.** When a debrief hands back with at least one new mod finding (not
  covered by an existing issue), the output ends with one question line, `post n
  findings to <issueRepo>? say yes to post them all, scrubbed, or name some
  (/delegation debrief post 1,3); nothing is posted without a yes`. The
  delegation-state section tells the brain to ask you that once and never to
  post without an explicit yes in your own words; with `wakeOnVerdict` on the
  question also reaches the brain as the plugin's message. Host findings and the
  agent's proposals are never in the question. The answer is no until you say
  yes.
- **auto.** Right after the scrub the mod posts every new mod finding by the same
  path as `/delegation debrief post all` (the second scrub, the survive check,
  the dedupe) and prints `#n <url>` for each. At most 5 per debrief; the rest
  stay drafts and the output says how many. A covered finding is skipped, never
  commented on. While the `redact` list is empty auto posts nothing, prints the
  set-redact line and falls back to the ask question. Set it only when you trust
  the scrub and the `redact` list.
- **off.** No question and no posting. The drafts are still written and listed.

Why two steps: the public tracker already carries product, repo, employer and
home-path names that sessions typed from memory. Nothing leaves the machine
unseen, and the allowlist grows by exactly the forms the second step needs,
all tied to the one configured repo (see below).

## The host-command allowlist

`$.process.run` runs with no permission prompt. So every argv the mod would
run passes `hooks/lib/allow.ts` first, and a refused argv never runs; the log
says `chassis-delegation: refused argv [...] (<reason>)`. The list, verbatim:

    git [-C <dir>] diff|merge-base|rev-parse|status|log …   (no --output, --ext-diff, --textconv;
                                        repo=here reads status --porcelain=v1 --untracked-files=all -z
                                        and rev-parse --abbrev-ref HEAD through this line; the look
                                        before a respawn reads rev-parse HEAD, status --porcelain and
                                        log --format=%H <base>..HEAD through it)
    git [-C <dir>] worktree list [--porcelain|-v|--verbose|-z]
    git [-C <dir>] fetch [-q] origin main                    (exact)
    git -C <plugin root> merge --ff-only origin/main         (exact; <plugin root> is the loaded folder only; /delegation update)
    git -C <root> worktree add -q -b agent/<domain>/<id>[-replay] <worktree> <origin/main|7-40 hex sha>
                                        (<domain>: the configured domains, by default
                                         frontend|backend|ops|dispatcher|cross|shared;
                                         <worktree>: <root>-<id>[-replay], or
                                         <worktreeRoot>/<repo name>-<id>[-replay];
                                         the literal -replay suffix on both or neither)
    git -C <task repo> worktree add -q -b agent/<domain>/<id> <task repo>-<id> <origin/main|7-40 hex sha>
                                        (MOD-44: <task repo> is the absolute path task <id> names as its repo;
                                         <domain>: that repo's own domains; with the session root known, no other -C passes)
    git -C <root> ls-tree --name-only <sha> agents/tasks/    (exact; /dispatch --replay)
    git -C <root> show <sha>:agents/tasks/<id>-<name>.md     (exact; /dispatch --replay)
    gh pr list|view …                                        (no --web)
    gh issue create|comment|list, for the configured issueRepo only (MOD-7; the body file under <root>/.delegation/debriefs/)
    claude plugin validate|test <absolute folder>            (exact; a no-repo brief's gate)
    a gate-map command, word for word, `{files}`, `{worktree}` and `{outdir}` filled by absolute paths

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
place of `{files}`, `{worktree}` and `{outdir}`: a command the allowlist would refuse at
verify time (say `claude plugin validate .`, which is not an absolute folder)
is dropped from the map then, and named in the toast and log with its reason,
so it is not found a gate run later.

The mod never runs your eval, your tests or a deploy itself. The eval runner
and the debrief are ordinary subagents, under the session's own permissions.

## The brain's spend

The workers' cost is priced per attempt (above). The brain's own turns are
priced too, and shown apart, so you can see how much of a bill was the brain
reading, editing and running tests itself.

**The split.** Every main-loop `turn.complete` (no `agentId`) with a `usage`
adds to one record: tokens, dollars by the model each turn reported, the turn
count and the brain's edits. The record is kept in the store under the
conversation's start time (a resume keeps it; `/clear` starts a new one), with
`$.state` as its view, so a resume or a reload of the mod does not drop the
turns before it. The brain's share is its dollars over the session total (brain
plus workers when the session total is unknown).

**What the dollars are.** API list prices from the mod's own table (checked
2026-10-06 against the claude-api skill's pricing table), priced per message
from the usage each turn reports, never from a transcript. Per million tokens:
Opus 5.5 $4 in / $20 out, cache reads $0.20; Sonnet 5.5 $2 / $10, cache reads
$0.20; Fable 5.1 and Mythos 5.1 $10 / $50, cache reads $0.25; every other model
reads the cache at 0.1x its input price. Cache writes cost 1.25x input, or 2x for
the part the usage reports as `ephemeral_1h_input_tokens` (Claude Code writes
1-hour entries); a usage without that split is priced at 1.25x. What the figures
leave out: Haiku 5.5's long-prompt tier ($0.50 / $2.50 for a prompt past 100K
tokens; usage arrives summed per turn, so the tier cannot be applied and a long
Haiku 5.5 run reads as a floor), fast mode's premium, and any discount or credit
on your account. A turn delivered to the hook twice (same turn id, same counts)
is counted once.

**The brain makes the spawn (MOD-12).** Every worker starts from the brain's
own Agent call: the one a dispatch result's spawn block names, or a ready
queued task's, or a respawn verdict's. That call is part of the brain's turn and
its tokens are the brain's; everything the worker does is the worker's, priced
from the worker's own `turn.complete` usage (keyed by its agent id), so nothing
is counted twice. The mod spends no turn of its own to start a worker.

**Where it shows.**

- `/delegation` adds
  `brain: fable $2.25 over 2 turns · workers $0.75 (3 attempts) · brain share 75%`
  and, once the brain has edited, `brain edits: n`. The figures are this session's
  only: an attempt record carries the id of the session that made it, and one from
  another session (or, in an old store, another root) is not counted. Once an Agent
  spawn with no brief header has run, the line also reads
  `· ad hoc $1.00 (1 agents)` (from that agent's own cost record), and
  `· unattributed $0.50` when the session total exceeds brain, workers and ad hoc
  by a cent or more; the share is the brain over the session total.
- The dashboard's tile row (pane, hover card) gains a tile
  `brain $2.25 / workers $0.75`; spend by model gains a row labelled `brain`
  for the brain's model, so Fable's spend is never mistaken for a worker's. The
  text fallback prints `Spend split: …` and the same `brain · fable · …` row.

**`delegateOnly`** (`off`, `warn`, `deny`; default `off`; `/config` or the repo
file). It applies to the main loop only (a worker's tool calls reach the mod's
hooks but are never touched by it), and only while the session model is opus or fable; a Sonnet or Haiku
brain is never restricted. Under it the brain's own edits are:

- **allowed** when the path is under the card folder (`cardDir`), `.delegation/`,
  `.chassis-delegation.json`, `CHANGELOG.md` or a `docs/` folder;
- otherwise, with `warn`, run, and the mod posts one row per turn:
  `chassis-delegation: the brain edited <path> itself; a card would have delegated it (delegateOnly=warn)`;
- otherwise, with `deny`, refused: `chassis-delegation: delegateOnly is on: the
  brain does not edit source. Describe the task and call the card tool, or set
  delegateOnly off.`

**What counts as a brain edit.** A call to `Edit`, `Write`, `MultiEdit` or
`NotebookEdit` on a path under the repo root, and a `Bash` command that writes
a path under the root: a `>` or `>>` redirection, `tee`, `sed -i`, `cp` or
`mv` into the root, or a `git commit` that takes a path (see below). Reading the words is a tripwire, not a
sandbox (`bash -c "…"` and `eval` are not looked into). Every brain edit,
allowed or not, counts in `brain edits: n`, whatever the mode. Paths outside
the root (the scratchpad, `~/.claude`) are no edit.
A write target is resolved before it is judged: a leading `~` or `~/` and
`$HOME` / `${HOME}` become the home folder, `$PWD` / `${PWD}` become the repo
root, and `$NAME` / `${NAME}` assigned a literal value earlier in the same
command (or as a prefix assignment of the same command) becomes that value. A
target that still holds `$`, a backtick or `$(` after that (an unset variable, a
command substitution, `~` with no known home) is unknown and is not counted as a
write in the repo.

`cd` is followed (MOD-9). A relative target resolves against the folder the last
`cd` (or `pushd`) in the same command left, the repo root to begin with, so
`cd <worktree> && rm -rf .claude-plugin/types` is a write in the worktree, not in
the repo. `cd` alone or `cd ~` goes home; a `cd` inside `( )` is undone at the
closing parenthesis; a `cd` in a pipeline or run in the background moves nothing
after it. A `cd` whose folder cannot be resolved (a variable never set, a command
substitution) makes every later relative write in the command unknown, and
unknown writes are not counted. `git -C <dir>` moves only its own command. A
`git commit` is judged by where it runs and what it takes: in a repo outside the
root it is no edit; in the root the staged paths (plus the changed files for `-a`
and the pathspecs on the command) are read with read-only `git diff` and each is
judged like a written path, so a commit of only card, `.delegation/`, repo-file,
`CHANGELOG.md` or `docs/` files runs and one that includes a source path is
warned or denied naming it. `sed -i ''` and `sed -i .bak` take the suffix word
as the suffix, not as a file.

Quotes inside a command substitution are quoted (MOD-20). A `$( )` or backtick
substitution inside double quotes is read as a command of its own, with its own
quotes, so `gh issue close 2 --comment "$(printf "id <task>-a<n>")"` writes
nothing: the `>` in the id is text. A real redirect inside one still counts,
quoted or not: `echo "$(echo x > hooks/a.ts)"` writes `hooks/a.ts`. The text of a
`git commit -m "$(cat <<'EOF' … EOF)"` is read to its end.

**Posture.** While the session model is fable and `delegateOnly` is not `off`,
the "Delegation state" section of the system prompt starts with two lines: "You
are the brain on a premium model. Build work goes to workers through the card
tool; you read the repo to write cards, verify hand-backs, and read diffs. Do
not edit source or run the test suite yourself." The section keeps its
40-line cap.

## What the brain keeps and what it hands off

`/delegation` shows `brain calls:` the brain's own main-loop calls this session by kind (run or poll, read,
edit, spawn) and its average context per call (input plus cache-read tokens over calls). Past a context of
`driveWarnTokens` (default 200K; `driveWarn: false` turns the row off) the mod adds one row a turn when the
brain runs the same command a third time or polls a job, with the dollars one call costs at that context.
`freshSessionTokens` (default 400K; `0` turns it off) sets the context at which the brain's own turn end adds one
row, once a session, telling it to start a fresh session at the next phase boundary: the cards, the ledger and the
lessons are on disk, so a new session reads them for far less than the grown one re-reads itself each turn.

The worked example is one long Game-Decompiler session on an Opus 5.5 brain with a median context of
490-650K tokens. Of its 3,705 main-loop calls, 1,653 drove an emulator lab (builds, boots, bench runs,
`until grep` polls, filming, reading bench CSVs) and cost $258 of the main loop's $605 at list prices; 71%
of that was cache reads of the whole context on every poll. The same calls at an 80K context cost $99 on
Opus and $63 on Sonnet 5.5: the small context cuts about 60%, Sonnet's price a further third. The 61 ad hoc
research agents it spawned cost $286, 39 of them on Opus because no model was set: set the model on
research spawns as well as on cards.

- **The brain keeps** choosing what to build and the numbers that make it right, writing the brief (the
  goal, the numbers, the check to pass, what to hand back: the diff, measured results, images) and
  reviewing the hand-back (the diff, the bench lines, stills or a video).
- **A worker hands back** the build, run, poll and read-the-logs loop from a fresh, small context: edit,
  hot-load, bench and read the CSV, disc builds and boots, filming, and the docs that record the result.
  A standard card is a Sonnet worker; `resources: ["lab"]` keeps one worker on a one-client app, so lab
  workers run one at a time.
- **What stays with the brain anyway:** a repo whose gate is unit tests cannot tell whether a move works in
  the game, so the brain still reads the bench results and looks at the stills. A worktree is cut from
  main, so the brief names the branch tip.

## Spend ceiling

An attempt has a ceiling in dollars: `spend=` in the brief header (above).
The brief tells the worker its ceiling, and that line is the part that limits
spend while a worker runs.

**What the mod can see, and when.** The engine does not show a plugin the
steps or tool calls of a subagent the plugin spawned itself
(`$.agent.spawn`): its `turn.step` and `tool.call` hooks are skipped for that
worker (public issue #22). Since MOD-12 no worker is such a subagent: `/dispatch`,
the dispatch tool, a queued task and a respawn all hand the brain the Agent call
to make, so every worker is the brain's own spawn and the mod's hooks see it,
its tool calls (the git guard) and its turns. The spend checks below read the
worker's cost from its `turn.complete` events, and act on the worker's next
tool call; its steps are given an effort (see "Effort by tier").

What the mod does with each worker's own cost (the cost formula below):

- **At the ceiling.** When a run ends with the worker's own spend past
  `spend=` and no report line, the mod sends it one message through
  `$.session.send` (the path a resume uses, but it is not a resume and does not
  count against the budget):
  `chassis-delegation: you have spent about $2.20 of a $2 ceiling; wrap up now and hand back with the report line`.
  Once per attempt. The worker carries on, so that turn's end is not judged.
  The mod also posts one row to the conversation, naming the task and the
  dollars: `chassis-delegation: T-6 spend $2.20 reached its $2 ceiling; the worker was told to wrap up and hand back`.
- **At twice the ceiling.** The attempt's verdict is `over-spend`, and the mod
  posts:

      chassis-delegation: T-6 attempt 1/3 over-spend · $4.20 of $2 · next=check the worktree (work may be present: /dispatch T-6 --verify <sha>)

  `over-spend` is not a failing verdict: it never escalates the tier, and the
  mod does not resume or respawn on it. If the engine hands the mod the id of
  the worker's running turn (`turn.start` carrying the subagent's `agentId`),
  the mod also ends that turn with `$.turn.abort`. The engine's `turn.start`
  carries no `agentId` today, so that is rarely possible; what stops the worker
  is its next tool call, which the mod denies with one line (MOD-13):

      chassis-delegation: T-6 is over twice its $2 ceiling; hand back now with what you have (SubagentHandback)

  Only `SubagentHandback` is let through. A hand-back after that is today's
  `over-spend`: the end-of-run accounting stays the source of the recorded `usd`.
- **A hand-back wins.** A turn whose answer carries the report line is left to
  the verifier, whatever it cost.
- **On the status line.** The status line and the queued-spawn refusal name
  each live worker with its cost so far: `(2 live: BE-310 $3.10, BE-314
  $1.20)`. That figure moves when a turn of the worker ends (a resumed worker
  shows its earlier runs).

## Effort by tier

The mod rewrites each of a worker's `turn.step` requests to an effort by the
card's tier: `effortByTier`, built in as economy `low`, standard `medium`,
frontier `high` (premium reads the frontier's). A card's own `effort:` (one of
`low` ... `max`; `0` keeps the engine's) wins; `/dispatch` writes it to the store
for the task. An entry of `0` or empty leaves the engine's default. The brain's
own steps and an ad hoc agent's are never touched. The effort used is recorded
on the attempt (`effort`), and `/delegation` prints
`effort: economy low · standard medium · frontier high`.

## A worker's identity

A worker inherits the brain's session id. A lock keyed on role plus session id
(a vendored lock script, public issue #24) then gave two sibling workers on
one shared environment the same identity, and one could release the other's
live hold. Telling every worker in `briefExtra` to prefix its lock calls by hand
failed silently the first time a worker forgot. Since the mod sees every
worker's Bash calls (MOD-12), it now sets the identity itself: the `tool.call`
hook runs a recorded worker's Bash command behind an export,

    export CHASSIS_SESSION_ID=BE-101-a2 CHASSIS_TASK=BE-101 CHASSIS_ATTEMPT=2; <the command as typed>

| Variable | Value |
| --- | --- |
| `CHASSIS_SESSION_ID` | `<task>-a<attempt>`; for a subtask other than `main`, `<task>.<subtask>-a<attempt>` (`BE-101.ui-a1`) |
| `CHASSIS_TASK` | the task id (`BE-101`) |
| `CHASSIS_ATTEMPT` | the attempt number (`2`) |

- **Per attempt.** The attempt is the one the worker is on, counted per task and
  subtask across spawns and resumes, so a resume moves it on and two siblings,
  or two attempts of one task, never share an id.
- **Every command of a line.** It is an `export`, so `a && b` and a script the
  command starts all see the variables. The values are shell-quoted.
- **What is never rewritten.** The brain's own Bash; an ad hoc agent and any
  agent with no attempt record; the debrief and eval runners (the mod's own
  subagents, whose calls its hooks do not see); a worker the mod started itself
  after `readyFallbackMinutes` (MOD-15), which runs outside the hooks and keeps
  the inherited id; and a command that already assigns `CHASSIS_SESSION_ID`
  (`CHASSIS_SESSION_ID=x cmd`, `export CHASSIS_SESSION_ID=x`, `env
  CHASSIS_SESSION_ID=x cmd`), which is left as typed. A command that only reads
  it is rewritten.
- **Nothing else changes.** The git guard, `delegateOnly` and the spend check
  judge the command as the worker typed it, and the rewrite is the last link
  before the engine's tool, so no refusal text or decision moves.
- **No option.** The brief tells the worker its identity and that it is already
  set. A `briefExtra` line asking workers to prefix their lock calls by hand is
  no longer needed; one a worker follows is left as typed.

## The cost formula

Each worker's own cost is summed from the `usage` of its `turn.complete`
events (keyed by the event's `agentId`, reset when a resume starts a new
attempt), priced by the model the usage names (else the model the spawn
resolved), with the built-in table in `hooks/lib/cost.ts`:

    usd = (in·P_in + out·P_out + cacheRead·P_in·0.1 + cacheWrite·P_in·1.25) / 1e6

Prices are dollars per million tokens, from a small table: opus-5-5 4/20,
opus-5 5/25, fable-5-1 10/50, fable-5 10/50, sonnet-5-5 2/10, sonnet-5 3/15,
haiku-5-5 0.10/0.50, haiku-4-5 1/5. Haiku 5.5 bills 0.50/2.50 for a request whose prompt passes 100K tokens;
usage arrives summed over a worker's run, so that rate cannot be applied, and
for a long Haiku 5.5 run the figure is a floor. The verdict row's
`usd`, the attempt record's `usd` and the ledger's `usd` are that number, kept
to 4 places in the store and shown to 2.

When no usage was reported (or a model is not in the table), the row falls
back to the session's cost growth over the attempt, `$.session.usage().cost.usd`
at the verdict minus at the spawn (or resume), shown with a `~`
(`usd=~2.91`, `~$2.91`; the attempt record has `usdApprox: true`). That delta
includes whatever the main loop and the other workers spent at the same time,
so it is approximate.

## Without the engine: two settings.json hooks

The mod is a function-hook plugin, so where the engine's rollout switch serves
off, or a host cannot load a hooks module, none of it runs. The two parts most
worth carrying are pure functions: the native verifier (the report and brief
grammar, the gate rules) and the git guard. `bin/chassis-hook.mjs` exposes
them through ordinary `settings.json` command hooks, with no engine behind
them. It needs only a `node` on PATH that strips types by itself, **node 22.18
or newer**, where that is on by default; nothing is installed or fetched. On an
older node it prints that to stderr and exits 1, a hook error that blocks
nothing.

Merge this into the `"hooks"` block of `~/.claude/settings.json` (every
project) or `.claude/settings.json` (one repo), with `<this folder>` the
absolute path of your clone. `tests/selfcheck.sh` prints it with the path
filled in when it finds the rollout switch off.

    {
      "hooks": {
        "PostToolUse": [
          { "matcher": "Agent|Task", "hooks": [ { "type": "command", "command": "node \"<this folder>/bin/chassis-hook.mjs\" post-agent", "timeout": 600 } ] }
        ],
        "PreToolUse": [
          { "matcher": "Bash", "hooks": [ { "type": "command", "command": "node \"<this folder>/bin/chassis-hook.mjs\" pre-bash" } ] }
        ]
      }
    }

Use it where the mod does not load. With the mod loaded as well you would get
two verdict rows and two guards for one worker.

- **`post-agent`** (PostToolUse on the Agent tool) reads the hook input on
  stdin and takes the last `[[report …]]` of the result. With none it prints
  nothing and exits 0. Otherwise it finds the brief the way the mod does: the
  `….brief.md` path the prompt names, else an inline `[[brief …]]` header in
  the prompt (a report with no brief is checked for what git alone can say, as
  in a cardless hand-back, and is never consistent). It finds the worker's tree
  (the brief's `repo=`, the call's `cwd`, the worktree that has the report's
  branch checked out, the sibling `<repo>-<id>` worktree, else the repo the
  hook runs in), runs the verifier there, and prints the verdict row as the
  hook's additional context:

      {"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"chassis-delegation: verdict=consistent task=T-1 via=settings-hook next=accept\nclaim branch: held — …"}}

  The row is the mod's own: the verdict line, then one line per claim. The
  gate can take minutes, hence the `timeout`.
- **`pre-bash`** (PreToolUse on the Bash tool) runs the git guard over the
  command, against the repo the command runs in (`cd` and `git -C` are
  followed), and when it refuses prints the deny with the guard's own reason:

      {"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"chassis-delegation: no commit on main; branch first (git checkout -b agent/<domain>/<id>)"}}

  Anything else prints nothing and exits 0. The guarded branches are `main`
  and `master`.

Every command the wrapper runs itself (read-only git, and the repo's gate)
first passes `hooks/lib/allow.ts` with the gate map of the repo's
`.chassis-delegation.json`, as in the engine; it never pushes, installs or
fetches. The gate map is read from that file alone (there is no `/config`
without the engine).

What differs from the engine's verdict:

- the row has no attempt count (`via=settings-hook` in its place): nothing is
  recorded, so a red file reused from an earlier attempt is not caught;
- a `repo=here` or `repo=none` brief gets an `unverified` row saying so;
- the hand-back's `[[amend …]]` blocks are not applied (a note says so), so the
  worker is judged against the brief as written;
- a gate red only on timeouts in untouched tests is run once more, as in the
  engine, but engine gates take no turns (the turn is held in the engine's
  store), so two workers verified at once can still time each other out.

What exists only with the engine: tiering (the model picked from the card's
tier, the effort setting), the queue and `maxWorkers`, the respawn ladder and
attempt budgets, the spend ceilings, the dashboard and the delegation band, the
debrief, the eval runner, the "Delegation state" section the brain reads, the
verdict waking the brain, `/delegation`, `dispatch` and the other tools,
`readyFallbackMinutes`, and `delegateOnly`.

## Known issues

- **Function-hook plugins need the engine's rollout switch.** Where it serves
  off, the mod does not load. `claude plugin test` then refuses with "hooks
  modules are turned off in this process: the rollout switch served off".
  `tests/selfcheck.sh` says so instead of failing. The pure tests also run
  under plain node (see Developing).
- **A gate runs in the worker's worktree, as the worker left it.** If a tool
  the gate needs is missing there, the gate exits 127, which reads as
  unchecked, not refuted. The brief tells the worker to install first.
- **`usd` is approximate when marked `~`.** It is then the session delta; see the cost formula.
- **Concurrent workers can starve the machine.** `maxWorkers` (2) caps briefed
  workers. It does not count ad hoc agents. A briefed spawn past the cap waits
  in a queue that holds one row per task and subtask: the dispatch result and
  the spawn hook's refusal read
  `queued: BE-314 — the mod will tell you when a slot frees (1 live: BE-310; 1 queued: BE-314)`,
  and a second dispatch of a queued task answers `…; already queued since
  14:02 (position 1)` and prints no spawn block. The queue is advice (MOD-12):
  the brain starts a queued task, and only a ready worktree row left unclaimed
  for `readyFallbackMinutes` is started by the mod itself (MOD-15; that worker
  runs outside the mod's hooks). When a hand-back frees a slot, its verdict
  row says `ready: BE-314 — run its spawn block (/dispatch BE-314 prints it
  again)` once, and the "Delegation state" section says it while the slot
  stays free; the brain's spawn of the task takes its queued place and toasts
  `started queued <task> (waited <m> min)`. Only live agents and other tasks'
  starting spawns hold slots, never queue rows. A queued row leaves the queue
  only once its spawn succeeds: a spawn the engine refuses leaves it at the head.
  A refusal retrying cannot cure (budget exhausted, work present in the
  worktree) removes the row. A resource (`resources=`, MOD-23) queues a spawn
  too, slot or no slot: `queued: BE-314 — waiting for resource blender-live
  (held by BE-310)`. Only a running or starting worker holds a resource; a
  worker that has handed back holds none, even while its verdict is still out.
- **The git guard reads the command text.** It cannot see a commit made inside
  a script, or a folder named through a variable.
- **The background runners act on the session's permissions.** The built-in
  debrief is told to write only under `<root>/.delegation/`; your own
  `~/.claude/commands/debrief.md` writes where it says. The eval is off until
  you set `evalCommand`.
- **The dashboard shows run-end numbers for workers.** See [Dashboard](#dashboard):
  a worker's tokens and cost update when its run ends, not per step. "Across
  sessions" draws this session from the store's attempt records, so its
  sparklines hold one point until a history of earlier sessions is kept.

## Store and ledger

- **`<root>/.delegation/ledger.jsonl`** gets one JSON line per judged attempt,
  holding the attempt fields plus `verdict`, `next` and `sessionId`. A reviewer's
  line (MOD-21) has `kind: review`, `verdict: reviewed` and
  `review: {confirmed, refuted, unverifiable}`. A line
  written before the `consistent` rename says `verified` and is never
  rewritten (see the deprecation note under [How a report is verified](#how-a-report-is-verified)).
  Each verdict line is written once (MOD-35): a line with the same task, subtask,
  attempt, sha and verdict as one already in the file is not appended, so a hand-back
  that arrives twice (as a tool result and as a notification) leaves one line.
  An accept line records a closed outcome: `{kind: accept, task, subtask, attempt,
  sha, at, how, sessionId}` with `how: merged` (the retire check found the sha on the
  default branch, or the git guard saw the brain run `gh pr merge` naming the task's
  branch or PR, or `git merge agent/<domain>/<id>`) or `how: accepted`
  (`/delegation accept <id>`). One accept line per task attempt, never two.
- **The store** is `~/.claude/plugins/store/chassis-delegation_<id>.json`, with
  these keys:
  - `delegation.tasks.<ID>`: every attempt (a repo=here attempt also carries `here`, the root it shares, and `files`, what its hand-back claimed; a cardless one carries `adhoc: true`; one where fable was asked for and opus spawned carries `requestedAlias: fable`; a judged one carries `sha`, the sha its report named, and `metrics`, the report's `metrics=` (MOD-22); a `work-present` attempt, kind `verify`, carries the branch head it found; a reviewer's attempt, kind `review` (MOD-21), carries the number of the attempt it reviewed, its verdict `reviewed` and the `review` counts, and is on no ladder);
  - `delegation.recent.<session>`: the verdict lines;
  - `delegation.handoff.<brief>`: the folder `/dispatch` prepared for the brief's worker, which the spawn hook gives the brain's Agent call (MOD-12);
  - `delegation.outside.<ID>`: the listing `/dispatch` took of a research card's absolute scope and forbid roots, the "before" of the outside delta (MOD-22); a re-dispatch of a reused brief keeps it;
  - `delegation.debrief.<session>`;
  - `delegation.friction.<session>`;
  - `delegation.evals`.
- **`$.state`** holds `chassis-delegation.workers`, `.status`, `.lastVerdict`
  and `.queue`, declared in `hooks/types/index.d.ts`.

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
- **`bin/chassis-hook.mjs`** is the settings.json fallback (see
  [Without the engine](#without-the-engine-two-settingsjson-hooks)): plain
  node, no `$`. It reads the pure libraries above through `bin/ts-resolve.mjs`.
- **`hooks/register.ts`** holds every `$` call. `$` is only ever spelled
  `$.noun.method(...)` or passed to a function, never stored.
- **`tests/harness.ts`** answers every `$` call from memory. No test spawns,
  dispatches or runs anything real.
- **`tests/node/bin.node.mjs`** pipes hook input JSON into
  `node bin/chassis-hook.mjs` against real repositories under `tests/.tmp/`:
  a matching report (consistent), a file outside the delta (refuted), no report
  (nothing printed), a commit on `main` (denied) and on `agent/x/y` (passes).
- **`tests/node/verify-native.git.node.mjs`** builds temporary git
  repositories under `tests/.tmp/`. It checks these cases: consistent, a sha off
  the branch, a sha that does not exist, a dirty tree, a files mismatch, a red
  gate, a red file in the worktree (held, then refuted when named again), and a
  dirty repo=here checkout shared with another worker.

If `claude plugin test` refuses with the rollout-switch message, wait a minute
and retry. If it still refuses, the node runner covers every pure test, and
the hook tests are owed until the switch is on.
