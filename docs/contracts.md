# Contracts and verification

The brief and report lines, and how a report is checked against git.

## The contracts

Three blocks carry a task: the brief the worker reads, the report it ends with, and the amend it adds when it must
leave its scope. A value runs to the next known field; a quoted value runs to its closing quote; a list entry holding a
space is written in double quotes.

### The brief

`/dispatch` writes `<root>/.delegation/briefs/<ID>.brief.md`, which starts with one header line:

```
[[brief v=1 task=<ID> subtask=main purpose=build tier=<tier> model=<alias> scope=<globs> forbid=<globs> red_test="<cmd>" gate=<ids> spend=<usd> budget=<n>-attempts report=chassis.report.v1]]
```

Optional fields go after `gate=` and before `spend=`, in this order: `repo=`, `base=`, `ignore=`, `outdir=`,
`scratch=`, `resources=`, `allow=`.

| Field | Values | Meaning | Default | What the mod does with it |
| --- | --- | --- | --- | --- |
| `v` | `1` | grammar version | `1` | not checked |
| `task` | card id | the task | required | keys the attempts, ledger and verdict row |
| `subtask` | a name | one part of a task | `main` | attempts, budgets and red files count per task and subtask |
| `purpose` | `build`, `review` | why the worker runs | `build` | recorded on the spawn; a reviewer's says `review` |
| `tier` | `economy`, `standard`, `frontier`, `premium` | the card's tier | the card's | the spawn hook picks the model from it; a respawn may raise it |
| `model` | a `tierMap` alias | the tier's alias at dispatch | `tierMap` | the spawn keeps the Agent call's model when it is this alias, else the tier decides |
| `scope` | globs, or prose | paths the worker may change | required | every changed path must match one; prose leaves the scope claim unchecked; no `scope=` refuses the brief |
| `forbid` | globs | paths it must not change; forbid wins over scope | none | a changed path inside one fails scope |
| `parent_scope` | globs | the parent issue's scope, written after `forbid=` from a card's `parentScope:` | none | read by `scopeAmends within-parent` to decide which `scope+=` amends apply |
| `scope_globs` | globs | replaces a prose `scope=` | none | checked in its place |
| `forbid_globs` | globs | replaces a prose `forbid=` | none | checked in its place |
| `red_test` | a command, `none`, empty | the test that fails before the fix | none | set: the red claim is checked; dispatch warns when a path in it is outside scope or inside forbid |
| `gate` | gate ids | what must pass | required unless `repo=none` | each id runs from `gateMap` in the worker's tree |
| `spend` | dollars | per-attempt ceiling | the card's `spend:`, else `spendByTier`; `0` writes none | rendered as the Rules' spend line ([Spend](spend.md)) |
| `budget` | `<n>-attempts` | attempts for the task | `defaultBudget` | counts spawns, resumes and verify attempts, then denies the next spawn; another form falls back to the default with a warning |
| `report` | `chassis.report.v1` | report grammar | that value | not checked |
| `repo` | absent, `here`, `none`, an absolute path | where the tree is | absent: a worktree | see [repo=here](#repohere-the-main-checkout), [Research cards](#research-cards), [Delegating into another repo](#delegating-into-another-repo) |
| `base` | branch, sha, `HEAD~2` | where the delta starts | `baseRef`, else the `origin/main` chain below | cut point and diff base; written when `--base` is not `origin/main`; a value starting `-` or an `a..b` range refuses the brief |
| `ignore` | globs | paths off a repo=here delta | see [repo=here](#repohere-the-main-checkout) | subtracted before scope and files |
| `outdir` | absolute folder | output folder outside the repo | the card's `outdir:`, else the folder of its first absolute scope entry | fills `{outdir}`; relative `artefacts=` read against it |
| `scratch` | absolute folder | helper files | the card's `scratch:`, else `<system temp>/chassis-delegation/<ID>` | written with `outdir=`, `repo=here`, `repo=none`, or when the card names one |
| `resources` | words of letters, digits, `.` `_` `:` `-` | exclusive resources held while the worker runs | none | a spawn while a running worker holds one is queued |
| `allow` | words of letters, digits, `.` `_` `:` `-` | named exceptions, from the card's `allow: [<id>]` | none | each id's `### allow: <id>` block in the repo's `briefLocal` file is rendered into the brief as `## Exception for this card: <id>`; the verdict row ends ` allow=<a,b>` when the header names any. An id with no block, or `allow:` with no `briefLocal`, refuses the dispatch |

A dispatch naming a base against a reused brief sets or replaces `base=` alone and says `reused, base= set to <sha>` or
`reused, base= replaced <old> → <new>`. A reused brief keeps its amend blocks and hand edits; one written for another
repo, worktree or card is rewritten ([Internals](internals.md#developing)). The repo file's `briefExtra` adds lines.

The body, from `hooks/templates/brief.md`, tells the worker to work only in its worktree; install first by the
lockfile (`package-lock.json` `npm ci`, `pnpm-lock.yaml` `pnpm i --frozen-lockfile`, `yarn.lock`
`yarn install --immutable`, `requirements.txt` `pip install -r requirements.txt`); save the red test's failing output
to `.delegation/<ID>/red-<attempt>.txt` before changing source, a new file each attempt; leave the gate green and the
tree clean; never set `CHASSIS_SESSION_ID`, `CHASSIS_TASK` or `CHASSIS_ATTEMPT`
([A worker's identity](spend.md#a-workers-identity)); commit and hold, never pushing or committing on main; and end
with the report line. Sections pick the mode (`{{#worktree}}`, `{{#here}}`, `{{#none}}`); `{{#repo}}` holds the
red-test lines; `{{#outdir}}` and `{{#scratch}}` render when named; `{{reportExtra}}` is the `artefacts=` and
`metrics=` placeholders. A template without sections renders the same in every mode.

**Where the verifier looks for a brief.** At the spawn, the first absolute `….brief.md` path in the prompt; failing that, the first relative one (`.delegation/briefs/T-1.brief.md`, with or without `./`), read from the spawn's folder, else the session root, and never one that climbs out of that folder with `..`. At the hand-back, a spawn left with no brief whose report names a `task=` (a plain name, as a store key) is checked for `<root>/.delegation/briefs/<task>.brief.md` (for a `subtask=` other than `main`, the inline header's `<task>.<subtask>.brief.md`); a file there whose header is for that task is the brief, and the attempt is recorded under the task. With none of the three, the hand-back is cardless (below).

**Inline header.** A header in the Agent prompt works as a brief when the prompt names no `….brief.md` and the header
has `task=`, `scope=` or `scope_globs=`, and `gate=` or `repo=none`. The mod writes it and the rest of the prompt to
`<root>/.delegation/briefs/<task>.<subtask>.brief.md` (or `briefDir`), reuses a file already there, and verifies
against it. A header lacking a field is not verified:

```
note: no brief file named in the prompt; the inline header lacks gate= (or repo=none); verify skipped
```

### Spawn and the queue

**Spawn.** `/dispatch` and the dispatch tool spawn nothing. Their result ends with the spawn block:

    spawn: Agent
    ```json
    { "subagent_type": "<agent type>", "model": "<the tier's alias>", "description": "<ID> <tier> <alias>",
      "prompt": "Your brief is the file <brief>. Read it whole, then follow it exactly." }
    ```

Pass that JSON to the Agent tool verbatim. The `agent.spawn` hook finds the brief, picks the model, runs the worker
in the prepared folder (the worktree, or the root for repo=here), takes a slot and records the attempt
(`source: brief`). Because the brain made the call, the mod's hooks see the worker; a subagent a plugin starts itself
runs outside that plugin's hooks.

The hook refuses with the dispatch result's own line: a second spawn of a running attempt
(`<ID> not spawned — already running as attempt 1 …`); a spawn past the budget or onto finished work
([Look before you respawn](#look-before-you-respawn)); and a spawn with every slot taken, or
of a resource a running worker holds, is queued (`queued: <ID> — …`).

**The queue.** The queue is advice ([Known issues](internals.md#known-issues)). A hand-back that frees a slot says
`ready: <ID> — run its spawn block (/dispatch <ID> prints it again)` once in its row, and "Delegation state" repeats
it. While a row is ready or a respawn or reviewer block is pending, make that Agent call without asking the person; ask
only for a refute the brain cannot amend, an over-spend, or an amend needing approval. A row waiting for a resource is
not ready while a running worker or an earlier queued row names it; the hand-back freeing the resource readies the next
such row only.

A ready worktree row unclaimed for `readyFallbackMinutes` (default 10, `0` off) is started by the mod through the same
tier, budget and slot decision, recorded `source: fallback`, and runs outside the mod's hooks: no git guard, no effort
setting, cost known only at its end. A `repo=here` or `repo=none` row always waits for the brain.

### Waking the brain

A hand-back starts the brain's turn before the verifier finishes. **Call the `verdict` tool with `task=<id>` in that
turn, before ending it.**

The `verdict` tool (`mcp__chassis-delegation__verdict`) takes `task`, `subtask` (default `main`) and `waitSeconds`
(default 600, at most 900). It returns the verdict row and any `ready:` lines once the latest attempt is judged,
reading only its own records about every 5 seconds, else `<task>: still verifying after <n>s; call verdict again`.

`wakeOnVerdict` (default `false`) also submits each background verdict as a turn of the brain's own, never as the
person's words. A `--verify` or foreground verdict wakes nothing. A consistent wake for a merged or accepted task is
skipped (`wake skipped: <id> already merged`); one raised mid-turn is held to the turn's end, re-checked, and dropped
when a later step read its row. Refuted, no-report, over-spend and `ready:` wakes are never dropped.

### The report

The hand-back ends with the report line. The mod reads the last one across the final answer and the SubagentHandback
message (a background worker's from its transcript):

```
[[report v=1 task=<ID> subtask=main branch=<branch> pr=<none|n|url> sha=<sha> gate=pass|fail red=<path|none> files=<a,b> artefacts=<a,b> metrics="k=v,k=v"]]
```

| Field | Values | Meaning | Default | What the verifier does |
| --- | --- | --- | --- | --- |
| `v` | `1` | grammar version | `1` | not checked |
| `task` | task id | the task | required | finds the brief and attempt; cardless without one: `adhoc-<key>` |
| `subtask` | a name | the part | `main` | picks the lineage |
| `branch` | a branch, `none` | the worker's branch | required | the branch claim |
| `pr` | `none`, a number, a URL | a PR opened | `none` | the pr claim |
| `sha` | a sha, `HEAD`, `none` | the commit handed back | required | the sha claim; the gate runs at it |
| `gate` | `pass`, `fail` | the worker's gate result | required | `pass` needs a green gate; `fail` is an honest stop, never accepted |
| `red` | a tree-relative path, an absolute path under the brief's `scratch=`, `none` | the red test's failing output | none | the red claim, when `red_test` is set; any other absolute path is refused, the line naming `scratch=` as the allowed place (#199) |
| `files` | paths, `none` | every path changed since the base | required | must equal the delta |
| `artefacts` | paths, relative to `outdir=` or absolute | files delivered outside the repo | none | each must exist, not empty |
| `metrics` | `"k=v,k=v"` | numbers or words worth keeping | none | recorded, shown as `metrics: k=v, k=v`, never judged |

A brief with no output folder has no `artefacts=` or `metrics=` in its report line.

### Amend

A worker that had to change a file outside its scope says so on its own line, just above the report:

```
[[amend v=1 scope+=<path> reason=<one line>]]
```

The mod appends it to the brief before verifying, never rewrites the header, and discloses each as `amendment: #n …`. `forbid=` is the hard boundary; `scope+=` discloses an edit the worker has already made.

| Field | Values | Meaning | Default | What the verifier does |
| --- | --- | --- | --- | --- |
| `v` | `1` | grammar version | required | missing or another version makes the block malformed |
| `scope+=` | globs | widen scope | none | applied on the worker's word under `scopeAmends` `apply` (the default); `new-files` applies only new files beside paths in scope; `ask` holds every one for approval; `within-parent` applies a block only when the brief header carries `parent_scope=<globs>` (the card's `parentScope:`, written after `forbid=`) and every path sits inside it, and holds the rest like `ask`. Without `parent_scope=` it holds every block. A held block is not appended: the row says `amend needs approval: <block> (scopeAmends <mode>) — append it to <brief> to accept, then dispatch verify=<sha>`, and a verdict that refutes only on that scope reads `next=approve the amend (append it to <brief>), then dispatch verify=<sha>; or refuse it` (nothing is resumed). Inside a forbid glob it does nothing and the row says `amend needs approval: scope+=P lies inside forbid Y; …` |
| `forbid+=` | globs | widen forbid | none | applied on the worker's word |
| `scope-=` | globs | shrink scope | none | waits for approval; the verdict is the un-amended brief's |
| `forbid-=` | a forbid entry | shrink forbid | none | waits for approval |
| `ignore+=` | globs | more paths off a repo=here delta | none | waits for approval: it hides paths |
| `reason=` | one line, to the block's end | why | required | missing makes the block malformed |

A malformed block leaves the scope claim unchecked. `/dispatch` warns once per scope entry inside a forbid and
dispatches anyway.

When only a forbidden file can fix a gate failure, do not touch it: hand back `gate=fail` with
`[[amend v=1 forbid-=<the forbid entry that covers it> scope+=<path> reason=<the one-line fix>]]`. The advice is
`approve the amend (append it to <brief>), then resume agent=<id> to make the fix; or refuse it`; the tier stays, and a
spent budget still stops.

## Fields the GitHub sync reads

For a repo that writes its own cards and briefs. This is read from the code, not from the `card` tool's output: a
hand-written card is read by the same parser (`parseCard`) as one the `card` tool writes, so a line that parses is read
the same. What a hand-written card does not get is the `card` tool's checks on write (below).

Every issue step needs the session root's `origin` to be a GitHub remote (`owner/name`) and the card's file to be named
`<ID>-<anything>.md` in the card folder (a name that does not start with `<ID>-` is not found). With no GitHub origin
the steps are silent.

### Card frontmatter

The frontmatter is the block between two `---` lines at the top. A key is `key: value` at the start of a line; a quoted
value has its quotes removed; a line that is not `key: value` is skipped.

| Key | Syntax | Read by | Hand-written vs the `card` tool |
| --- | --- | --- | --- |
| `id` | `id: ID` | everything; a card with no `id` is refused | same |
| `status` | `status: queued` | see the status table below | same; the tool writes `queued` |
| `issue` | `issue: 12`, `issue: #12` or `issue: https://github.com/<owner>/<repo>/issues/12`; all three read as 12 | dispatch "started" status comment and verdict comment (once per attempt, on that issue); merge finish: the close of the task issue (`gh issue close 12 --comment "merged in #<pr>"`, or `merged at <sha>`); the PR body's `Refs #<issue>` line (a reference, not a close); `/delegation tree` | same read. A URL naming a repo other than the origin's is not used, and dispatch prints one warning line naming it (`issue: <value> names <owner/repo>, not <origin repo>; no status comments or close for this card`). Any other value (`issue: abc`, a pull-request URL) is not an issue number: dispatch prints `issue: <value> is not an issue number; no status comments or close for this card` once, and the steps stay silent |
| `parent` | `parent: 8`, `parent: #8` or an issue URL of this repo (same three forms and the same warning, ending `no parent close for this card`) | merge finish: the close of the parent (see below); the open-sibling rule when a new card is cut under that parent; the `land` parent hint; the parent nudge | same parse. The tool also adds the scope of the parent's open sibling cards to `forbid`; a hand-written card gets no such forbid |
| `parentScope` | `parentScope: [hooks/**, docs/**]`, or a block list, or a scalar split on `,` and `;` | `/dispatch` copies it to the brief header as `parent_scope=` | same parse, and it is read even without `parent`. The tool refuses `parentScope` without `parent` and refuses a `scope` glob outside it; a hand-written card is not checked, so a `scope` outside `parentScope` dispatches |
| `scope`, `forbid` | `scope: [a/**, b.md]` | the brief's `scope=`, `forbid=` | same |

**Card status.** `status:` is one word; a missing or other value is refused by dispatch as `<ID> is status <value>; /dispatch takes a queued or claimed card`.

| Status | Dispatch | Land overlap list and tree's open cards |
| --- | --- | --- |
| `queued` | takes it | listed as open (unless the ledger has an accepted or merged row for it) |
| `claimed` | takes it | listed as open (same rule) |
| `parked` | refuses it: `<ID> is parked; set status: queued to dispatch it` | left out, as merged |
| `merged` | refuses it | left out |
| `landed` | refuses it (any other word is refused the same way) | listed as open (same rule); no step reads it specially |

The land nudge reads no card status, so `parked` does not change it.

No other key is read for the sync. (`land --supersedes <n>` reads no card key: it is a command argument, see below.)

**Which step needs which key.**

| Step | Needs |
| --- | --- |
| Dispatch status comment ("started" per new or respawned attempt; not on a resume) | `issue` |
| Verdict comment (one per attempt, on the verdict row) | `issue` |
| Merge finish, close of the task | `issue` |
| Merge finish, close of the parent | `issue` and `parent`. The parent's sub-issues are read once (`gh issue view <parent> --json subIssues`); the parent is closed (`all <n> tasks done`) only when every other sub-issue is CLOSED. If the sub-issues cannot be read, the parent is not closed and the block prints the `gh issue close` line to run by hand. A `parent` with no `issue` closes nothing |
| `scopeAmends within-parent` | the brief header's `parent_scope=`, from `parentScope` |
| `land --supersedes <n>` | no card; the number is the argument. After the new issue is filed, issue `<n>` is closed `superseded by #<new>: <note or title>`. The landed body gains a `supersedes: #<n>` line |

### Brief header

The header is read the same whether `/dispatch` wrote it or you did (`parseHeader` for amends, the verifier's own read
for the hand-back). The sync reads one key:

| Key | Syntax | Read by | Hand-written vs the dispatch tool |
| --- | --- | --- | --- |
| `parent_scope` | `parent_scope=hooks/**,docs/**`, a comma list, written after `forbid=` | `scopeAmends within-parent`: a `scope+=` amend applies only when every path sits inside it; empty or absent, every amend is held as under `ask` | same read. Dispatch writes it from the card's `parentScope`; if you write the brief by hand, it is not checked against the card. A double-quoted entry (a spaced path) is not unquoted by this read, so keep these globs free of spaces |

The brief carries no issue number: the status comments and closes come from the card, not the brief.

### A minimal example that gets the full sync

Card, `<card folder>/MOD-1-docs-example.md`:

```
---
id: MOD-1
title: Example task
domain: mod
tier: standard
status: queued
issue: 12
parent: 8
parentScope: [docs/**]
scope: [docs/example.md]
forbid: []
red_test: none
gate: validate
budget: 2-attempts
spend: 10
---
## Why

...
```

Brief header, `.delegation/briefs/MOD-1.brief.md`:

```
[[brief v=1 task=MOD-1 subtask=main purpose=build tier=standard model=sonnet scope=docs/example.md forbid= parent_scope=docs/** red_test="none" gate=validate spend=10 budget=2-attempts report=chassis.report.v1]]
```

With a GitHub origin this gets: a comment on #12 at each started attempt and each verdict; `scopeAmends within-parent`
applied against `docs/**`; at merge finish, #12 closed, and #8 closed too when every other sub-issue of #8 is closed.

## How a report is verified

The worker's tree is the brief's `repo=`, else its worktree, else the session root. The verifier runs read-only git and
the gate there, never in a fresh checkout, never installing. Each claim is held, failed or unchecked. The flow is drawn
in [What the verifier checks](how-it-works.md#what-the-verifier-checks). `<base>` is a replay's base, else `base=`,
else `baseRef`, else the first of `origin/main`, `main`, `origin/master`, `master`.

| Check | Compared against git | Outcome when it fails | next= |
| --- | --- | --- | --- |
| the brief | has `scope=`, a valid `base=` | **refused** | `fix the brief` |
| the report | a `[[report …]]` line in the hand-back | **no-report** | `resume`, then a respawn at the same tier; `verify sha=<sha>` when finished work is in the worktree |
| `branch` | `refs/heads/<branch>` or `refs/remotes/origin/<branch>` exists | **refuted** | `resume agent=<id>`, then a respawn at the same tier |
| `sha` | `rev-parse --verify <sha>^{commit}` resolves and is an ancestor of the branch | **refuted** (a missing sha is fabrication) | `resume agent=<id>`, then a respawn one tier up |
| `scope` | every path in `merge-base(<base>, sha)..sha`, and the outside delta for absolute entries, matches scope and no forbid | **refuted**; **unverified** for a prose scope or malformed amend | `resume agent=<id> — amend: [[amend v=1 scope+=<path> reason=…]]` naming the first stray path (outside delta: `remove <path>, or amend: …`); respawn at the same tier |
| `files` | `files=` equals that set: a moved file once at its new path; `dir/` and `dir/**` cover all changed under it, `dir/*` one level; an entry with nothing changed is invented | **refuted**, naming each missing or invented path | list the paths or revert the extras; respawn at the same tier |
| `gate` | HEAD is the sha and `git status --porcelain` is empty, then each `gateMap` id runs: exit 0 holds under `gate=pass`; a red gate holds under `gate=fail` | **refuted** with the last 8 lines; **unverified** for a dirty tree, HEAD not the sha, an unmapped id, exit 126 or 127 | `resume agent=<id>`, then a respawn one tier up |
| `red` | with `red_test` set: the file is in the tree, not empty, holds a failure marker, or (at most 2048 bytes, no marker) the red test run once at the head exits 0 and prints otherwise; byte-identical (sha-256) to an earlier attempt's, that one held | **refuted** for outside the tree, missing, empty or an unproven reuse; **unverified** for no `red=`, or no marker when the file is larger or the run at the head failed, did not run or printed the same | `resume agent=<id>`, then a respawn one tier up |
| `artefacts` | when reported: each exists and is not empty | **refuted**, naming the first; **unverified** if unreadable | `resume agent=<id>` |
| `pr` | `pr=none`, or `gh pr view <n> --json state` finds it | **refuted** | `resume agent=<id>`, then a respawn at the same tier |
| all held | | **consistent** | `accept`; with `review` on, `review` and a reviewer's spawn block ([Review](review-and-merge.md#review)) |
| none failed, one unchecked | | **unverified** | `resume agent=<id> — prove: <claim> (<reason>)`, reasons cut to 160 characters, while the budget lasts; else `check by hand — unverified is not a pass`. Only a gate stopped at the verifier's time limit: time it by hand, then `/dispatch <ID> --verify <sha>` (no attempt spent). Only a red file with no marker, under `gate=pass`: `check red by hand — … if it shows the red state, accept`, plus a resume while the budget lasts |

At the budget, a refuted, no-report or confirmed `gate=fail` verdict advises `stop — budget exhausted for <ID> (<n> attempts); raise budget= in <brief> to continue (the ladder resumes from attempt <n>, the brief is re-read)`.

Failure markers, in any case: `fail`, `error`, `not ok`, `✗`, `exit code 1`-`9`, `exit 1`, `AssertionError`,
`expected`. A held red claim shows the file's size and its first marker line with a failing word, else the first that
does not read as passing; a reused proof shows `attempt n's proof, reused`.

Scope is charged only for paths the worker wrote (MOD-217). The `tool.call` hook logs every path a recorded worker's Edit, Write, MultiEdit, NotebookEdit and Bash writes (the Bash paths as `bashWrites` reads them, resolved against the worker's cwd) under `delegation.writes.<agentId>`, capped at 2000 paths, and at the verdict the outside delta and a repo=here git delta count against `scope=` and `forbid=` only the changed paths in that log. The rest are listed on one line, `changed during the run, not by this worker: <paths>`, and never refute (so a scope refute that rests only on a brain's or a sibling's edit cannot happen, and a refute that rests on the worker's own paths still charges an attempt); `.delegation/**` under the repo root or any worktree is left out of every scope, forbid and delta, and a worktree card's own git delta is unchanged. When the log is empty but the delta shows writes (every write went through a script the lexer cannot see), the changed paths are the worker's, as before.

`consistent` means every machine-checkable claim matches git. It is not a review: nothing reads the diff, so read it
before you accept. A report declaring `gate=fail` is never accepted: its row reads `consistent (report gate=fail)` and
`next=` resumes the worker. A stored record or ledger line may say `verified`, which reads as `consistent`: in a script
parsing rows, `verdict=` or `.delegation/ledger.jsonl`, accept both words.

**Gate reruns.** A red gate whose every failure is the engine's `timed out after N ms`, none in a test file the delta
changed, runs once more: green, the claim says `gate green on rerun (first run: 2 timeouts in untouched tests)`; red,
it is refuted on the second run with a `note:`. Output not readable as a list of failing tests is never rerun. Engine
gates (`claude plugin test`) take turns within a session through the store lock `delegation.engineGate`, which expires
after the 9-minute gate timeout.

The changed paths go to `<root>/.delegation/<ID>/files.txt` before the gate runs; a gate command takes `{files}`,
`{worktree}` and `{outdir}` (`gateMap` in [Configuration](configuration.md#configuration)). Naming `{outdir}` with no
`outdir=` is "gate not re-run". The brief's gate line shows each gate id's command with `{worktree}` as the worktree
path, `{outdir}` as the card's output folder and `{files}` as `<scratch>/files.txt`, and says to write that file with
`git diff --name-only <base>` (one path a line) before running the gate, so the worker can run the command it is judged
by (#199). A `repo=here` or `repo=none` brief fills the same placeholders by the same rules.

**repo=none** checks only that every `files=` path exists in scope and outside forbid, that the gate (a map id or an
allowlisted command) exits 0, and, with an output folder, the outside delta and `artefacts=`. The row says `(no repo)`.

**Cardless hand-backs.** An Agent spawn with no brief that hands back a report gets `branch`, `sha`, `files` and `pr`
checked, and `scope`, `gate` and `red` unchecked (`no brief: no scope=/gate=/red_test= to check against`), so it is
never consistent. No gate runs. It is recorded with `adhoc: true`, advised `accept` or `check the diff`, never resumed,
and never counted toward a later dispatch's budget.

**A usage limit.** A hand-back with no report whose text holds `hit your weekly limit`, `usage limit`, `rate limit`,
`too many requests`, or a `429` beside http, status, error or api, any case, records `stop: rate_limited` (and
`resetsAt`) and reads `no-report (rate limited[, resets <time>])`. Until the next spawn, no queued task is made ready and
the fallback starts nothing; the row says `held: <task> queued; the last worker stopped on a usage limit at HH:MM[,
resets <time>]; dispatch it when the limit resets`.

### Escalation and resume

`next=resume agent=<id>` means SendMessage the worker the claim lines. A later failure advises a respawn, whose verdict
carries the spawn block for the brain to make. A refute on `sha`, `gate` or `red`, or a confirmed `gate=fail`, goes one
tier up; a first failed claim of `scope`, `files`, `branch` or `pr` holds the tier (`(held: a scope refute)`), and a
no-report always stays. `autoEscalate` performs a resume, never a spawn.

The brain may resume a consistent or unverified worker when the diff shows a problem: a hand-back at a new sha is the
next attempt (kind `resume`), judged even past the budget; at the same sha nothing changes.

### Look before you respawn

Before a respawn or a resume, the mod reads the worktree with `rev-parse HEAD`, `status --porcelain` and
`log --format=%H <base>..HEAD`. When HEAD is ahead of the base, the tree is clean and that sha is unjudged, nothing
starts: the attempt is recorded `work-present` (kind `verify`), and the row (and a respawn by hand) says:

```
work present at abcdef1 on agent/frontend/T-4: verify it (next=verify sha=<sha>)
```

A repo=here or repo=none task is not looked at; a refuted attempt still at its reported sha goes ahead.

`/dispatch <ID> --verify <sha>` (the tool's `verify`) judges that work with no spawn, from a synthetic report:
`files=` the delta, `gate=pass` (a red gate refutes), `red=` the newest `.delegation/<ID>/red-<n>.txt`. At the sha the
last attempt names it re-judges that attempt (`re-judging attempt n/b at <sha>`, no budget spent); otherwise it lands
on the work-present attempt or a new `verify` one. It takes no other option and is refused while the task's worker
runs.

### The git guard

The guard denies `commit`, `merge`, `cherry-pick`, `rebase` and `push` on a `guardBranches` branch, to the brain and
every recorded worker (naming its task): `chassis-delegation: no <verb> on <branch>; branch first (git checkout -b
agent/<domain>/<id>)`. It reads the branch in the command's folder, following `cd`, `-C` and an earlier `checkout -b`.
A push naming a guarded branch (`origin main`, `HEAD:main`, `--all`) is denied from anywhere; on a guarded branch, so
is one with no refspec, `HEAD`, the branch, `<branch>:<x>`, `--all` or `--mirror`. Tag pushes and other branches pass.
It reads command words, so a heredoc mentioning `git commit` never triggers it.

The same switch (`gitGuard`) guards gh: a recorded worker or reviewer may read GitHub with gh but not write to it
(`gh issue create|close|edit|comment…`, `gh pr merge|create|edit…`, `gh project item-add…`, a `gh api` with `-X` other
than GET or any field, and the like), or the plan on GitHub lies. The deny reads `gh guard: <task> may not run <command>;
gh writes are the brain's (land, merge finish)`. The brain and ad hoc agents are untouched.

The mod's own gh writes pass its allowlist as exact shapes, each bound to the session root's GitHub origin (`landRepo`); extra arguments, another repo or a body file elsewhere are refused with the shape text:

- `gh issue create --repo <landRepo> --title <t> --label type:<known> [--parent <n>] --body-file <file under .delegation/landed/>` and `gh project item-add <number> --owner <owner> --url https://github.com/<landRepo>/issues/<n>` (MOD-192: `land`, `land_plan`).
- `gh issue comment <1-9 digits> --repo <landRepo> --body-file <file under .delegation/status/>` (MOD-200: the started and verdict comments).
- `gh issue close <1-9 digits> --repo <landRepo> --comment <text not starting with ->` (MOD-200: merge finish and `land --supersedes`).

The two MOD-200 shapes also pass while `/delegation merge` runs, beside the one read-only `gh issue view`; every other gh is still refused then. There is no `gh issue edit` shape, and the Project is never written beyond the item-add.

### repo=here: the main checkout

`repo=here` is a git repo with no worktree: for a repo with no `origin`, a nested child repo, or evidence that lives
only in the main checkout. `/dispatch <ID> --here` (the tool's `here: true`, the card's `repo: here`) runs no fetch and
no `git worktree add`; the worker runs in the session root.

- **`base=`** is `--base`, else `baseRef`; a `baseRef` of `HEAD` is pinned to HEAD's sha at dispatch.
- **`ignore=`** is the config's `ignore` (default `.delegation/**`), `<cardDir>/**`, and the `files=` of other repo=here
  cards in flight here (a store record with no verdict yet).
- **Overlap.** A scope overlapping an in-flight repo=here card's (one glob's literal prefix matches the other) is
  refused before anything is written; `--force-overlap` (`forceOverlap: true`) dispatches with a warning. A shared
  resource queues instead.
- `--here` and `--replay` do not mix.

A repo=here worker reports `branch=<current>` and `sha=HEAD`, or the sha it committed.

The claims change: `branch` holds when it is the current branch (another is unchecked); `sha` holds for `HEAD`, `none`
or a sha that resolves; the gate runs on the tree as it stands, the clean-tree rule off. The delta is every path
`git status --porcelain=v1 --untracked-files=all -z` names (with a real sha, `merge-base(<base>, sha)..sha`), less
`ignore=` and `ignore+=`, less other in-flight cards' `files=` read at verify time; one line names each subtraction.

The verifier tells a path the worker wrote (its write log) from one a sibling or the brain changed, and lists the latter without judging them; still commit or stash an accepted repo=here card's files before the next hand-back,
or add them to `ignore`. For a nested child repo, start the session in the child; the mod reads only
`<root>/.chassis-delegation.json`, so `/delegation init` there writes the child's own files.

### Delegating into another repo

Give `repo` as the absolute path of another git checkout (`~` expanded) on the `card` or `dispatch` tool,
`/dispatch --repo <path>`, or a card's `repo:`. That task then uses that path wherever the mod touches a repo:

- **The card** goes to that repo's `cardDir` when it has a `.chassis-delegation.json`, else to
  `.delegation/cards/<repo folder name>/` here. Ids stay unique across both; `dispatch` finds the card by id.
- **The worktree** is `<path>-<ID>` on `agent/<domain>/<ID>`, cut from that repo's `origin/main` after
  `git -C <path> fetch -q origin main`. The brief, ledger and verdict row stay with the session.
- **The verifier**, delta, red file, gate and merged check use that worktree and that repo's `origin/main`.
- **The config** is that repo's own; without one the gate is the one `/delegation setup` would detect, as id `test`, or
  a command written out on the card tool. The dry run prints `repo: <path> (config: its own | none, gate: <cmd>)`.
- **The allowlist** takes the same git forms with `-C` set to that path, for that task only; the guard holds its
  `main` and `master`. Boards show the repo folder beside the task.

A relative path, the session's own repo, a folder with no `.git` or unsafe characters are refused in one line.
`--replay` is not supported here. `/delegation setup <path>` and `/delegation init <path>` (the tools' `path`) check
and scaffold that checkout, write nothing in the session root, never overwrite, and end with
`Next: call the card tool with repo set to <path>`.

### Research cards

A research card changes no code: its outputs land outside the repo. It is an ordinary card with four differences:

1. **`repo: none` or `repo: here`.** `none` runs in the session folder with no worktree, fetch or git; `here` shares
   the checkout and its running app.
2. **Scope names the output folder.** Scope and forbid may be absolute (`~` is home). The first absolute scope entry
   is the `outdir`, and the header gains `outdir=` and `scratch=`. Put deliverables in the output folder and helper
   files in scratch, never in the repo.
3. **The folders are listed before and after.** Dispatch lists (path, size, modification time) each absolute scope
   and forbid root into `delegation.outside.<ID>`; the hand-back lists them again. Every changed outside path must lie
   in scope and outside forbid. A refute names its delta:

   ```
   claim scope: failed — out-of-scope path: /out/notes/scratch.txt (outside delta)
   ```

   A missing root lists as empty; an unreadable one, or one an amend added, is unchecked. A root over 10000 files is
   judged by modification time against a dispatch watermark (at most 1000000 entries walked, else unchecked). A brief
   never dispatched gets `note: outside delta not checked: …`. Only named folders are watched: forbid what must stay
   untouched.
   The mod's own `.delegation/` folder and the cards folder in the session checkout are not counted in the outside
   delta, because the mod and the lead write there during a run; the claim says how many paths it ignored.
4. **The gate runs against the folder** through `{outdir}`, and the report adds `artefacts=` and `metrics=`.

A `repo: none` gate runs in the output folder, so give its script an absolute path or put it on `PATH`; a `repo: here`
gate runs in the checkout. The git claims apply only to `here`; a `none` report reads `branch=none sha=none red=none
files=none`.

### Exclusive resources and fan-out

**Resources.** A card may carry `resources: [live-app]`: free-form words, the same word meaning the same thing. A
worker holds them from spawn to hand-back or run end. A card whose resource a running or starting worker holds is
queued, slot free or not, with no spawn block, and keeps its place when asked again. Of several queued cards naming one
resource only the first is made ready; a waiting row takes no slot.

**Fan-out.** The `card` tool takes `lanes: [{ title, scope, doneWhen? }]` beside the shared fields (`title` and
`doneWhen` as the umbrella, `why`, `gate`, `tier`, `repo`, `redTest`, `budget`, `spend`, `resources`, `forbid`). It
writes one card per lane, all or none, with sequential ids: the shared fields, plus each lane's title, scope (its own
output folder) and done-when (the shared statements first, then the lane's own; a lane with none gets the shared ones alone). A shared `scope` beside lanes, or two lanes whose scopes overlap,
is refused, naming both. The dry run prints every lane's header; `dispatch: true` dispatches each in order, one spawn
block per lane, and the queue keeps lanes sharing a resource apart. For a notes file every lane wants, forbid it in all
of them and merge it yourself.

**Parent scope.** The `card` tool also takes `issue` (the task's GitHub issue), `parent` (the issue it hangs under),
`parentScope` and `parentForbid` (the parent's scope and forbid blocks); the last two need `parent`, and `issue` is
refused with `lanes`. The card frontmatter gains `issue: <n>` and `parent: <n>` after `status:`, only when given, and `parentScope: [<globs>]` right after `parent:` when `parentScope` was given; the brief then carries `parent_scope=` (see `scopeAmends within-parent`). With
`parentScope`, every scope glob must be contained in it, or the card is refused naming the first stray: a parent glob
equals the child's, or ends in `/**` with the child under that folder, or the child is one literal path the parent glob
matches. The written card's forbid is the caller's forbid, then `parentForbid`, then the scope globs of every open sibling
(a card with the same `parent:` that is not `status: merged` and has no `accepted` or `merged` ledger row). A sibling
scope that overlaps the new card's own scope is not forbidden; the card is refused instead, until that sibling merges.
