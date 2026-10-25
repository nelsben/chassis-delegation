# Configuration

Every option, the debrief, and the host-command allowlist.

## Configuration

Four layers, lowest first; the higher one wins:

    default  <  repo (<repo>/.chassis-delegation.json)  <  yours (~/.claude/chassis-delegation/options.json)  <  host (a /config row)

| Layer | What it is |
| --- | --- |
| default | The built-in value. |
| repo | `.chassis-delegation.json`; `_` keys are comments; repo-scoped options only; reread on every dispatch. |
| yours | `~/.claude/chassis-delegation/options.json`, `{ "<field>": <value> }` for any option; reread when it changes. |
| host | A `/config` row, or `pluginConfigs["chassis-delegation"].options` in `settings.json`. An unset row (`""`, `0`, `false`) counts as absent. A locked row always wins. |

Maps (`gateMap`, `agentTypes`, `tierMap`, `spendByTier`, `maxWorkersByTier`, `effortByTier`, `effortNudge`) merge key by key; other options are replaced whole.
A bad key or value is ignored and named in a toast.

### /delegation config

Shows the options in force and where each value came from; works in VS Code.

| Command | What it does |
| --- | --- |
| `/delegation config` | Short view: `chassis-delegation: 49 options, <k> set (<a> repo, <b> yours, <c> host, <d> locked)`, then only non-default options by group. Nothing set: `all 49 at their defaults`. |
| `/delegation config all` | Every option, grouped: `<field> = <value> (<source>)`. |
| `/delegation config <group>` | One group: `workers`, `checking`, `where`, `debriefs`, `evals`, `guards`, `display`. |
| `/delegation config <field>` | One option in full, with an `in effect:` line when the mod acts differently (`maxWorkers` 0: `in effect: 2`). |
| `/delegation config <field> <value>` | Sets it: your options file (`(yours)`), or the host row if there is one (`(host)`). Refusal: `<field> was not set: <reason>`. |
| `/delegation config <field> default` | Removes it from your file or resets the host row. |
| `/delegation config repo <field> <value>` | Writes a repo-scoped option to `<root>/.chassis-delegation.json` as 2-space JSON, keeping other keys. A user option is refused. |

- A locked option answers `<field> is locked by policy`.
- Names match in any case. An unknown name answers `no option "<typed>"; did you mean <field>?`.
- Values show as `20 min`, `$10` (`no cap` for 0), `200K`, `economy→haiku`, `(none)`. Input accepts `on`/`off`, `500K`, `$3`, `economy=sonnet,frontier=opus` or JSON, `id=command; id=command`.

### Options

**repo** options can come from the repo file, your file or the host; **user** options from the last two. Set any with `/delegation config <field> <value>` or a `/config` row.

