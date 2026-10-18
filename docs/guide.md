# Guide

The first sixty seconds, what you see, the task card, the dashboard and every command.

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
any other repo: no scripts, no harness, no network.

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
    warning: forbid covers paths done-when names: artifacts/kit/index.html (artifacts/*.html)

A forbid collides with a scope entry it can name, or with a path-like word of a
`Done when` line (a word with a slash and a dot, in backticks or bare). Each uses the
verifier's rule for its entry. The paths a `Done when` line only mentions share the one
`forbid covers paths done-when names:` line; a path its line says is written, changed,
created, added or updated keeps its own `forbid <glob> matches <path> named in done-when`
line, listed first (#160). A scope or forbid entry may hold a space when given as a list
element (the header quotes it). The verifier's rule for an entry: in a repo path `*` crosses folders, so `artifacts/*.html`
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
card's output folder (see [Research cards](contracts.md#research-cards)). An absolute entry
is matched the way a `repo=none` brief's always was: `*` stays inside one
folder, `**` spans folders, and `dir/**` is the folder and everything below it.
No spaces in an entry (a path with one reads as prose).

A card whose scope is prose is caught at dispatch (GH-103). `/dispatch` and the
tool write the brief, print its header and the prose scope, and stop before the
worktree and the spawn:

    stopped: the card scope is prose; pass --scope <globs> (or scope on the tool) and dispatch again

Dispatch again with `--scope <globs>` (the tool's `scope`, which must be globs
and replaces the card's scope in the header); the brief written the first time
is reused (a brief written for another repo, worktree or card path is rewritten instead, or refused while an
attempt of the task is open; see the internals page). `--dry-run` behaves as before.

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

## Dashboard

A live view of what delegation is doing and spending, in two places:

- **The band above the prompt**, drawn only while a worker is live, a spawn is
  queued or a verdict is owed (nothing otherwise):
  `delegation · 2 live: OPS-165, OPS-160 · 1 queued · $4.12 · ctx 11% ·` a
  sparkline of the last 30 minutes of spend, and a `[ details ]` button that
  opens the pane. While the band is drawn it replaces the host status line
  (the `2 workers · $… · ctx …` text under the prompt): the line is cleared,
  and shows again as before when the band is off, has nothing to show, or the
  screen has not drawn it for a minute. The band and the old line read the same
  session dollars. A long worker list is cut with `…` to fit the width before
  the dollars are. The whole
  band is a hover scope: hover it and a card opens beneath the row with the
  first three blocks below. Turn the band off with the `dashboardBand`
  setting (`/delegation config dashboardBand false`; default on); `/delegation dashboard` still opens the pane.
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
   exclusive resource (MOD-23; see [Exclusive resources](contracts.md#exclusive-resources-and-fan-out)),
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
| `/delegation setup [path]` | you type it | checks the repo and tools, names the fixes, then scaffolds and asks for your first task (see [Setup](install.md#setup)) |
| `/delegation init [path]` | you type it | the bare scaffold, no checks (step 4 above) |
| `/delegation update` | you type it | brings the loaded copy of the mod to origin/main (fast-forward only), migrates this repo's config and says whether the session reloaded or needs a restart (see [Upgrading](upgrading.md#upgrading)) |
| `/delegation debrief` | you type it | runs the background debrief now and ends with scrubbed findings about the mod, ready to post (see [The debrief now](configuration.md#the-debrief-now)) |
| `/delegation config [all \| <group> \| <field> [<value> \| default] \| repo <field> <value>]` | you type it | shows the options the mod runs with and where each came from (default, repo, yours, host, locked): the set ones by default, `all` or one group in full, one option with what is in effect; sets one in your options file (or the host row when there is one), resets it with `default`, or writes a repo option into the repo file with `repo`. Works on every screen. See [/delegation config](configuration.md#delegation-config) |
| `/delegation dashboard` | you type it | opens the live dashboard pane (see [Dashboard](#dashboard)); nothing opens it unasked |
| `/delegation merge <ID> [--review <text> \| --review-file <abs path>]` | you type it, or the brain after a consistent/accept verdict | the local half of the merge: rebases the worktree, commits the card as merged, runs the card's gates there, writes `.delegation/<ID>/pr.md` and prints the push and PR block to run verbatim (see [Merging a card](review-and-merge.md#merging-a-card)) |
| `/delegation merge <ID> --finish` | you type it, or the brain after the PR landed | checks the branch is in origin, removes the root card when it matches the merged one, pulls, removes the worktree and branch, writes the `merged` ledger row and prints the remote cleanup (and release) block |
| `/dispatch <ID> [--dry-run\|--scope\|--forbid\|--replay\|--base\|--here\|--repo <abs path>\|--force-overlap]` | you type it | dispatches a card: the brief, the worktree and the tier, then the spawn block, the one Agent call that starts the worker (see **Spawn** under [The contracts](contracts.md#the-contracts)); the model can also run it through the tool. `--here` shares the session's own checkout (see [repo=here](contracts.md#repohere-the-main-checkout)) |
| `/dispatch <ID> --verify <sha>` | you type it, or the brain after a `work present` row | spawns nothing: runs the verifier on the work already in the task's worktree at that sha (see **Look before you respawn** under [How a report is verified](contracts.md#how-a-report-is-verified)) |
| `mcp__chassis-delegation__dispatch` | the model, on its own | the same dispatch, as a tool; the model then makes the Agent call its result ends with |
| `mcp__chassis-delegation__verdict` | the model, on its own | waits for a worker's verdict: with `task` (and optional `subtask`, `waitSeconds` up to 900) it returns the verdict row and any `ready:` lines once the verifier has judged the latest attempt, at once if it already has; call it in the hand-back turn, before ending it (see **Waking the brain** under [The contracts](contracts.md#the-contracts)) |
| `mcp__chassis-delegation__card` | the model, on its own | you say a task in a sentence; the model looks at the repo, calls this with the title, why, done-when, scope globs and red test (and `repo`: `none` or `here` for research or extraction with outputs outside the repo, see [Research cards](contracts.md#research-cards), or the absolute path of another local checkout, see [Delegating into another repo](contracts.md#delegating-into-another-repo); `resources` for a live app only one worker may use, and `lanes` to write several research cards at once, see [Exclusive resources and fan-out](contracts.md#exclusive-resources-and-fan-out)); it writes the card, runs the dry run and returns the one-line summary, a line `card says <tier> · classifier says <tier>` (or `· classifier agrees`; one classifier call per card written, never on dispatch, off with `classifierSecondOpinion`) and the brief header. Dispatch when you say go (the `dispatch` tool, or `card` again with `dispatch: true`) |
| `mcp__chassis-delegation__init` | the model, on its own | the same scaffold as `/delegation init`, as a tool (optional `path`, as for `setup`) |
| `mcp__chassis-delegation__setup` | the model, on its own | the same checks and scaffold as `/delegation setup`, as a tool (optional `path`: another local checkout to set up instead, see [Delegating into another repo](contracts.md#delegating-into-another-repo)) |
| `mcp__chassis-delegation__merge` | the model, on its own | the same `/delegation merge`, as a tool: `task`, and optional `finish`, `review`, `reviewFile` |

A user skill or command named `delegation` or `dispatch` under
`~/.claude/skills` or `~/.claude/commands` shadows the mod's commands; remove it.
