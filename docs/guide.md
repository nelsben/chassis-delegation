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

### What the worker sees

The worker reads the brief alone: the card's header, Why and Done when, and the domain's lessons file. None of the conversation that produced the card reaches it, so the card must carry every decision the brain does not want the worker to make. A Done when line that says `sensible`, `appropriate`, `as needed` or `the existing one` leaves a judgment call the worker makes alone, and the brain reads about it in the hand-back. A detailed card costs the same to dispatch as a thin one, so name the fallback and the target.

A worker may read GitHub with `gh` but not write to it: it never closes, edits or files issues, merges or edits PRs, or writes to the Project. The mod denies those commands (`gh guard: <task> may not run …; gh writes are the brain's`) while `gitGuard` is on. Hand the brain what the issue needs and it does the write.

Before: `- Handle errors appropriately.`
After: `- A failed save returns HTTP 500 with the body {"error": "save-failed"}; a missing record returns 404 and writes nothing.`

### Dry-run warnings

The dry run and `/dispatch` print these; the card is still written.

| Line | Fires when |
| --- | --- |
| `warning: forbid artifacts/*.html matches scope artifacts/kit/**` | a `forbid` glob can name a scope entry |
| `warning: forbid covers paths done-when names: artifacts/kit/index.html (artifacts/*.html)` | a `forbid` glob covers a path-like word of a `Done when` line; a path the line says is written or changed gets its own `forbid <glob> matches <path> named in done-when` line, first |
| `fix: forbid=docs/**` | after the line above: the `forbid` list with each glob that covers a named path removed (`fix: forbid= (none left)` when every glob goes); pass it back as `--forbid` |
| `warning: scope names 8 files (and 1 globs); cost tracks the files a card touches: split it` | more than 6 literal scope entries |
| `hint: tier economy would do: 2 files in scope, 3 done-when lines, a red test` | a standard card with at most 2 literal scope entries (not `tests/` or `test/`), 3 `Done when` lines and a red test |
| `hint: done-when line 2 says "appropriately": the worker decides that alone; name the outcome` | a `Done when` line holds a hedge word (`sensible`, `as needed`, `properly`, `tidy`, `etc` and the like) outside backticks; at most three lines, then `hint: <k> more done-when lines hedge` |

Shrink the forbid or list the files before you say go.

### The brief follows the card

A brief is the card plus the dispatch flags, rendered once. Dispatch renders it again each time and compares it with the file in the folder. If the card, `--scope` or `--forbid` would change it, the file is rewritten and step 2 reads `2. brief <path> rewritten: the card changed, --scope applied, --forbid applied` (only the reasons that hold). If nothing would change it, step 2 reads `exists — reused, not overwritten`. Pass the same flags on every dispatch: a flag you leave out means the card's own value.

While a worker on the task is running, starting or waiting for its verdict, a brief that would change is not rewritten under it. Dispatch refuses before it cuts a worktree: `<ID>: a worker on <ID> is live and reads <brief path>; its brief is not rewritten under it. Wait for its hand-back, then dispatch again`. Amend blocks a worker appended are kept through a rewrite. A `budget=` you raised by hand in the brief is kept, so raising it to continue is never undone by dispatching again; the rewritten brief keeps the higher of the card's budget and the brief's own, so raising `budget:` on the card takes effect too, and the rewrite line adds `budget <old>→<new> attempts`. A base flag on an unchanged brief only sets `base=`. A brief written by hand, whose `task=` names no card, and a `repo=here` brief are reused as they are.

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

## Planning on GitHub

Work can be planned as GitHub issues at six levels, and only the last of them becomes a card. The levels are optional downward: a bug or a spike can stand alone, and a task can hang straight under a feature.

| Level | What it is |
| --- | --- |
| `feature` | A thing a user can do that they could not before. |
| `epic` | A body of work that spans several stories. |
| `story` | One user-visible slice, small enough to finish in a short run of tasks. |
| `task` | The leaf: one change a worker can build and verify. Only a task becomes a card. |
| `bug` | Something that is broken; it can be a leaf itself. |
| `spike` | A question to answer, not a change to ship. |

