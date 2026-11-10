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

Maps (`gateMap`, `mergeCheckMap`, `agentTypes`, `tierMap`, `spendByTier`, `maxWorkersByTier`, `effortByTier`, `effortNudge`) merge key by key; other options are replaced whole.
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
| `mergeCheckMap` | repo | `{}` | gate id → command merge runs in the task's worktree before it rebases, for a card whose `gate:` lists that id (a card's own `merge_check:` wins). `{card}`, `{sha}` (the full head) and `{worktree}` are filled in; run by argv with a 10-minute timeout. A non-zero exit refuses the merge and names the command and the last 15 lines of its output. Commands the gate map would refuse are dropped and named. See [Merge checks](review-and-merge.md#merge-checks). |
| `agentTypes` | repo | `{}` | card domain → subagent type. Unnamed: same-named type, else `general-purpose`. |
| `tierMap` | repo | `{economy: haiku, standard: sonnet, frontier: opus}` | tier → alias. `fable` becomes opus unless `allowFable` is on. |
| `allowFable` | user | `false` | MOD-269, the fable break-glass. Off: a card or reviewer that asks for fable (tier `premium`, a card `model: fable`, a `tierMap` entry of fable, a caller's `model` of fable, `reviewTier` `premium`) runs on opus, and the spawn notice ends with how to allow it. On: it runs on fable, marked `fable (break-glass)` with the 🟠 glyph on its spawn, hand-back and verdict rows. Nothing else resolves to fable. Fable costs about 2.5x opus; the per-attempt spend ceiling still applies (`premium` uses its own `spendByTier` entry, else the frontier one). |
| `domains` | repo | `frontend, backend, ops, dispatcher, cross, shared` | domains a card may name. |
| `spendByTier` | repo | `{economy: 3, standard: 10, frontier: 25}` | dollars per attempt by tier; `0` = no ceiling. Written as `spend=` unless the card sets `spend:`. |
| `effortByTier` | repo | `{economy: low, standard: medium, frontier: high}` | effort by tier: `low`, `medium`, `high`, `xhigh`, `max`; `0` or empty = engine default. A card's `effort:` wins. Levels above `maxEffort` are clamped to it. |
| `maxEffort` | user | `high` | MOD-271, the cap on every effort the mod applies: a card's `effort:`, the card tool's `effort`, `effortByTier` and `reviewEffort`. `xhigh` and `max` are clamped to it unless you raise it (`/delegation config maxEffort max`). A clamp is shown once on the spawn row as `effort high (capped from max)`. |
| `explore` | repo | `0.2` | MOD-274, 0 to 0.5: the share of first attempts that run one step below the default, so the ledger learns what effort and model each kind of card needs. Every card has a class, `kind/size` (`feature/large`): the kind is the card's `kind:` field (`release`, `docs`, `bug`, `test`, `feature`) or inferred (a scope of only `CHANGELOG.md`, `docs/**` or version files is `release` when the title starts `Release` or names a version, else `docs`; a title starting `Bug` or `Fix` is `bug`; a scope of only `tests/**` is `test`; else `feature`), the size is `small` when the economy hint would fire. An eligible card is attempt 1 with no `effort:`, `tier_reason:` or `effort_reason:`, tier `standard` or `frontier`, kind not `release` or `docs`; it explores when `fnv1a32(task id) mod 1000 / 1000` is below `explore`. The step is down only, one axis: the effort one level down, or on a standard card the tier one down at the same effort (a frontier card only steps effort); a frontier or premium card always has a `tier_reason:` (MOD-276), so it does not explore. MOD-277: one target at a time: a standard card explores the tier-down pair (economy at the same effort) until that pair has 30 counted explored cards in the class, then the effort-down pair; a frontier card has its one effort-down pair. A step `maxEffort` would change is skipped. The started row says `effort low · explore from medium`, and the attempt, spawn and verdict rows carry `explore`. A refuted or no-report exploratory attempt does not escalate and is not counted against `budget=`, so attempt 2 runs at the card's own tier and effort; MOD-277: the ledger counts an explored card and a default card the same way (confirmed when any attempt confirmed, usd over all its attempts, so a rescue's cost lands on the pair that failed), and a card with no class on its rows takes the class of its card file in the card folder. This repo's own `.chassis-delegation.json` sets `explore` to 0.3 for the burn-in month; the shipped default stays 0.2. The dry run's `history feature/large: …` line shows how each pair did in the class (all classes when it has no rows). On a repo with few cards a day only the largest class gathers enough cards to learn from; the rest stay `thin`. `0` never explores. |
| `maxFrontierShare` | repo | `0` | MOD-276, 0 to 1, `0` = off. Above 0, `/dispatch` (and its dry run) adds `warning: frontier share 0.73 is above maxFrontierShare 0.3` when the share of frontier and premium cards among the open cards of the card folder (status queued, dispatched or held, counting the card being dispatched) is greater than it. It warns only, never refuses. Every dispatch also prints `plan tiers: standard 5 · frontier 16 · economy 1 (frontier 16/22)` (left out with one open card), and the `tree` tool prints the same line for its in flight cards. A frontier or premium card needs a `tier_reason:` or `/dispatch` refuses it; a card with no `tier:` is standard, as before. The tier is raised only after a refuted attempt, so Opus runs where Sonnet failed. |
| `adaptive` | repo | `suggest` | MOD-275, `off` or `suggest`. `suggest`: the `card` tool's choice line adds `suggest sonnet/low for feature/large (n 24, lower bound 91% vs default 96%, $0.52 vs $0.89 per confirmed card)` when a pair has passed often and cheaply enough for the card's class, and the brain decides; nothing is changed on its own. `off`: no suggestion line. `apply` is reserved: naming it is refused with `adaptive: apply is not shipped yet`; it waits for about four weeks of real suggestions to be replayed. The evidence is the class's attempt-1 cards that were eligible to explore (no `effort:`, `tier_reason:` or `effort_reason:`, standard or frontier), so the default pair's cards and the explored pairs' are alike; a pair's rate is the `history` rate (a card that never confirmed and whose every verdict is a refute on scope, files, branch or pr, a no-report or unverified is left out, in both arms alike; MOD-277). A pair is suggested when it has at least 20 cards, the Wilson 90% lower bound of its pass rate is at least the default pair's rate minus 5 points, none of its last 10 cards failed (a sudden drop withdraws it long before the lifetime bound would), and its mean usd per confirmed card is under the default's by more than one standard error of its own mean. The cheapest such pair is shown; the default pair never is. A raw rate would select noise: a card's cost has a coefficient of variation near 0.9 and a pair's rate at 10 cards a standard error near 9 points. So expect a suggestion for the one or two largest classes only; the rest stay quiet. `explore` must be above 0 for any pair but the default to gather cards. A fixed seeded simulation in `tests/node/adaptive.node.mjs` proves the rule can say no, and `tests/node/adaptive-replay.mjs` replays it over a real `.delegation/ledger.jsonl`. |
| `issueMatch` | repo | `suggest` | MOD-287, `off`, `suggest` or `require`. A card with no `issue:` is matched against the planned tasks (landed or in a plan file) whose paths overlap its scope, at most three. `suggest`: the `card` tool and `/dispatch`'s dry run print one line per candidate (a closed issue is never suggested, and an issue whose state cannot be read is kept), `planned task #<n> "<title>" (under #<p>) overlaps this scope; pass issue: <n>, parent: <p>`, and the card is still written. `off`: nothing is matched. `require`: the `card` tool and `/dispatch` refuse such a card while a candidate overlaps, ending `pass issue: <n> (or set issueMatch suggest)`. See the planning section of the guide. |
| `issueLink` | repo | `hint` | MOD-359, `off`, `hint` or `require`. A card with no `issue:` is told so, because the Work view can only place a card under its epic or feature through that line. `hint`: the `card` tool and `/dispatch --dry-run` add one note, `note: this card names no issue; pass issue: <n> ...`, and the card is still written (one note however many cards the call made). `require`: the `card` tool and `/dispatch` refuse the card, `this card names no issue (issueLink require); file one with the land tool and pass issue: <n>, or set issueLink hint`. Never asked for an issue: a release card (its title starts `Release <version>`), a card with `repo: none`, and a card whose whole scope is outside the repo (absolute or `~` paths). A `lanes` call cannot carry an issue, so under `require` it gets the note. A card whose scope overlaps a planned task already gets that task's `pass issue: <n>` line instead of the note. A replay, `verify=` and `amend=` are untouched. |
| `effortNudge` | repo | `{cards: "<cardDir>/**", up: high, down: medium}` | the brain's own effort, said on rows (never set): a hand-back whose report names an artefact the `cards` glob takes ends `lead: judgment next, raise to <up>`; the next accept of another task, or the next started row that is not a resume, ends `lead: back to <down>`. `cards` unset means the card folder (`<cardDir>/**`, `agents/tasks/**` on defaults); an explicit glob wins; `cards: ""` turns it off. |
| `maxWorkers` | repo | `2` | briefed workers at once; the rest queue (`ready:` when a slot frees). |
| `loadThrottle` | user | `false` | off (the default): the slot count is `maxWorkers`. On: when the 1-minute load is at least twice the core count (the same test as the loaded-machine words on a red gate), a claim beyond `max(1, floor(slots / 2))` is held with `held: machine loaded (<load>/<cpus>)` and queued, and is retried on the next claim or `ready:` row. A running worker is never stopped and the only slot is never held. The load is read only when the option is on and a claim is made. |
| `gateTimeoutMinutes` | repo | `30` | whole minutes (1 to 120) the verifier and `/delegation merge` let one gate command run before they stop it. This is the mod's own ceiling: a gate runs as a spawned child, so the host's 10-minute cap on one command does not apply. Raise it for a repo whose full suite runs long. A gate still running at the ceiling is stopped and the verdict is `unverified on gate` with `gate ran past gateTimeoutMinutes (<n> min)`. While a gate runs, its row and the `verdict` tool say `verifying (gate <id> running <m> min)`; time waiting for another worker's engine gate shows as `waiting for the engine gate <m> min` and does not count toward the ceiling. A value outside 1 to 120, or not a number, is named in the config errors and 30 is used. |
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
| `pauseCap` | repo | `3` | A whole number from 2 to 20: the pauses per attempt before the next is charged as an attempt (a worker may pause the cap minus one times). Any other value is named in the config errors and `3` is used. |
| `mergeStyle` | repo | `rebase` | `rebase`, `merge` or `squash`: the flag on the `gh pr merge` line the merge block prints. With `squash`, `merge --finish` also accepts a commit on origin with the worktree head's tree as the landing (`(squash of the worktree head)`). Any other value is named in the config errors and `rebase` is used. |
| `finishSkip` | repo | `[]` | extra paths `merge --finish` never stops on, added to its built-in list (`node_modules/`, `dist/`, `build/` …): a trailing slash skips that folder at any depth, a name skips that file at any depth, a leading-dot entry other than `.DS_Store` skips by suffix. A list, or a comma string; a bad entry is named and dropped. |
| `delegateOnly` | repo | `warn` | `off`, `warn`, `deny`: stops an opus or fable brain editing source. See [The brain's spend](spend.md#the-brains-spend). |
| `review` | repo | `on-frontier` | `off`, `on`, `on-frontier` (frontier and premium cards only): a read-only reviewer checks each hand-back. See [Review](review-and-merge.md#review). |
| `reviewTier` | repo | `""` (one below the worker, not below economy) | `economy`, `standard`, `frontier`, `premium`: the reviewer's tier. |
| `reviewEffort` | repo | `medium` | `low`, `medium`, `high`, `xhigh`, `max`: the effort a reviewer steps at, held to `maxEffort`; the reviewer's spawn notice shows it. `""` in the repo file leaves the engine's default. `/delegation` shows `effort: … · review medium · cap high`. |
| `autoEscalate` | user | `false` | perform the resume instead of advising it. |
| `wakeOnVerdict` | user | `false` | on: a verdict row also starts a brain turn. |
| `landNudge` | user | `true` | one band line for the brain: a prompt that describes work and a turn that lands nothing, and a merge finish whose parent has open tasks. Off draws and records neither. |
| `postFindings` | user | `ask` | `ask`, `auto`, `off`; `/config` only. See [Posting the findings](#posting-the-findings). |
| `readyFallbackMinutes` | user | `10` | minutes a `ready:` row waits before the mod starts it itself. `0` = off. |
| `waitStallMin` | user | `20` | minutes without a hand-back before `<id> stalled <n> min; resume or stop it`. `0` = off. |
| `applyAmends` | user | `true` | append `scope+=` / `forbid+=` blocks to the brief before verifying. Off lists every block and applies none, whatever `scopeAmends` says. |
| `landAuto` | user | `false` | off (the default, MOD-208): `/delegation land` and the `land` tool write the body, show the issue (title, type, parent, the `gh` line) and file nothing until the `land` tool is called again with `confirm: true` (`--confirm` for the command) after your yes; the land nudge says propose. On (`/delegation config landAuto on`): they file the issue at once. |
| `treeImportBatch` | user | `20` | the most issues one `/delegation tree import` (or `tree_import` call) creates in a run, `1` to `100`; a value outside that means `20`. The run then stops with `filed k of n; run again to continue`. See [Tree import](guide.md#tree-import). |
| `project` | repo | empty | the GitHub Project `/delegation land` and the `land` tool add a newly filed issue to, written `<owner>/<number>` (for example `acme/3`). Empty adds it to none; a value not shaped `<owner>/<number>` is ignored. A `project` in the repo file wins over this option, and `none` there adds nothing; `project: false` on `land` and `land_plan` (`--no-project` on `/delegation land`) skips the add for that call only. |
| `scopeAmends` | repo | `apply` | `apply`: a worker's `scope+=` applies on its word; `new-files`: only when every path is new at the base and sits in a folder a scope entry names; `ask`: every one waits for you to append it to the brief and `dispatch verify=<sha>`; `within-parent`: applies only when every path sits inside the brief's `parent_scope=` (set from a card cut under a parent), otherwise it waits as under `ask`; with no `parent_scope=`, it applies when every path sits in a folder the card's scope already names, and waits otherwise. Use it with parents. `forbid+=` always applies. |
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
prompt row or ingest) the mod adds one row: `a round of tasks closed (N verdicts): write the review note with a "## For the mod owner" heading, one bullet per finding, then /delegation debrief ingest <note.md>`,
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
`/delegation debrief post all|1,3` posts them ([Posting the findings](#posting-the-findings)). A note without the heading prints ``debrief ingest: <name> has no "For the mod owner" heading (read <path>); add `## For the mod owner` with one bullet per finding, then run it again`` (and a `nearest heading` line when one mentions the mod); a heading with no bullets prints `debrief ingest: <name> has a "For the mod owner" heading with no bullets; one bullet per finding`. Nothing is written in either case.

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
