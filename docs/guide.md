# Guide

The first sixty seconds, what you see, the task card, the dashboard and every command.

The main model (the "brain") hands a task card to a worker with one `dispatch`
call, then makes the Agent call it gets back. The mod needs no network. The
card-to-merge flow is in [How it works](how-it-works.md).

## Sixty seconds

1. **Set up, then say the task.** Run `/delegation setup` once. Then tell
   Claude what you want in a sentence. Claude calls the `card` tool and shows
   the card's path, a summary and the brief header:

       wrote …/agents/tasks/OPS-1-add-a-function-that-reads.md
       OPS-1 · standard → sonnet · scope src/reader/**, tests/** · gate test · red: python3 -m unittest tests.test_reader · 2 attempts · $6 ceiling
       [[brief v=1 task=OPS-1 subtask=main purpose=build tier=standard model=sonnet …]]

2. **Say go.** Claude calls the `dispatch` tool (or `card` again with
   `dispatch: true`). Or type `/dispatch OPS-1`. The result ends with:

       spawn: Agent
       ```json
       { "subagent_type": "general-purpose", "model": "sonnet", "description": "OPS-1 standard sonnet", "prompt": "Your brief is the file …/OPS-1.brief.md. Read it whole, then follow it exactly." }
       ```

   Claude makes that Agent call verbatim; the worker starts.

3. **The worker hands back.** One row; `next=` says what to do:

       chassis-delegation: OPS-1 attempt 1/2 consistent · sonnet · $0.41 · next=accept
       chassis-delegation: OPS-1 attempt 1/2 refuted on files (files= does not match the actual delta …) · sonnet · $0.38 · next=resume agent=agent-7

4. **`/delegation`** prints what is running, queued and owed, and the last verdicts.

## What the person sees

- The tier under each spawn, such as `tier=standard → sonnet (brief) · attempt 1/2`.
  Source: the header's `tier=`, else the caller's `model`, else the classifier.
  Log: `T-7: tier=economy picked by the brief header's tier= (no classify call)`.
- The rationing health bar in the band above the prompt, seven coloured cells then `59% left · resets 2d 4h · today 6.2/8.4 · on pace`, with a `[ details ]` button (see the spend doc; `/delegation config ration off` hides it, `/delegation ration` prints the report). The band draws whenever the window has a reading; `dashboardBand on` adds the worker line to it while a worker is active. The host status line is retired.
- Toasts: `debrief running in the background`, `T1 63/63`, `started queued OPS-3 (waited 4 min)`.

While anything runs or is owed, the system prompt carries a "Delegation state" section (at most 40 lines) that survives compaction.

| Rule | Behaviour |
| --- | --- |
| Owed row retires itself | The last attempt's sha is an ancestor of `origin/main`; or its patch is on `HEAD` (`git cherry`); or the card reads `status: merged` or `status: landed`. Consistent verdicts, own repo only. Checked every 15 minutes per task at most. The record keeps `retired: merged`. |
| `/delegation accept <id> [<id> ...] [note]` | Records each `PREFIX-N` id as `accepted` with the note and retires its row. Non-ids are the note. |
| `/delegation accept --owed [note]` | Retires every owed row of the session and says how many. |
| Old rows collapse | Older checked owed rows become `n older owed rows: <ids>`. |

## The card

One file per card, `agents/tasks/<ID>-<slug>.md`: YAML frontmatter, then the
spec. The `card` tool writes it. `<ID>` is `<PREFIX>-<number>[letter]`, such as `OPS-12`, `BE-101` or `FE-7b`.

    ---
    id: OPS-12
    title: One line that says what done looks like
    domain: ops                 # one of `domains`; the branch is agent/<domain>/<id>
    tier: standard              # economy | standard | frontier | premium, or haiku | sonnet | opus | fable; else standard with a warning
    status: queued              # /dispatch takes queued or claimed; others are refused
    scope: [src/feature/**, docs/feature.md]
    forbid: [src/secrets/**]
    red_test: npm test -- feature.test.ts
    gate: test                  # ids in gateMap, comma-separated
    budget: 2-attempts          # spawns + resumes before it comes back to you
    spend: 4                    # optional: dollars per attempt (else spendByTier; 0 = no ceiling)
    repo: here                  # optional: here (see repo=here) | none (see Research cards) | an absolute path (see Delegating into another repo)
    outdir: /out/results           # optional: output folder outside the repo; default the first absolute scope entry's folder
    scratch: /tmp/scratch-dir  # optional: helper files; default <system temp>/chassis-delegation/<ID>
    resources: [blender-live]   # optional: exclusive resources held while it runs
    ---
    ## Why … ## Done when …

Glob rules for `scope` and `forbid`:

- `*` crosses folders; `**` is the same as `*`;
- `?` is one character;
- a trailing `/` means everything under the folder;
- an absolute entry (a leading `~` is the home folder) is allowed; there `*` stays inside one folder, `**` and `dir/**` span folders; the first one is the output folder (see [Research cards](contracts.md#research-cards), `repo=none`);
- no spaces in an entry.

### Dry-run warnings

The dry run and `/dispatch` print these; the card is still written.

| Line | Fires when |
| --- | --- |
| `warning: forbid artifacts/*.html matches scope artifacts/kit/**` | a `forbid` glob can name a scope entry |
| `warning: forbid covers paths done-when names: artifacts/kit/index.html (artifacts/*.html)` | a `forbid` glob covers a path-like word of a `Done when` line; a path the line says is written or changed gets its own `forbid <glob> matches <path> named in done-when` line, first |
| `warning: scope names 8 files (and 1 globs); cost tracks the files a card touches: split it` | more than 6 literal scope entries |
| `hint: tier economy would do: 2 files in scope, 3 done-when lines, a red test` | a standard card with at most 2 literal scope entries (not `tests/` or `test/`), 3 `Done when` lines and a red test |

Shrink the forbid or list the files before you say go.

### Prose scope

A prose scope stops dispatch before the worktree:

    stopped: the card scope is prose; pass --scope <globs> (or scope on the tool) and dispatch again

Dispatch again with `--scope <globs>`; it replaces the card's scope in the header.

### Budget

A `budget` that is not `<n>-attempts` falls back to `defaultBudget`; `/dispatch` warns once:
`warning: budget "frontier-60m" is not <n>-attempts; using the default 3`.

## One-client resources

A live app that takes one client at a time (a running Blender, a device on a bench) is declared on the card with
`resources: [blender-live]`. The worker holds it while it runs; a second card naming it waits in the queue.
The brain waits with the `verdict` tool; the `driveWarn` row points here.
A worker waiting on its own background job wakes the brain once; past `waitStallMin` (default 20) it says the worker is stalled.

## Lessons

One committed file per domain, `<cardDir>/lessons/<domain>.md`, appended to every brief in that domain under
`## Lessons (<domain>)`. Cap 40 lines: a longer file is cut with
`(n more lines not carried; prune <path>)`. Writable under `delegateOnly`.

- `/delegation lesson <domain> <text>` appends `- <YYYY-MM-DD> <text>`; a domain not in `domains` is refused.
- `/delegation lesson <domain>` prints the file.
- Dry run and dispatch print `lessons: n lines from <path>`.

## Dashboard

| Place | Opens | Shows |
| --- | --- | --- |
| The band above the prompt | only while a worker is live, a spawn is queued or a verdict is owed | `delegation · 2 live: OPS-165, OPS-160 · 1 queued · $4.12 · ctx 11% ·`, a 30-minute sparkline and `[ details ]`; hover for the first three blocks |
| The pane | `/delegation dashboard` or `[ details ]` | all four blocks, "Across sessions" (six sparklines, 14 sessions), open items |

The band is off by default. Turn it on with `/delegation config dashboardBand on`.

The four blocks:

1. **Tiles**: live, queued, session spend, cards consistent on the first attempt (n of m).
2. **Spend over time**: cumulative dollars, a tick per spawn and verdict; Svg with a tooltip, or block glyphs in the terminal.
3. **Worktrees**: a row per task and per worktree named `<repo>-<ID>` (or under `worktreeRoot`): task, model, state (`live mm:ss`, `queued #2`, `verdict owed`), branch, tokens, cost, attempt. A `resource` column shows a held resource (`blender-live`); a queued row says `waits blender-live` (see [Exclusive resources](contracts.md#exclusive-resources-and-fan-out)).
4. **Spend by model**: haiku, sonnet, opus, "other", labelled `sonnet · $3.10 · 412k tok · 4 consistent`.

Spend samples every 15 seconds while a worker is live or queued, else every 60 (240 points kept).
Tokens, cost and by-model bars update from `turn.complete` events, when a run ends.
A screen with no mod panes (VS Code) gets the blocks as markdown text.

## Commands and tools

| Name | Who calls it | What it does |
| --- | --- | --- |
| `/delegation` | you | shows the delegation state and where the config came from |
| `/delegation setup [path]` | you | checks, scaffolds, asks for your first task (see [Setup](install.md#setup)) |
| `/delegation init [path]` | you | the bare scaffold |
| `/delegation update` | you | fast-forwards the mod to origin/main and migrates config (see [Upgrading](upgrading.md#upgrading)) |
| `/delegation debrief` | you | runs the debrief on demand (see [The debrief now](configuration.md#the-debrief-now)) |
| `/delegation debrief ingest <note.md>` | you | turns the `For the mod owner` bullets of your review note into findings that `debrief post` lists (see [The debrief from your review note](configuration.md#the-debrief-from-your-review-note)) |
| `/delegation config [all \| <group> \| <field> [<value> \| default] \| repo <field> <value>]` | you | shows or sets options (see [/delegation config](configuration.md#delegation-config)) |
| `/delegation dashboard` | you | opens the pane (see [Dashboard](#dashboard)) |
| `/delegation merge <ID> [--review <text> \| --review-file <abs path>]` | you, or the brain after a consistent/accept verdict | rebases, commits the card as merged, runs the gates, writes `.delegation/<ID>/pr.md`, prints the push and PR block (see [Merging a card](review-and-merge.md#merging-a-card)) |
| `/delegation merge <ID> --finish` | you, or the brain after the PR landed | checks the branch is in origin, pulls, removes the worktree and branch, writes the `merged` ledger row, prints the cleanup block |
| `/dispatch <ID> [--dry-run\|--scope\|--forbid\|--replay\|--base\|--here\|--repo <abs path>\|--force-overlap]` | you | brief, worktree, tier, spawn block (see **Spawn** under [The contracts](contracts.md#the-contracts)); `--here` shares your checkout (see [repo=here](contracts.md#repohere-the-main-checkout)) |
| `/dispatch <ID> --verify <sha>` | you, or the brain after a `work present` row | runs the verifier on the worktree at that sha, spawns nothing (see **Look before you respawn** under [How a report is verified](contracts.md#how-a-report-is-verified)) |
| `mcp__chassis-delegation__dispatch` | the model | the same dispatch, as a tool |
| `mcp__chassis-delegation__verdict` | the model | waits for a verdict: `task`, optional `subtask`, `waitSeconds` up to 900; returns the row and any `ready:` lines (see **Waking the brain** under [The contracts](contracts.md#the-contracts)) |
| `mcp__chassis-delegation__card` | the model | writes the card, runs the dry run, returns the summary, `card says <tier> · classifier says <tier>` (or `· classifier agrees`; off with `classifierSecondOpinion`) and the brief header. `dispatch: true` dispatches. `repo`: `none` or `here` ([Research cards](contracts.md#research-cards)) or another checkout's path ([Delegating into another repo](contracts.md#delegating-into-another-repo)); `resources` and `lanes` ([Exclusive resources and fan-out](contracts.md#exclusive-resources-and-fan-out)) |
| `mcp__chassis-delegation__init` | the model | `/delegation init` (optional `path`) |
| `mcp__chassis-delegation__setup` | the model | `/delegation setup` (optional `path`, see [Delegating into another repo](contracts.md#delegating-into-another-repo)) |
| `mcp__chassis-delegation__merge` | the model | `/delegation merge`: `task`, `finish`, `review`, `reviewFile` |

A skill or command named `delegation` or `dispatch` under `~/.claude/skills` or `~/.claude/commands` shadows the mod; remove it.