| Key | Scope | Default | What it does (values) |
| --- | --- | --- | --- |
| `gateMap` | repo | `{}` | gate id → command, run by argv with no shell. `{files}`, `{worktree}`, `{outdir}` are filled in; chain with ` && `. Refused commands are dropped and named. An id not in the map is "gate not re-run". The key `_empty` (unlike other `_` keys, which are comments) names a gate id of the same map: when a hand-back changes no file, the verifier and `/delegation merge` run that gate instead of the card's, and the verdict says `gate: <card ids> → _empty <id> (no changed files)`. A value naming no id in the map is named in the config errors and ignored. |
| `agentTypes` | repo | `{}` | card domain → subagent type. Unnamed: same-named type, else `general-purpose`. |
| `tierMap` | repo | `{economy: haiku, standard: sonnet, frontier: opus}` | tier → alias. `fable` is never spawned: it becomes opus. |
| `domains` | repo | `frontend, backend, ops, dispatcher, cross, shared` | domains a card may name. |
| `spendByTier` | repo | `{economy: 3, standard: 10, frontier: 25}` | dollars per attempt by tier; `0` = no ceiling. Written as `spend=` unless the card sets `spend:`. |
| `effortByTier` | repo | `{economy: low, standard: medium, frontier: high}` | effort by tier: `low`, `medium`, `high`, `xhigh`, `max`; `0` or empty = engine default. A card's `effort:` wins. |
| `effortNudge` | repo | `{cards: "<cardDir>/**", up: high, down: medium}` | the brain's own effort, said on rows (never set): a hand-back whose report names an artefact the `cards` glob takes ends `lead: judgment next, raise to <up>`; the next accept of another task, or the next started row that is not a resume, ends `lead: back to <down>`. `cards` unset means the card folder (`<cardDir>/**`, `agents/tasks/**` on defaults); an explicit glob wins; `cards: ""` turns it off. |
| `maxWorkers` | repo | `2` | briefed workers at once; the rest queue (`ready:` when a slot frees). |
| `maxWorkersByTier` | repo | `{}` | a second, lower ceiling under `maxWorkers` for the briefed workers of one tier (`economy`, `standard`, `frontier`, `premium`), each a whole number of 1 or more; a tier not named takes the total alone, and `maxWorkers` `0` still means 2, so raise `maxWorkers` too for a tier above 2. A row whose tier is full waits (`queued: … when a frontier slot frees`) while a row of another tier starts. Example: `{frontier: 2, standard: 5}`. |
| `worktreeRoot` | repo | `""` (siblings `<root>-<id>`) | worktrees go to `<worktreeRoot>/<repo name>-<id>`. |
| `cardDir` | repo | `agents/tasks` | card folder relative to the root (no leading `/`, no `..`). `--replay` stays on `agents/tasks/`. |
| `briefTemplate` | repo | `hooks/templates/brief.md` | brief template file. |
| `briefExtra` | repo | `""` | lines added to every brief. |
| `briefLocal` | repo | `""` | a gitignored rules file, relative to the repo root or absolute. Its text up to the first `### allow:` heading is copied into every brief after `briefExtra`, under `## Local rules (not for debrief)`; a missing file renders nothing; a tracked or unreadable file refuses the dispatch. The file is free text, then optional `### allow: <id>` blocks (each to the next `###` heading): a card with `allow: [<id>]` gets that block as `## Exception for this card: <id>`, and the brief header and the verdict row carry `allow=<id>`. An id with no block, or `allow:` with no `briefLocal`, refuses the dispatch. The debrief skips both sections and drops any finding that quotes them. |
| `evalCommand` | repo | `""` | what the T1 eval runs; empty = no eval. |
| `evalLiveCommand` | repo | `""` | what the T2 (live, paid) runner runs. |
| `autoEval` | repo | `false` | run `evalCommand` once per new `origin/main` sha while idle. Needs `evalCommand`. |
| `baseRef` | repo | `""` (`origin/main`, `main`, `origin/master`, `master`) | where the delta starts when a brief names no `base=`. |
| `ignore` | repo | `[".delegation/**"]` | globs dropped from a `repo=here` delta. `[]` ignores nothing. |
| `issueRepo` | repo | the manifest's `repository` | `owner/name` where findings are filed. `""` in the repo file turns posting off. |
| `delegateOnly` | repo | `off` | `off`, `warn`, `deny`: stops an opus or fable brain editing source. See [The brain's spend](spend.md#the-brains-spend). |
| `review` | repo | `off` | `off`, `on`, `on-frontier` (frontier and premium cards only): a read-only reviewer checks each hand-back. See [Review](review-and-merge.md#review). |
| `reviewTier` | repo | `""` (one below the worker, not below economy) | `economy`, `standard`, `frontier`, `premium`: the reviewer's tier. |
| `autoEscalate` | user | `false` | perform the resume instead of advising it. |
| `wakeOnVerdict` | user | `false` | on: a verdict row also starts a brain turn. |
| `postFindings` | user | `ask` | `ask`, `auto`, `off`; `/config` only. See [Posting the findings](#posting-the-findings). |
| `readyFallbackMinutes` | user | `10` | minutes a `ready:` row waits before the mod starts it itself. `0` = off. |
| `waitStallMin` | user | `20` | minutes without a hand-back before `<id> stalled <n> min; resume or stop it`. `0` = off. |
| `applyAmends` | user | `true` | append `scope+=` / `forbid+=` blocks to the brief before verifying. |
| `defaultBudget` | user | `3` | attempts when the brief names no budget. |
| `verdictVerbosity` | user | `line` | `line`, `full` (plus claim lines), `silent` (toast). |
| `briefDir` | user | `""` (`<root>/.delegation/briefs/`) | where briefs go. |
| `ledgerFile` | user | `true` | append to `<root>/.delegation/ledger.jsonl`. |
| `gitGuard` | user | `true` | the git guard on Bash. |
| `guardBranches` | user | `main,master` | branches the guard holds. |
| `classifierSecondOpinion` | user | `true` | the card dry run prints the classifier's tier. |
| `modelGlyphs` | user | `""` (built-in set) | `alias=glyph` pairs, or `off`. |
| `dashboardBand` | user | `true` | the band above the prompt. See [Dashboard](guide.md#dashboard). |
| `driveWarn` | user | `true` | the brain's repeat-command row. See [Spend controls](spend.md#spend-controls). |
| `driveWarnTokens` | user | `200K` | context past which that row can appear. |
| `freshSessionTokens` | user | `400K` | context at which the brain is told to start a fresh session. `0` = off. |
| `autoDebrief` | user | `true` | debrief in the background at a clean stop. |
| `debriefMode` | user | `notes` | `notes` or `transcript`: at a clean stop, ask for your review note, or run the background transcript debrief. See [The debrief from your review note](#the-debrief-from-your-review-note). |
| `debriefIdleMinutes` | user | `20` | idle minutes before the clean-stop check. |
| `debriefMinNewLines` | user | `25` | breadcrumb lines needed. |
| `debriefMinEvents` | user | `5` | without breadcrumbs: events needed. |
| `debriefCooldownHours` | user | `6` | hours between debriefs, from the latest start (failed checks count). |
| `debriefAgent` | user | `general-purpose` | the debrief's subagent type. |
| `evalIdleMinutes` | user | `10` | idle minutes before the eval checks `origin/main`. |
| `evalLive` | user | `false` | run T2 after a clean T1, once a session, within the cap. |
| `evalLiveMaxUsd` | user | `1` | what one T2 run may spend. |
| `sessionUsdCap` | user | `50` | T2 never starts past this session cost. |
| `evalAgent` | user | `general-purpose` | the eval runner's subagent type. |
| `probeModels` | user | `false` | once a day ask each `candidateIds` model one token. |
| `candidateIds` | user | `""` | model ids to probe. |
| `redact` | user | `""` | words the findings scrub replaces; `/config` only, never the repo file. |

### The debrief from your review note

With `debriefMode` `notes` (the default), a clean stop runs no agent. Once a round of verdicts has closed (the verdicts since the last
prompt row or ingest) the mod adds one row: `a round of tasks closed (N verdicts): write the review note, then /delegation debrief ingest <note.md>`,
under the same idle and cooldown rules as before. `autoDebrief` `false` silences it. `debriefMode` `transcript` keeps the background agent that mines the session.

In the note, put a heading `For the mod owner` (any level) and one top-level bullet per finding:

```
## For the mod owner

- P2 The verifier counted a late hand-back as new work. It should not.
  Evidence: verdict row T-1 refuted at abc1234
- The dispatch queue gave no row when a slot freed
```

A bullet starting `P1`, `P2` or `P3` sets the severity (else `P3`); the title is its first sentence; the surface is the first mod surface the bullet names
(else `debrief`); nested lines starting `Evidence:` are the evidence (else the bullet itself). The section ends at the next heading of the same or a higher level.

`/delegation debrief ingest <note.md>` (a path under the session root, or absolute) scrubs the findings as a debrief's are, writes
`<root>/.delegation/debriefs/YYYY-MM-DD-note-<name>.findings.json` and prints the lines. Nothing is posted: `/delegation debrief post` lists them, and
`/delegation debrief post all|1,3` posts them ([Posting the findings](#posting-the-findings)). A note without the section prints `debrief ingest: <name> has no "For the mod owner" section; nothing written`.

### The debrief now

A debrief runs `~/.claude/commands/debrief.md` if present, else `hooks/templates/debrief.md`. It writes
`<root>/.delegation/debriefs/YYYY-MM-DD-<slug>.json`.

| Command | What it does |
| --- | --- |
| `/delegation debrief` | Starts the background debrief now, skipping idle, cooldown and friction tests. One at a time. Prints agent id and mode (`breadcrumbs` or `events`). |
| `/delegation debrief post` | Shows the drafts as they would post. Posts nothing. |
| `/delegation debrief post <n,m\|all>` | Posts the named `new` findings ([Posting the findings](#posting-the-findings)). |
| `/delegation debrief apply` | Lists the latest debrief's proposals as open, `done:` or `dismissed:`. None: `no proposals in <path>`. |
| `/delegation debrief apply <n>` | Prints proposal n with one instruction for the brain: a diff on your yes, or a card for mod code. |
| `/delegation debrief apply <n> done [note]`, `… dismiss [reason]` | Records `{ n, status, note, at }` in `proposals_status` of the `.findings.json`; later prompts carry `already done:` / `dismissed:`. |

The mod never writes `CLAUDE.md`, memory, commands or agents.

| Topic | Rule |
| --- | --- |
| Friction signal | With breadcrumbs (`~/.claude/harness/breadcrumbs/<session>.jsonl`): lines past the `.done` watermark. Without: a prompt starting no, stop, don't or actually; disagreement (`i disagree`); a challenge question or `bug?`; a false-report verdict; a denied tool call; a refuted verdict. |
| Prompt facts | One per line, kind plus ISO time (`denial 2026-10-10T16:27:14Z: Bash: git push`), only those inside the window. A window of only session-boundary lines spawns nothing (`nothing to debrief in lines a-b (session boundaries only)`). |
| Check at hand-back | The record moves only when nothing was stripped or flagged. Each `corrections`, `tool_denials`, `outcomes` entry carries an `at`; one outside the window `(watermark, end]` is stripped, one with none counted. Prints `debrief check: clean` or counts. |
| Transcript match | An in-window correction whose quote (12+ characters) is found in a user message within two minutes in the session transcript gets `source: transcript` (`transcript-untimed` when only the quote matches). |
| Failed check | A second failure on the same window stops the automatic start: `debrief stopped: the check failed twice on the window from line <n>; run /delegation debrief to retry by hand`. A clean check clears it. |
| Watermark | After a clean check the mod messages the agent `debrief check: clean. Mark your watermark now, as your instructions say, and stop.` The mod never writes `.done`. |
| Surfaces | `mod_findings[].surface` is `card`, `dispatch`, `brief`, `verifier`, `gate`, `dashboard`, `debrief`, `update`, `accept`, `config`, `allowlist` or `scheduler`. Anything else goes to `host_findings`. |

Both prompts ask for `mod_findings`: `{ kind: went_well | went_wrong, surface, fault_class: bug | design | docs | cost | performance,
severity: P1 | P2 | P3, title, body, evidence }`. The mod scrubs them into `<same name>.findings.json` and prints `[1] went_wrong · P2 · <surface> · <title>`, then `drafts: <path>`, or `no findings`.

`mod_findings` go to the tracker after your go. `host_findings` are set aside and counted, never listed or filed. `proposed_harness_changes`, `harness_gaps` and `stale_memory` are for you: printed after the findings (`proposals: n for you to review (never posted)`), never written to the `.findings.json`.

**The scrub** (`hooks/lib/redact.ts`) turns `/Users/<name>/…` and `/home/<name>/…` into `<home>/…`, the root folder name and origin URL into `<repo>`,
git `user.name` and `user.email` into `<person>`, and each `redact` word (whole word, any case) into `<redacted>`.
`redact` is never read from the repo file: it is committed, and would publish the names.

### Posting the findings

`issueRepo` defaults to the `repository` (else `homepage`) in the mod's `.claude-plugin/plugin.json`. `"issueRepo": ""` turns posting off;
omitting the key does not. Posting takes two steps:

1. `/delegation debrief post` reads this session's findings file (the debrief record's path, else the latest under
   `<root>/.delegation/debriefs/`, else under `~/.claude/harness/debriefs/`).
   Each finding prints scrubbed and numbered, `new` or `covered by #<k>` (an issue with the same surface and 3+ title words).
2. `/delegation debrief post 1,3` (or `all`) runs one `gh issue create` per `new` finding and records `#<n> <url>`.
   A covered finding is skipped unless named, then commented on. A post is refused if any `redact` word survives.

While `redact` is empty, `post <n|all>` files nothing and says `run /delegation config redact <words>, the product, customer, employer and repo names this session must never publish, then post again`.
`postFindings` is never read from the repo file: posting runs `gh` as you.

| Mode | Behaviour |
| --- | --- |
| `ask` (default) | After a debrief with a new finding: `post n findings to <issueRepo>? say yes to post them all, scrubbed, or name some (/delegation debrief post 1,3); nothing is posted without a yes`. |
| `auto` | Posts every new finding after the scrub, at most 5 per debrief; covered ones are skipped. With `redact` empty it falls back to `ask`. |
| `off` | No question, no posting; drafts are still written. |

## The host-command allowlist

`$.process.run` runs without a permission prompt, so every argv passes `hooks/lib/allow.ts` first. A refused argv never runs;
the log says `chassis-delegation: refused argv [...] (<reason>)`.

| Allowed argv | Notes |
| --- | --- |
| `git [-C <dir>] diff\|merge-base\|rev-parse\|status\|log …` | No `--output`, `--ext-diff`, `--textconv`. |
| `git [-C <dir>] worktree list [--porcelain\|-v\|--verbose\|-z]`, `git [-C <dir>] fetch [-q] origin main` | Exact. |
| `git -C <plugin root> merge --ff-only origin/main` | Exact; the loaded folder; `/delegation update`. |
| `git -C <root> worktree add -q -b agent/<domain>/<id>[-replay] <worktree> <origin/main\|7-40 hex sha>` | `<worktree>` is `<root>-<id>[-replay]` or `<worktreeRoot>/<repo name>-<id>[-replay]`. |
| `git -C <task repo> worktree add -q -b agent/<domain>/<id> <task repo>-<id> <origin/main\|sha>` | `<task repo>`: the absolute path the task names. |
| `git -C <root> ls-tree --name-only <sha> agents/tasks/`, `git -C <root> show <sha>:agents/tasks/<id>-<name>.md` | Exact; `/dispatch --replay`. |
| `gh pr list\|view …` | No `--web`. |
| `gh issue create\|comment\|list` | The `issueRepo` only. |
| `claude plugin validate\|test <absolute folder>` | Exact. |
| A gate-map command, word for word | `{files}`, `{worktree}`, `{outdir}` filled by absolute paths. |

Refused: `sf`, `curl`, `rm`; `git push`, `commit`, `reset`, `checkout`; other git global options; `gh pr merge`, `gh pr create`;
any script or package command the gate map does not name exactly.

A gate-map command is also refused for shell syntax; a first word of `sf`, `curl`, `ssh`, `sudo`, `rm`, `git`, `gh`, `eval`, `env` or the like;
a shell run with a flag; or a package manager's publish or login verb. The check also runs at load, so a refused command is dropped and named then.

During `/delegation merge` only, the list also takes that command's local git writes, bound to the one task; push, `gh`, `curl`, `sf` and `wget` stay refused.
See [Merging a card](review-and-merge.md#merging-a-card). The mod never runs your eval, tests or a deploy itself.
