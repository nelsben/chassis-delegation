# Upgrading

`/delegation update`, and what changed at each version.

## Upgrading

Upgrade between turns, with no worker running. Type `/delegation update`: it
finds the loaded folder (`$.plugin.root`, the `loaded from` line of
`/delegation`) and, for a git clone, runs `git fetch origin main` then
`git merge --ff-only origin/main` there; a dirty tree or a non-fast-forward
refuses with git's reason and changes nothing. It prints
`update: <old version> (<old sha>) → <new version> (<new sha>), n commits`, the
CHANGELOG sections newer than the old version (at most 40 lines, with a pointer
to the `From <old> to <new>` section of docs/upgrading.md when there is one), adds to
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

### From 0.9.13 to 0.9.14

What the brain will see:

- **The card tool never reuses a task id (MOD-87).** The next id now also skips every id that has a brief in the brief folder or a row in `.delegation/ledger.jsonl`, so a card deleted after its run no longer hands its id, old brief and attempts to a new card.

- **Scope is checked under an outside folder too big to list (MOD-85).** A forbid or scope root outside the repo that holds more than 10000 files used to come back unchecked. The dispatch now says `<root> holds more than 10000 files, so changes there will be found by modification time`, and the hand-back judges every file and folder there modified since the dispatch. Anything else that writes under that root during the run (an app, Finder's `.DS_Store`) counts too, so a card should forbid the narrowest folder that matters.

- **`/delegation merge` works with a git-ignored card folder (MOD-86).** When the card folder is git-ignored the merge marks the root card merged in place and commits no card. Its first line says `card kept local (git-ignored): <path> marked merged`, `--finish` keeps that card, and setup and init print a `cards: <cardDir> is git-ignored, …` line. A tracked card behaves as before.

What to do: a window that loads the plugin from a folder named by `CLAUDE_CODE_PLUGIN_DIRS` needs a window reload to pick this up. A clone under `~/.claude/dev-mods` reloads at the end of the turn after `/delegation update`. Nothing in an existing repo's config needs to change.

### From 0.9.12 to 0.9.13

What the brain will see:

- **The README is a front door (MOD-83).** README.md is now a short page: what the mod is, install in three lines and a list of pages. The reference moved, text unchanged, into eight pages under docs/, and `/delegation update` now ends its changelog lines with `docs/upgrading.md: From <old> to <new>` where it used to say `README: …`. A bookmark to an old README anchor now opens the README's top, and the section is on the docs page of the same heading.

What to do: a window that loads the plugin from a folder named by `CLAUDE_CODE_PLUGIN_DIRS` needs a window reload to pick this up. A clone under `~/.claude/dev-mods` reloads at the end of the turn after `/delegation update`. Nothing in an existing repo's config needs to change.

### From 0.9.11 to 0.9.12

What the brain will see:

- **One delegation meter (MOD-81).** While the band above the prompt is drawn, the host status line under it is cleared. The band's row names the live workers and the context percent, and both read the same newest dollars, so the two no longer disagree. With the band off, empty or not drawn for over a minute, the status line shows as before.
- **`debrief post` and `apply` find your debrief (MOD-80).** With your own debrief skill installed, the findings land under `~/.claude/harness/debriefs`, and the by-hand doors now read this session's debrief there. Another session's file in that shared folder is never picked. A refusal names every folder it looked in.

What to do: a window that loads the plugin from a folder named by `CLAUDE_CODE_PLUGIN_DIRS` needs a window reload to pick this up. A clone under `~/.claude/dev-mods` reloads at the end of the turn after `/delegation update`. Nothing in an existing repo's config needs to change.

### From 0.9.10 to 0.9.11

What the brain will see:

- **A glyph names the model on every row (MOD-78).** Every subagent the mod starts reaches the host with its model's glyph in front of the description, so the host's own task row shows the model. The started, resumed, handed-back and one-line verdict rows, the `running:` and `brain:` lines of `/delegation`, and the band and pane carry the same glyph before the alias. The legend is 🟢 haiku · 🔵 sonnet · 🟣 opus · 🟠 fable · ⚪ other; the ledger and the debug log stay bare.

What to do: a window that loads the plugin from a folder named by `CLAUDE_CODE_PLUGIN_DIRS` needs a window reload to pick this up. A clone under `~/.claude/dev-mods` reloads at the end of the turn after `/delegation update`. Nothing in an existing repo's config needs to change. `/delegation config modelGlyphs off` turns the glyphs off, and `alias=glyph` pairs such as `sonnet=🟦` change them.

### From 0.9.9 to 0.9.10

What the brain will see:

- **The verdict tool answers after a real wait (MOD-72).** A call made before the verifier has judged now waits up to `waitSeconds` in `sleep` steps and returns the verdict row, where before it failed with 'no tool.call hook answered this call'. The allowlist gains exactly one rule, `sleep <1..600 whole seconds>`.
- **`/delegation merge <ID>` does the local merge pipeline (MOD-75).** After a consistent verdict it rebases the worktree, commits the merged card, runs the card's gates and prints one block (push, `gh pr create`, `gh pr merge`, `/delegation merge <ID> --finish`) for the brain to run verbatim. `--finish` cleans up and prints the release block when the version bumped. The mod itself still never pushes nor runs `gh`; see the [Merging a card](review-and-merge.md#merging-a-card) section of Review and merge.

What to do: a window that loads the plugin from a folder named by `CLAUDE_CODE_PLUGIN_DIRS` needs a window reload to pick this up. A clone under `~/.claude/dev-mods` reloads at the end of the turn after `/delegation update`. Nothing in an existing repo's config needs to change. From now on, merge a consistent card with `/delegation merge <ID>` rather than by hand.

### From 0.9.8 to 0.9.9

What the brain will see:

- **`/delegation config` shows the options the mod runs with, each with its source, and sets any of them on every screen (MOD-73).** The default view lists only the options that are set, with a count line; `all` or a group name lists more, and one option shows its scope and an `in effect:` line. Values read as a person reads them (on/off, `20 min`, `$10`, `200K`), and names match in any case. A set with no host row lands in `~/.claude/chassis-delegation/options.json` (`(yours)`); `repo <field> <value>` writes the repo file, and `default` resets.
- **Every worker's model is visible all the time (MOD-74, MOD-78).** A started worker posts a `<task> started · <glyph> <alias> (<tier>) · attempt n/b` row, and a handed-back worker a `<task> handed back · <glyph> <alias> · <m> min · $<usd> · verifying` row. `/delegation` opens with a `running:` section, one line per worker, ending with `brain: <glyph> <model>`. Legend: 🟢 haiku · 🔵 sonnet · 🟣 opus · 🟠 fable · ⚪ other. The same glyph leads the description of every subagent the mod starts, so the host's own row shows it too. `modelGlyphs` changes the glyphs or turns them off; the ledger and the debug log never carry them.

What to do: a window that loads the plugin from a folder named by `CLAUDE_CODE_PLUGIN_DIRS` needs a window reload to pick this up. A clone under `~/.claude/dev-mods` reloads at the end of the turn after `/delegation update`. Nothing in an existing repo's config needs to change. An option set by hand in the repo file still works; to set a personal option on the VS Code extension, use `/delegation config <field> <value>`.

### From 0.9.7 to 0.9.8

What the brain will see:

- **`/delegation config` groups the options and says what each does (MOD-70).** The list is under seven headings (Workers and models, Checking the work, Where things go, Debriefs, Evals, Guards and nudges for the brain, Display), with a one-line summary under each option. `/delegation config <field>` adds the full description.

What to do: a window that loads the plugin from a folder named by `CLAUDE_CODE_PLUGIN_DIRS` needs a window reload to pick this up. A clone under `~/.claude/dev-mods` reloads at the end of the turn after `/delegation update`. Nothing in an existing repo's config needs to change.

### From 0.9.6 to 0.9.7

What the brain will see:

- **`/delegation config` lists the mod's options on every screen (MOD-68).** The list comes from the mod's manifest with the values it runs with, so it is never empty. When the screen's settings give no rows for the mod, a last line says so and names the `/config` menu in a terminal. A set that is refused says `<field> was not set: <reason>`.

What to do: a window that loads the plugin from a folder named by `CLAUDE_CODE_PLUGIN_DIRS` needs a window reload to pick this up. A clone under `~/.claude/dev-mods` reloads at the end of the turn after `/delegation update`. Nothing in an existing repo's config needs to change.

### From 0.9.5 to 0.9.6

What the brain will see:

- **`/delegation config` lists, shows and sets the mod's own options (MOD-66).** `/delegation config` lists every option with its value; `/delegation config <field>` shows one; `/delegation config <field> <value>` sets it and the mod reloads with it. Messages that said to set an option in /config now name this command.

What to do: a window that loads the plugin from a folder named by `CLAUDE_CODE_PLUGIN_DIRS` needs a window reload to pick this up. A clone under `~/.claude/dev-mods` reloads at the end of the turn after `/delegation update`. Nothing in an existing repo's config needs to change.

### From 0.9.4 to 0.9.5

What the brain will see:

- **Wakes are off by default, and the brain waits for its verdict with the verdict tool (MOD-64).** A verdict no longer submits "The chassis-delegation plugin sent a message" as a turn of its own. The verdict row is still appended; in the hand-back turn the brain calls the verdict tool with the task id, which returns the verdict once it lands. The dispatch text and the Delegation state section say so.

What to do: a window that loads the plugin from a folder named by `CLAUDE_CODE_PLUGIN_DIRS` needs a window reload to pick this up. A clone under `~/.claude/dev-mods` reloads at the end of the turn after `/delegation update`. To keep the old wakes, run `/delegation config wakeOnVerdict true` (or the `/config` menu in a terminal). Nothing in an existing repo's config needs to change.

### From 0.9.3 to 0.9.4

What the brain will see:

- **A wake the brain already read is not sent again (MOD-62).** A verdict, ready line or post question that lands while the brain's turn is open, and that a later step of the turn read, no longer starts a second turn at the turn's end that repeats it. One that lands in the turn's last step still wakes the brain.

What to do: a window that loads the plugin from a folder named by `CLAUDE_CODE_PLUGIN_DIRS` needs a window reload to pick this up. A clone under `~/.claude/dev-mods` reloads at the end of the turn after `/delegation update`. Nothing in an existing repo's config needs to change.

### From 0.9.2 to 0.9.3

What the brain will see:

- **A state check's red file ends with a marker line (MOD-59).** A red test that is a query or state check now ends its red file with an `expected: …; got: …` line. A red file with no failure marker is advised `check red by hand` instead of a resume that cannot help.
- **A verdict for a merged or accepted task wakes the brain only when it can act (MOD-60).** A refuted or unverified verdict for a task already merged or accepted no longer wakes the brain. A worker's sha being on origin/main no longer counts as merged for a verdict that is not consistent, so a refuted hand-back with no commits is never retired as merged.

What to do: nothing in an existing repo's config needs to change.

### From 0.9.1 to 0.9.2

What the brain will see:

- **A stale verdict wake no longer arrives (MOD-51, MOD-57).** A held verdict wake is dropped once the brain has resumed the worker or the task has merged, so the brain is not woken for a verdict it already acted on.
- **A once-a-session row starts a fresh session (MOD-53).** `/delegation` and the dashboard show a fresh-session row past the option `freshSessionTokens`, default 400K, so the brain can start a fresh session when a long one has grown past it.
- **Dispatch warns on a wide scope and hints at economy (MOD-54).** A scope of more than six files warns at dispatch, and a small card gets a hint that economy would do.
- **Bold done-when paths no longer warn (MOD-52).** A path set in bold in a card's done-when is read as the path it names, so it does not raise a warning.
- **A gate failure that only a forbidden file can fix comes back with an amend (MOD-55).** The brain gets a `forbid-=` amend to approve, then resumes the worker.
- **A worker stopped by a usage limit is recorded as rate limited (MOD-56).** It reads `no-report (rate limited)`, and the queue says `held:` instead of `ready:` until the brain spawns again.

What to do: nothing in an existing repo's config needs to change; run `/delegation config freshSessionTokens 0` (or the `/config` menu in a terminal) to turn the fresh-session row off.

### From 0.9.0 to 0.9.1

What the brain will see:

- **The brain and worker cost figures follow each model's own price (MOD-47).** `/delegation` and the dashboard now follow each model's own cache-read price, and 1-hour cache writes at 2x, so the money line can read higher than before on the same session.
- **The brain sees what driving costs it (MOD-48).** `/delegation` and the dashboard show a brain calls row and a warn row, on by default, with the options `driveWarn` and `driveWarnTokens`.
- **The legacy verdict word `verified` is no longer read by a reader of its own (MOD-49).** A stored record or row that still carries it is read as `consistent` by one normaliser, with no further deadline.

What to do: nothing in an existing repo's config needs to change; run `/delegation config driveWarn false` (or the `/config` menu in a terminal) to silence the warn row.

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

What to do: run `/delegation config redact <words>` (or the `/config` menu in a terminal) before any session posts, and set `postFindings` to `auto` only after that.

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
- **A verdict is read in the hand-back turn, and the posture line says to act (MOD-15, MOD-64).** The mod
  posts the row for a background worker's hand-back; with `wakeOnVerdict` on it
  also submits that row with its next action as a turn of your own (the model
  reads "The chassis-delegation plugin sent a message"). Wakes are off by default
  (MOD-64): in the hand-back turn call the `verdict` tool with the task id, before
  ending the turn, and act on the row it returns. The "Delegation state" section carries one posture line
  while a `ready:` row, a respawn block or a pending review block is out: make
  that call without asking; ask only when a verdict is refuted on a claim you
  cannot amend, a worker is over its spend, or an amend needs approval. A
  `ready:` worktree row you leave unclaimed for 10 minutes is started by the mod
  itself, outside its hooks; `repo=here` and `repo=none` rows always wait for
  you. `readyFallbackMinutes` turns the fallback off.
- **An optional reviewer stage, off by default (MOD-21, public issue #1).** With
  `review` set to `on` (or `on-frontier`), a consistent verdict says
  `next=review` and ends with a spawn block for a fresh read-only reviewer, one
  tier below the worker's: make that Agent call verbatim. It labels each claim of
  the hand-back confirmed, refuted or unverifiable and edits nothing. With none
  refuted the next is `next=accept`; with one refuted it is a resume of the
  worker with the rows quoted, spent from its `budget=`. The reviewer never
  counts against the budget. With `review` off, nothing about a verdict changes.
  See [Review](review-and-merge.md#review).
- **Research cards: `repo=none` and `repo=here` with outputs outside the repo
  (MOD-22, public issues #32 and #33).** The `card` tool takes `repo`
  (`worktree`, `here`, `none`); `scope` and `forbid` take absolute paths and
  globs, and the first absolute scope entry is the output folder. The brief
  header gains `outdir=` and `scratch=`: deliverables go in the output folder,
  helper files in scratch, never in the repo. A `repo: none` card has no
  worktree and no git. The verdict also checks the outside folder (a changed path
  outside the scope is refuted) and the report's new `artefacts=` (each path must
  exist and not be empty) and `metrics="k=v"` (recorded, never judged); a
  gate-map command may name `{outdir}`. See [Research cards](contracts.md#research-cards).
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
  [Exclusive resources and fan-out](contracts.md#exclusive-resources-and-fan-out).
- **A worker's Bash carries its own identity (MOD-16, public issue #24).** Every
  Bash call of a recorded worker runs behind
  `export CHASSIS_SESSION_ID=<task>-a<attempt> CHASSIS_TASK=<task> CHASSIS_ATTEMPT=<n>`,
  so a lock script keyed on the session id tells sibling workers apart. Your own
  Bash, ad hoc agents and the debrief and eval runners are never rewritten. A
  `briefExtra` line asking workers to prefix their lock calls by hand is no
  longer needed. See [A worker's identity](spend.md#a-workers-identity).
- **A settings.json fallback for hosts that do not load the mod (MOD-17, public
  issue #2).** Where the engine's rollout switch serves off, two ordinary
  `settings.json` command hooks from `bin/chassis-hook.mjs` still print the
  verdict row (`via=settings-hook`, nothing recorded, `repo=here` and `repo=none`
  briefs engine-only) and run the git guard. It needs node 22.18 or newer. See
  [Without the engine: two settings.json hooks](internals.md#without-the-engine-two-settingsjson-hooks).
- **The debrief shows the agent's own proposals, and a post refuses while
  `redact` is empty (MOD-18).** When a debrief hands back, the mod prints
  `proposals: n for you to review (never posted)`: the agent's process changes,
  one line each, which are never written to the findings and never posted.
  `issueRepo` now defaults to the mod's own repository, so mod findings can be
  filed from any repo the mod runs in. `/delegation debrief post <n|all>` files
  nothing while the `redact` option is empty, and says to set it with
  `/delegation config redact <words>` first. See [Posting the findings](configuration.md#posting-the-findings).
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
  run `/delegation config redact <words>` with the product, customer, employer and repo names
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