An issue states what a worker may touch in two fenced blocks in its body, with the info strings `scope` and `forbid`, one repo-relative path or glob per line. When you make the task's card, pass the issue's number and its parent's: the card tool takes `issue`, `parent`, `parentScope` and `parentForbid`. Every scope glob of the card must sit inside the parent's scope, the parent's forbid is added to the card's forbid, and so is the scope of every open sibling card under the same parent; a card whose scope overlaps an open sibling is refused until that sibling merges. The exact rules are in [Parent scope](contracts.md).

A card with `issue:` gets `Refs #n` in its `pr.md` (never Closes). GitHub is kept current by the mod: when a worker starts (or is respawned) the mod comments `attempt 1/2 started · standard sonnet · card <ID>` on the card's issue, and when its verdict lands it comments the verdict row; both bodies are written first under `.delegation/status/` and redacted. A card without `issue:` gets no comment. A failed comment adds one `status: comment on #<n> failed: <stderr>` line to the next dispatch or verdict result and is not retried. Merge finish closes the task itself with `merged in #<pr>` (or `merged at <sha7>`) and, when it was the last open task of its parent, closes the parent with `all <k> tasks done`; it reports `closed #<n>` for each. A close that fails keeps its `gh issue close` line in the printed block, with `(close failed: <stderr>)` after it, for you to run by hand. When siblings are still open finish prints `# parent #n: k of m tasks still open`. The Project status is left to GitHub's own workflows (a linked PR is In Progress, a closed issue is Done); the mod writes nothing to the Project beyond `land`'s item-add.

