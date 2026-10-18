# Configuration

Every option, the debrief, and the host-command allowlist.

## Configuration

Four layers, lowest first; the higher one wins:

    default  <  repo (<repo>/.chassis-delegation.json)  <  yours (~/.claude/chassis-delegation/options.json)  <  host (a /config row)

- **default** is the built-in value the mod runs with (`maxWorkers` 2, `tierMap` economy→haiku, standard→sonnet,
  frontier→opus), never the manifest's empty placeholder.
- **repo** is the repo file. It holds only the repo-scoped options (the table below). The file is JSON; keys starting
  with `_` are comments. It is read at session start and again on every dispatch and verify.
- **yours** is your own options file, `~/.claude/chassis-delegation/options.json` (under `HOME`): `{ "<field>": <value> }`
  for any option. The mod reads it where it reads its other options, and rereads it when it changes, so a set or a hand
  edit applies from the next hook without a reload.
- **host** is a Claude Code settings row (the `/config` menu in a terminal, or `pluginConfigs["chassis-delegation"].options`
  in `settings.json`). A host value that is unset counts as absent: its empty placeholder (`""`, `0`, `false`), or the
  manifest default the host fills in for every option it does not list. A **locked** row (set by policy) always wins and
  cannot be changed.

Maps (`gateMap`, `agentTypes`, `tierMap`, `spendByTier`, `effortByTier`) merge key by key across the layers; other
options are replaced whole. A bad key or value is ignored, named in a toast, and logged; a malformed options file is
said once and ignored.

**Scope.** Every option is either *repo* (the 19 repo-file options in the first table: shared with everyone who works
in the repo) or *user* (the rest: yours alone). A repo option can also be set in your options file or the host; a
user option is never read from the repo file.

### /delegation config

`/delegation config` shows the options the mod really runs with, each with where its value came from, and sets them on
every screen (the VS Code extension has no `/config` rows for a folder-loaded mod; this command works there).

- `/delegation config`: the short view. Line 1 is `chassis-delegation: 49 options, <k> set (<a> repo, <b> yours, <c> host,
  <d> locked)`; then only the options not at their default, under their group headings, one line each
  (` maxWorkers = 3 (repo)`); then the how-to line. With nothing set: line 1, `all 49 at their defaults`, the how-to line.
- `/delegation config all`: every option, grouped, as `<field> = <value> (<source>)` with a one-line summary under it.
- `/delegation config <group>`: one group in the same shape, named by its first word in any case: `workers`,
  `checking`, `where`, `debriefs`, `evals`, `guards`, `display`.
- `/delegation config <field>`: one option in full: the whole value (a gate map lists each command on its own line),
  the summary, its kind and choices, an `in effect:` line when the mod does something other than the stored value
  says (`autoEval` on with no `evalCommand` → `in effect: off (no evalCommand)`; `maxWorkers` 0 → `in effect: 2`;
  `reviewTier` empty → `in effect: one tier below the worker`), its scope, and how to set or reset it.
- `/delegation config <field> <value>`: sets it. With no host row for the option the value goes to your options file and
  the answer is `<field> = <value> (yours)`; with a host row it goes to that row (`(host)`). A host that refuses because
  it has no row falls back to your options file; any other refusal is `<field> was not set: <reason>`.
- `/delegation config <field> default`: takes it out of your options file (or sets the host row back to its default).
- `/delegation config repo <field> <value>`: writes a repo-scoped option into `<root>/.chassis-delegation.json`, keeping
  the file's other keys and `_` comments, as 2-space JSON; the answer is `<field> = <value> (repo)`. A user option is
  refused: it is personal, so it goes in your options file.
- A locked option answers `<field> is locked by policy`.

Names match in any case (`maxworkers` finds `maxWorkers`). An unknown name answers `no option "<typed>"; did you mean
<field>?` when one is close (an edit distance of 3 or less, or the same first 4 letters), else `no option "<typed>";
/delegation config all lists them`. The words `all`, `repo`, `default` and the group words are never option names.

Values are shown as a person reads them: on/off; `20 min`, `6 h`; `$10` (`no cap` for 0); `200K`; maps as
`economy→haiku, standard→sonnet`; a gate map as its ids (`validate, node, test`); lists comma-joined; `(none)` for
empty. A line is at most 100 characters, cut with `…`; the one-option view holds the whole value. Values are typed the
same way: `on`/`off`/`yes`/`no`/`true`/`false`, `20`, `500K`, `$3`, `no cap`, `a, b` for a list, `economy=sonnet,
frontier=opus` (or JSON) for a map, `id=command; id=command` for a gate map, `""` for empty.

Repo-scoped options (repo file, your options file, or the host):