`/delegation land <type> <title> [--parent <n>] [--supersedes <n>] [--paths a,b] [--note <text>] [--dry-run]` and the `land` tool (the same function) file work that comes up mid-session as a GitHub issue without starting it. It writes a redacted issue body under `.delegation/landed/` (the note, a `scope` block from `--paths`, and the open cards it was landed from), then runs `gh issue create` with the label `type:<type>` (and `--parent` when given), reads the new issue's url, adds it to the Project named by the `project` option when one is set, and writes `issue: #<n> <url>` to the end of the landed file. When no `--parent` is given and a path falls inside an open card's scope, it prints a `parent hint`. It dispatches nothing. By default (MOD-208) land files nothing without your yes; to let it file on the brain's call, turn that on with `/delegation config landAuto on`. With it off, `land` writes the body, shows the issue (title, type, parent and the `gh` line) and ends `nothing filed: landAuto is off; call land again with confirm: true once the person says yes`, and files only when called again with `confirm: true` after your yes (`--confirm` for the command you type), and the land nudge says `propose` instead of `land` (with landAuto on it says `land`). With `--dry-run` (the tool's `dryRun: true`) it keeps the old behaviour: the body is written and the one `gh issue create` line is printed for you to run, and `gh` is not called. If `gh issue create` fails, the result names the file, the line tried and gh's error, and nothing is written back; if only the add to the Project fails, the issue is still reported as filed. The `type:*` labels below must exist in the repo, or `gh issue create` fails. To change a task's scope, land a new issue with `--supersedes <old>` (the tool's `supersedes`): the new issue's body gets a `supersedes: #<old>` line under the note, and once it is filed the old issue is closed with `superseded by #<new>: <note or title>` and the result says `closed #<old> as superseded by #<new>`. The mod never edits an issue. If that close fails the result gives the line it tried and gh's error, and the new issue is still reported as filed; with `--dry-run` the close line is printed and not run.

To land a whole settled plan at once, use the `land_plan` tool: plan in chat first, then call it with a `feature` (title, `paths`, optional `type` feature or epic and `note`) and up to 30 `tasks` (title, `paths`, optional `type` story, task, bug or spike and `note`); `tasks` may be empty or left out, and the feature may take an optional `parent`, an existing issue number it is filed under as a sub-issue (the preview shows `under #<n>`). `paths` may be empty on a feature, epic or story, which then shows `scope: none` and puts no limit on its children, but a task, bug or spike needs at least one. Every task path must sit inside the feature's paths when the feature has paths, or the whole call is refused before anything is written. Called without `confirm` it writes every body under `.delegation/landed/` and prints the tree (`feature: ...`, then one `task: ...` line per task); it files nothing. Show that tree to the person. Only after they say yes in their own words, call it again with `confirm: true`: it files the feature first, then each task under it with `--parent`, adds every issue to the Project when one is set, and ends `tree: #<feature> with <k> tasks`. If a create fails it stops there and lists what was filed and what was not.

To backfill work that already shipped, give the item the evidence: `land --closed <evidence>` (the tool's `closed`) or a `close: "<evidence>"` on a `land_plan` item. It is filed as usual and then closed with `gh issue close` and the comment `done before filing: <evidence>` (redacted like the body), and the landed file gains a `closed: <ISO time>` line; the preview shows `(filed closed: <evidence>)` and runs no gh. In a plan the tasks are closed first and a parent with `close` is closed only when every task in the plan is closed, else it stays open and the result says `#<n> left open: <k> open children`. A retry closes a reused item that is still open and leaves a closed one alone; a failed close is reported once as `close #<n> failed: ...` and not retried. The mod writes nothing to the Project; GitHub's closed-to-Done workflow moves the item.

To read a plan back, use the `tree` tool (or `/delegation tree <n>`, the same function) with the number of a feature or other parent issue. It runs one read-only `gh issue view` for this repo's origin and prints the issue as `#<n> <type>: <title> (open|closed)`, its `scope:` and `forbid:` blocks, then one row per sub-issue: `done` (closed, or its card is accepted or merged), `in flight` (an open card names it in `issue:`, and the row ends with that card's id) or `planned`, then a count line. It writes no file and files nothing. Use it at the start of a session to pick up the plan. Before cutting a task's card under a parent, call it on the parent: its last line, `parentScope for a task card: [...]`, is the JSON array to pass as the card tool's `parentScope`, together with `parent: <n>` (and `parentForbid` from the `forbid:` line).

### Tree import

To file a large multi-level plan (a backfill of many features, epics, stories and tasks) in one reviewed step, write it as a JSON file under `.delegation/plans/` (any other folder is refused) and run `/delegation tree import <file> --dry-run` (or the `tree_import` tool). The file is `{ "version": 1, "parent"?: <n>, "items": [ ... ] }`; each item has a `type` (feature, epic, story or task), a `title`, and optional `paths`, `note`, `close` and `children`, nested up to 4 levels. The land_plan path rules hold at every level (a task needs a path; a child's paths sit inside its parent's when the parent has paths) and so does the `close` rule, and a parent with more than 100 children is refused; every error names its item, such as `items[2].children[0]`, and nothing is filed on any of them.

```json
{
  "version": 1,
  "parent": 12,
  "items": [
    {
      "type": "feature",
      "title": "Example feature",
      "children": [
        {
          "type": "epic",
          "title": "Example epic",
          "paths": ["src/example/**"],
          "children": [
            { "type": "task", "title": "Example task", "paths": ["src/example/a.ts"] },
            { "type": "task", "title": "Example done task", "paths": ["src/example/b.ts"], "close": "shipped before the mod" }
          ]
        }
      ]
    }
  ]
}
```

The dry run (and any call without `confirm`) prints the whole tree indented, with the count per type and how many items are new, may be reused and will be filed closed, and runs no `gh`. Add `--confirm` (the tool's `confirm: true`) after you have read it: the import files parents before children with the same shapes `land` uses, under `parent` when the file names one, and writes each issue number back into the file as `"issue": <n>` after its create. The file is the manifest: a re-run reads it first and skips an item whose recorded issue is open or closed (closed with or without `close`; the line reads `already filed #<n> (closed) <title>`), so after a failure or a stop it files only what is missing. Each run creates at most `treeImportBatch` issues (default 20, 1 to 100), at least a second apart, and then stops with `filed k of n; run again to continue`.

Create the type labels once per repo, with the owner and name of your repo in place of `acme/widgets`:

```
gh label create type:feature --repo acme/widgets
gh label create type:epic --repo acme/widgets
gh label create type:story --repo acme/widgets
gh label create type:task --repo acme/widgets
gh label create type:bug --repo acme/widgets
gh label create type:spike --repo acme/widgets
```

To see the work across repos, use one GitHub Project that you own as the view. Set `/delegation config project <owner>/<number>` and `land` adds each issue it files to that Project (`gh project item-add`); nothing else of the Project is read or written, and with the option unset the mod never touches it.

While parents are in use, set `/delegation config scopeAmends within-parent`. A card cut with `parentScope` carries it into the brief as `parent_scope=`; a worker's `scope+=` then applies on its word only when every path sits inside that scope, and anything that escapes it waits for your approval. `ask` holds every scope amend instead, and a brief with no `parent_scope=` waits every time under `within-parent`.

### Land nudge

Two one-line leads sit in the band above the prompt, for the brain and not for you. After a prompt of yours that describes a bug, feature or idea, if the turn ends without a `land`, `land_plan` or `card` call, the band says `lead: land this as an issue (land or land_plan) or say it is not work`. After a merge finish whose parent issue still has open tasks, it says `lead: parent #<n> has <k> open tasks; land the next or close it`. A later land, land_plan or card call clears the first; land, land_plan, card or dispatch clears the second. Nothing is written to GitHub. Turn them off with `/delegation config landNudge off`.

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
| `/delegation tree import <file> [--dry-run] [--confirm]` | you | files a multi-level plan file from `.delegation/plans/`; dry run first, resumable (see [Tree import](#tree-import)) |
| `tree_import` | the brain | the same, with `file`, `dryRun` and `confirm` |
| `/delegation land <type> <title> [--parent <n>] [--paths a,b] [--note <text>]` | you | writes a redacted issue body under `.delegation/landed/` and prints the `gh issue create` line; files and dispatches nothing |
| `/delegation merge <ID> --finish` | you, or the brain after the PR landed | checks the branch is in origin, pulls, removes the worktree and branch, writes the `merged` ledger row, prints the cleanup block |
| `/dispatch <ID> [--dry-run\|--scope\|--forbid\|--replay\|--base\|--here\|--repo <abs path>\|--force-overlap]` | you | brief, worktree, tier, spawn block (see **Spawn** under [The contracts](contracts.md#the-contracts)); `--here` shares your checkout (see [repo=here](contracts.md#repohere-the-main-checkout)) |
| `/dispatch <ID> --verify <sha>` | you, or the brain after a `work present` row | runs the verifier on the worktree at that sha, spawns nothing (see **Look before you respawn** under [How a report is verified](contracts.md#how-a-report-is-verified)) |
| `mcp__chassis-delegation__dispatch` | the model | the same dispatch, as a tool |
| `mcp__chassis-delegation__verdict` | the model | waits for a verdict: `task`, optional `subtask`, `waitSeconds` up to 900; returns the row and any `ready:` lines (see **Waking the brain** under [The contracts](contracts.md#the-contracts)) |
| `mcp__chassis-delegation__card` | the model | writes the card, runs the dry run, returns the summary, `card says <tier> · classifier says <tier>` (or `· classifier agrees`; off with `classifierSecondOpinion`) and the brief header. `dispatch: true` dispatches. `repo`: `none` or `here` ([Research cards](contracts.md#research-cards)) or another checkout's path ([Delegating into another repo](contracts.md#delegating-into-another-repo)); `resources` and `lanes` ([Exclusive resources and fan-out](contracts.md#exclusive-resources-and-fan-out)); every lane card carries the shared `doneWhen`, and a lane's own `doneWhen` is added after it |
| `mcp__chassis-delegation__init` | the model | `/delegation init` (optional `path`) |
| `mcp__chassis-delegation__setup` | the model | `/delegation setup` (optional `path`, see [Delegating into another repo](contracts.md#delegating-into-another-repo)) |
| `mcp__chassis-delegation__merge` | the model | `/delegation merge`: `task`, `finish`, `review`, `reviewFile` |

A skill or command named `delegation` or `dispatch` under `~/.claude/skills` or `~/.claude/commands` shadows the mod; remove it.