| Key | Repo file | Your options / host | Default | What it does |
| --- | --- | --- | --- | --- |
| `gateMap` | object | JSON string | `{}` | gate id → command, run by argv with no shell. `{files}` is files.txt, `{worktree}` the tree the gate runs in, `{outdir}` a research card's output folder; chain with ` && `. A command the allowlist would refuse is dropped at load and named, and shown with its reason under gateMap in `/delegation config` (the card tool says `gate "<id>" refused: <reason>` for a card that names it); a command with variables (`env FOO=1 make`) goes in a script file, and the script is the gate. No `sf`, `git`, `gh`, network, `rm` or publish. An id not in the map is "gate not re-run" (unverified) |
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
| `delegateOnly` | `off` \| `warn` \| `deny` | string (`off` = unset) | `off` | keeps an opus or fable brain from doing worker work itself (GH-113; see [The brain's spend](spend.md#the-brains-spend)) |
| `review` | `off` \| `on` \| `on-frontier` | string (`off` = unset) | `off` | a fresh read-only reviewer reads each consistent hand-back against the diff before `next=accept` (MOD-21; see [Review](review-and-merge.md#review)). `on-frontier` reviews frontier and premium cards only; `off` changes nothing anywhere |
| `reviewTier` | `economy` \| `standard` \| `frontier` \| `premium` | string | `""` (one tier below the worker's) | the tier the reviewer runs at; empty = one below the worker's, never below economy (see [Review](review-and-merge.md#review)) |

User-scoped options (`/delegation config <field> <value>`, your options file, or the host; never the repo file):

| Key | Default | What it does |
| --- | --- | --- |
| `autoEscalate` | `false` | perform the resume instead of advising it; a respawn is always advice (its verdict carries the spawn block) |
| `wakeOnVerdict` | `false` | off: a verdict row is posted and nothing starts a turn of the brain's own; the brain calls the `verdict` tool in the hand-back turn (MOD-64). On: after a verdict row, also submit it with its next action as a turn of the brain's own, never as your words (MOD-15; see **Waking the brain** under the contracts) |
| `postFindings` | `ask` | `ask` asks once after a debrief whether to post its new mod findings (nothing without a yes); `auto` posts them at once, scrubbed, at most 5 a debrief, and only with `redact` set; `off` neither asks nor posts. `/config` only, never the repo file (MOD-31; see [Posting the findings](#posting-the-findings)) |
| `readyFallbackMinutes` | `10` | minutes a `ready:` worktree row may wait for the brain before the mod starts it itself, recorded with `source: fallback` and running outside the mod's hooks; `repo=here` and `repo=none` rows always wait; `0` = off (MOD-15; see **The queue**) |
| `waitStallMin` | `20` | minutes a briefed worker may wait without a hand-back before the mod says once `<id> stalled <n> min; resume or stop it`; the first wait wakes the brain once (`<id> waiting on <resource> held by <holder>`, else `<id> waiting on its own background job (<n> min)`) and repeats in the same state are held; `0` = no stall row (MOD-99, #161) |
| `applyAmends` | `true` | append `scope+=` / `forbid+=` blocks to the brief before verifying |
| `defaultBudget` | `3` | attempts when the brief names no budget: spawn, resume, respawn |
| `verdictVerbosity` | `line` | `line`: one row; `full`: the row plus every claim line; `silent`: a toast only |
| `briefDir` | `""` | where briefs go; empty means `<root>/.delegation/briefs/`, and Claude Code's session scratchpad only when the root is not writable |
| `ledgerFile` | `true` | append one JSON line per judged attempt to `<root>/.delegation/ledger.jsonl` |
| `gitGuard` | `true` | the git guard on Bash |
| `classifierSecondOpinion` | `true` | the card tool's dry run asks the classifier and prints its tier beside the card's; the answer is kept on the card's first attempt record as `classifierTier` |
| `modelGlyphs` | `""` | the glyph that marks each model on the host's subagent row and every mod row: `alias=glyph` pairs (`sonnet=🟦`), `off` for none, empty for the built-in set (haiku 🟢, sonnet 🔵, opus 🟣, fable 🟠, other ⚪) |
| `dashboardBand` | `true` | the band above the prompt while a worker is live, queued or owed a verdict (see [Dashboard](guide.md#dashboard)) |
| `guardBranches` | `main,master` | the branches it holds |
| `autoDebrief` | `true` | write a debrief in the background at a clean stop |
| `debriefIdleMinutes` | `20` | minutes without a turn before the clean-stop check |
| `debriefMinNewLines` | `25` | the harness breadcrumb lines a debrief needs, when a breadcrumb file exists |
| `debriefMinEvents` | `5` | without breadcrumbs, the corrections, tool denials and refutes a debrief needs |
| `debriefCooldownHours` | `6` | hours between two debriefs of one session, counted from the latest start, a debrief whose check failed included (MOD-91); two failed checks on one window stop the automatic start (see [The debrief now](#the-debrief-now)) |
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

**A failed check (MOD-91, #156).** A debrief whose check fails does not move the record, so its window is covered again, but it counts as an attempt: the cooldown counts from its start, and the second failed check on the same window (the same start line) stops the automatic start with one row, `debrief stopped: the check failed twice on the window from line <n>; run /delegation debrief to retry by hand`. `/delegation debrief` still runs, and a clean check clears the count. The check's lines are kept in `<debrief>.check.txt`, and the file as the agent wrote it in `<debrief>.orig.json` when the check rewrote it, both beside the debrief; the session row names them.

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

- `apply` looks where `debrief post` does (this session's record, `<root>/.delegation/debriefs/`,
  then this session's debriefs under `~/.claude/harness/debriefs/`; MOD-80) and lists the latest debrief's proposals, numbered, each as `[n] <target> ·
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

1. `/delegation debrief post` reads the findings file of this session's debrief (the
   debrief record's path, which is where your own debrief skill wrote it, usually
   under `~/.claude/harness/debriefs/`), else the latest `.findings.json` under
   `<root>/.delegation/debriefs/`, else the newest one under
   `~/.claude/harness/debriefs/` whose debrief belongs to this session (that folder is
   shared by every repo, so another session's file is never picked). When none is
   found it names every folder it looked in (MOD-80). It prints every finding in full, scrubbed
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
option is empty, `/delegation debrief post <n|all>` files nothing
and says: `run /delegation config redact <words>, the product, customer, employer and repo
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
  post without an explicit yes in your own words; with `wakeOnVerdict` on (it is off by default) the
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

While `/delegation merge` runs, and only then, the list also takes that command's local git writes:
exact shapes bound to the one task, with every push, `gh`, `curl`, `sf` and `wget` refused first.
See [Merging a card](review-and-merge.md#merging-a-card).

The mod never runs your eval, your tests or a deploy itself. The eval runner
and the debrief are ordinary subagents, under the session's own permissions.
