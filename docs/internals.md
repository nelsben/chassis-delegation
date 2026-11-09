# Internals

Running without the engine, known issues, the store and ledger, and developing the mod.

## Parts

| File or folder | What it does |
| --- | --- |
| `hooks/register.ts` | every `$` call, spelled `$.noun.method(...)` or passed on, never stored |
| `hooks/lib/*.ts` | pure code, no `$` |
| `hooks/lib/verify-native.ts` | the verifier: report and brief grammar, gate rules, `redClaim` |
| `hooks/lib/gates.ts`, `hooks/lib/allow.ts` | the gate commands; the allowlist |
| `hooks/lib/repoconfig.ts`, `hooks/lib/init.ts` | reads and scaffolds `.chassis-delegation.json` |
| `hooks/lib/gitguard.ts` | the git guard |
| `hooks/lib/dispatch.ts`, `hooks/lib/crossbrief.ts` | the card, brief and worktree; whether an existing brief is reused. `hooks/templates/brief.md` has conditional sections (`renderSections` and `stageBrief`): the red-test rule and red-evidence block only when `red_test` is not `none` (else the report says `red=none`), the spend line only with a ceiling, the output-folder and scratch lines only with `outdir=` and `scratch=`, the Lessons only when the domain has a file, and one block per mode (worktree, here, none) |
| `hooks/lib/card.ts` | the card tool's fields and the dry-run warnings (`redTestWarnings`, `forbidCollisions`); `globGapWarnings` (MOD-351) says a scope or forbid entry whose `**/` needs a folder and so misses the files directly in it, with the entry to add; nothing is refused |
| `hooks/lib/cleanstop.ts`, `hooks/lib/evaltrigger.ts` | decide the debrief; decide the eval |
| `hooks/lib/retention.ts` | the store prune plan |
| `hooks/types/index.d.ts` | declares `$.state` |
| `bin/chassis-hook.mjs` | the settings.json fallback: plain node, no `$`; reads the pure libraries via `bin/ts-resolve.mjs` |
| `bin/evidence.mjs` | the ledger summary (see Evidence) |
| `tests/harness.ts` | answers every `$` call from memory |
| `tests/node/bin.node.mjs` | pipes hook input into `node bin/chassis-hook.mjs` against repos under `tests/.tmp/`: consistent, refuted, no report, a commit on `main` (denied), one on `agent/x/y` (passes) |
| `tests/node/verify-native.git.node.mjs` | builds git repos under `tests/.tmp/` for each verdict case |
| `tests/selfcheck.sh` | prints the settings.json block below when the rollout switch is off |

## Without the engine: two settings.json hooks

Where the rollout switch serves off, the mod does not load. `bin/chassis-hook.mjs` offers the native verifier and git guard as `settings.json` command hooks. It needs **node 22.18 or newer**; an older node exits 1, a hook error that blocks nothing.

Merge this into the `"hooks"` block of `~/.claude/settings.json` (every project) or `.claude/settings.json` (one repo), with `<this folder>` your clone's absolute path. Use it only where the mod does not load.

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

- **`post-agent`** takes the last `[[report …]]` of the result and prints nothing with none. It finds the brief (the `….brief.md` path, else an inline `[[brief …]]` header; none: git-only checks) and the worker's tree (the brief's `repo=`, the call's `cwd`, the report's branch worktree, the sibling `<repo>-<id>`), then prints the verdict row.
- **`pre-bash`** runs the git guard over the command, following `cd` and `git -C`, and prints a deny. It guards `main` and `master`.

Every command the wrapper runs passes `hooks/lib/allow.ts` with the gate map of `.chassis-delegation.json`; it never pushes or installs.

What differs from the engine:

- the row says `via=settings-hook` with no attempt count, so a red file reused from an earlier attempt is not caught;
- a `repo=here` or `repo=none` brief is `unverified`, and `[[amend …]]` blocks are not applied;
- gates take no turns, so two workers verified at once can time each other out.

**The red claim.** `redClaim` holds a red file that has a failure marker. A file with no marker and at most 2048 bytes (`RED_GREEN_MAX_BYTES`) is settled by the red test's own run:

1. The verifier runs the brief's `red_test` once at the worker's head, under the gate time limit. `redTestCommand` takes the words before any prose, and only an allowlisted command.
2. The result goes to `redClaim` as `green`.
3. Exit 0 with output unlike the red file's is held.
4. A failing, timed-out or unrunnable run, or the same output, stays unchecked; the advice is `check red by hand`.
5. A larger file, `red_test` of `none` and a file with a marker are unchanged.

Only the engine has tiering, the queue, `maxWorkers`, the respawn ladder, spend ceilings, the dashboard, the debrief, the eval runner, "Delegation state", `/delegation`, `dispatch`, `readyFallbackMinutes` and `delegateOnly`.

## Known issues

- **Rollout switch.** Where it serves off, `claude plugin test` refuses; the pure tests run under plain node.
- **A gate runs in the worker's worktree as left.** A missing tool exits 127: unchecked, not refuted.
- **`usd` marked `~`** is the session delta, approximate.
- **Waiting workers.** The mod wakes the brain once per state from `turn.complete`. A host notification the hooks never see cannot be held.
- **Queue.** `maxWorkers` (2) caps briefed workers, not ad hoc agents. A spawn past the cap waits in a queue of one row per task and subtask.
  - `maxWorkersByTier` adds a lower cap per tier: a spawn needs a total slot and a slot of its own tier, and the queue plan skips a row whose tier is full, so a row of another tier behind it is ready in its place.
  - The queue is advice: the brain starts a queued task; the mod starts only a ready worktree row unclaimed for `readyFallbackMinutes`.
  - `resources=` queues a spawn too; only a running or starting worker holds one.
- **Several Agent calls in one message** are decided one at a time within the host's 10 s; a decision with under 2.5 s left is refused, so repeat the call.
- **A killed hooks worker** disconnects the MCP server: `card`, `dispatch` and `verdict` are gone until Claude Code restarts.
- **The git guard reads command text:** not a commit inside a script, nor a folder named by a variable.
- **Background runners use the session's permissions.** The built-in debrief writes under `<root>/.delegation/`; `~/.claude/commands/debrief.md` writes where it says. The eval is off until you set `evalCommand`.
- **Worker numbers update at run end** (see [Dashboard](guide.md#dashboard)).

## Store and ledger

**`<root>/.delegation/ledger.jsonl`** gets one line per judged attempt: the attempt fields plus `verdict`, `next` and `sessionId`.

- A reviewer's line has `kind: review`, `verdict: reviewed` and `review: {confirmed, refuted, unverifiable}`.
- An older line says `verified` and is never rewritten (see [How a report is verified](contracts.md#how-a-report-is-verified)).
- A repeat of task, subtask, attempt, sha and verdict is not appended.
- MOD-338: a verdict line carries `choices` (how many decisions the worker listed as left open by the card; 0 for `choice: none`; absent when it listed none) and, when `choices` is above 0, `choiceLines` (the first 12 choices, each cut to 160 characters). The lines are in the ledger only, not in the store, which is near its size limit; the store's attempt record keeps the count.
- MOD-308 (#395): a verdict line carries `briefHash`, the first 12 hex characters of the sha-256 of the brief as the judgement read it, so it can be told which brief version the attempt was judged against. A brief appended to while its worker runs (a dispatch grant, or a hand-back amend) writes an amend line right after the write: `{kind: amend, task, subtask, attempt, briefHash, tokens, source, at, sessionId}`, where `source` is `brain` (the grant) or `worker` (the hand-back), `attempt` is the open attempt (else the latest, else omitted) and `briefHash` is the hash of the file after the append. A repeat of task, subtask and briefHash is not appended. A re-render of the brief writes no amend line.
- An accept line, `{kind: accept, task, subtask, attempt, sha, at, how, sessionId}`, has `how: merged` (the sha is on the default branch, or the guard saw `gh pr merge` or `git merge agent/<domain>/<id>`) or `how: accepted` (`/delegation accept <id>`). MOD-316: a `merged` accept row is written only for a sha that differs from the dispatch base (`baseSha`), never for a worktree head equal to the base, which is an unbuilt worktree.
- A spawn line, `{event: spawn, task, subtask, attempt, lineage, budget, tier, alias, purpose, at, agentId, toolUseId, briefPath, briefHash, cwd, repo, sessionId}`, with `briefHash` the brief's hash read at the spawn, is written once per briefed spawn, not with `ledgerFile` off. It has `event`, not `kind`, and no `verdict`, so readers of judged lines skip it.
- MOD-341: a spawn line also carries `fixes` (the merged cards the card's `fixes:` names; absent when none) and `linked` (`true` when the card's `issue:` reads as an issue number, else `false`; absent for an ad hoc or replay spawn). Nothing reads them yet: they let a ledger-only reader count how often a consistent verdict was later repaired by another card, and the share of cards cut with an issue link.
- MOD-342: a judged line and a `merged` line carry `brain`, `{since, usd, turns, edits}`: the brain's own spend in the session at the moment the row is written (`since` is the session start the brain record is kept under; `usd` is rounded to four places). It is a running total, so a reader takes the largest `usd` per `since` and does not add the rows. It is left off before the brain's first turn, and no other row kind (spawn, accept, amend, pause, review) has it. It is not part of a row's key, and the store's attempt record does not keep it.
- MOD-344: the brain record and its `brain` stamp also carry `pair` (the `<family>/<effort>` that spent the most dollars, such as `opus/medium`; `default` when the step named no effort), `window` (the context window of the session's model, in tokens, as the host reports it), `compactions` (always written; the count of compactions of the main conversation this session, not counting a precompute or a subagent's) and `compactTokens` (the context tokens the last response was answered over just before the latest compaction, the window the session really ran at). The record also keeps `byPair` (dollars and turns by pair), which the stamp does not copy.
- MOD-348: the pair is now `<family>-<major>[.<minor>]/<effort>` (`fable-5.2/high`; the bare family for an alias). A pair entry of `byPair` carries `steps` (model requests) and `ctx` (prompt tokens), so `ctx / steps` is the average context per request. The stamp carries `pairs`, the running totals of every pair, so the difference between two stamps of one `since` is what the brain spent between the two rows. A spawn row carries the stamp too. The brain's cache writes are priced at the 1-hour rate; records already stored are not repriced.
- MOD-350 (with MOD-339): the card match reads the state of up to six planned candidates with `gh issue view`; a state read is kept in memory for ten minutes per session (not in the store), a failed read is not kept, and the cache is cleared at session start.

**The store** is `~/.claude/plugins/store/chassis-delegation_<id>.json`:

| Key | Holds |
| --- | --- |
| `delegation.tasks.<ID>@<repo>` | every attempt, with `here` and `files` for repo=here, `adhoc: true` for a cardless one, `requestedAlias: fable` when opus spawned, `sha` and `metrics` (the report's `metrics=`) once judged, a reviewer's `review` counts; a `work-present` attempt is kind `verify`; MOD-316: `baseSha` (the full sha of `origin/<default>` the worktree was cut from, read at dispatch; a head equal to it is never landed work) and `mergedSha` (the sha the `merged` retire marker was set on; a marker whose sha is the base is cleared at the next hand-back) |
| `delegation.recent.<session>` | the verdict lines |
| `delegation.handoff.<brief>` | the folder `/dispatch` prepared for the Agent call |
| `delegation.outside.<ID>@<repo>` | a pointer (`{ at, briefPath, file, files }`) to the listing of a research card's absolute roots, the "before" of the outside delta; the listing itself is the JSON file under the session's `.delegation/outside/` folder, so several cards in flight never fill the store (a record from an older version may still carry the roots inline, and is read as before) |
| `delegation.taskRepo.<ID>@<session repo>` | the repo `/dispatch` remembered for the id |
| `delegation.effort.<ID>@<repo>`, `.classifier.<ID>@<repo>`, `.mergePrep.<ID>@<repo>` | the card's effort, the classifier's call, the merge preparation |
| `delegation.posted.<ID>@<repo>:<lineage>:<attempt>`, `.postedRow.…` | the attempt's verdict row, posted once |
| `delegation.debrief.<session>`, `delegation.friction.<session>`, `delegation.evals` | debrief, friction and eval records |
| `$.state` | `chassis-delegation.workers`, `.status`, `.lastVerdict`, `.queue` |

**Pruning.** The host refuses a `$.store.set` past **4 MiB**. The mod prunes at session start and after each verdict via `$.store.delete`, per `hooks/lib/retention.ts`:

- a per-task record (`delegation.spawn`, `.agent`, `.agentName`, `.cost`, `.tasks`, `.handoff`, `.replay`, `.classifier`, `.effort`, `.posted`, `.postedRow`, `.outside`, `.taskRepo`, `.mergePrep`) goes when its newest timestamp is over **7 days** old and its task is not open.
- an open task is never touched;
- over **3.5 MiB**, closed records go too, oldest first, until under **3 MiB**;
- session-level keys (`delegation.recent`, `.debrief`, `.friction`, `.merged`, `.notes`, `.brain`, `.adhoc`, `.evals`) are kept and capped where written (`recent` 50 lines, `merged` 50, `friction` 100, `adhoc` 200, `evals` 100); `recent`, `debrief`, `merged`, `notes` and `friction` are also aged out after **14 days** by their newest timestamp (never the live session's), while `brain`, `adhoc`, `evals`, `alias` and `updateCheck` are never pruned;
- a spawn whose verdict was posted and is over **24 hours** old keeps a one-line `verdictSummary` in place of `verdictBlock`, `verdictLine` and its `postedRow` value (done in the same scan, idempotent); the inline `outside` listing fallback keeps at most 200 entries per root and is marked `truncated`, which the scope claim reads as unchecked.

A research card's listing file under `.delegation/outside/` goes with its `.outside` record (the host's file API has no delete, so the file is emptied); a failure there is a debug line, never a stop.

A prune writes `store: pruned <n> records (<x> MiB to <y> MiB of 4 MiB)` at session start. `/delegation` shows `store: <x> MiB of 4 MiB`.

**A worker whose spawn record was refused** still counts and gets a verdict. The spawn comes from the store, else the hook's memory of this process, else the newest ledger spawn line plus its brief; the verdict tool uses that order. The row then ends with `(from memory: the store had no record)` or `(from the ledger: the store had no record)`.

**A card for another local repo.** Two repos can each have an `OPS-15`, so records are keyed by repo plus id:

- Every per-task key names the card's repo, `<ID>@<repo>` (absolute path, no trailing slash), the session repo's own cards too (MOD-117): the store is one per machine and ids restart in each repo.
- At session start, once, a bare key from an older version moves: a `tasks` row goes to the key of the `root` (or `repo`) it names, else the session repo's; any other family goes to the session repo's key (or the repo its value names), and an attempt key gets the session repo after its label. The bare key is deleted and the debug log says `store: moved <n> per-task keys to their repo's key (MOD-117)`. Retention groups the scoped keys by id.
- Doors that take only an id (the verdict tool, `/delegation accept`, merge and retire checks) read `delegation.taskRepo.<ID>@<session repo>`, else the session repo.
- `posted`, `postedRow` and the start row's `attempt n/m` use the same key. The ledger is one file per session repo, rows carrying `repo`.
- The brief is read from the session's `briefDir`. A resume (SendMessage) does not run `agent.spawn` again: Anthropic's mods reference says "your `agent.spawn` hook doesn't run again" and that a `tool.call` hook on `SendMessage` is how a mod sees it (https://code.claude.com/docs/en/plugins/mods/reference, Subagents), and the sub-agents page says a resume starts a new run under the same agent id (https://code.claude.com/docs/en/sub-agents#resume-subagents). Neither page says whether `session.send` also fires for a `SendMessage`, and the test engine fires only what a test emits, so the mod is pinned for each sequence in tests/resume.test.ts. Both a `session.send` hook and a `tool.call` hook on `SendMessage` record the resume (attempt n+1, kind `resume`, same lineage) at the send, after the same guard (a briefed spawn whose last attempt was judged failed) and the same budget check, which refuses the message when the attempts used reach the budget. The `tool.call` hook records only when `session.send` did not, so a resume is counted once whether the host fires either event or both, in either order. A second `agent.spawn` with the same id (a respawn, not a resume) is counted as the next attempt of a new lineage, kind `spawn`, escalated a tier. In practice the host fires `session.send`: in this repo's own ledger, workers resumed after a refuted hand-back are recorded as kind `resume` on the same lineage, including research lanes that handed back with `sha=none` both times, which the tool.call-only sequence would never count.
- The delta is taken in that repo's worktree. A path outside it counts only when the scope names it as an absolute root.

**Brief reuse.** `/dispatch` compares an existing brief with the one it would write on three points: the header's `repo=`, the worktree and the card path (`hooks/lib/crossbrief.ts`).

- All agree: reused as is, keeping hand edits.
- One differs, no attempt open: rewritten.
- One differs, an attempt open: refused, nothing written.
- A point the brief does not name is not compared; a replay brief is always reused. Another repo's card takes `briefExtra` from that repo's `.chassis-delegation.json`.

## Evidence

`bin/evidence.mjs` reads the `.delegation/ledger.jsonl` files named on its command
line and prints one JSON object: outcomes, cost and time, with repos labelled A, B, C
in argument order. It reads only those files, writes nothing and needs only Node.
It never emits a path, task id, sha, session id, agent id, brief path or free text,
so its output is safe to commit. Run `node bin/evidence.mjs a/ledger.jsonl b/ledger.jsonl`.
No arguments: usage on stderr, exit 2. A missing file: an error naming its position, exit 1.

`--scorecard` (anywhere among the arguments) prints a weekly scorecard as text instead of the JSON, and the JSON carries the same numbers under `scorecard: { weeks, models, brains, contexts }`. A card is one `[repo, task, subtask, lineage]`; a row's time is its `verdictAt`, else its `at`, and a row with neither is left out; a week is the ISO week of that time in UTC (`2026-W45`). Per week (`weeks`), with every key below; per model alias (`models`) the keys `cards` to `rework`, `usd`, `choicesStated` and `choicesMean`, with the same meanings (`models` also has `repaired`):

- `cards`: cards whose attempt 1 has a judged row, placed in the week of that earliest row.
- `firstTry`: of those, the cards whose newest attempt-1 row is `consistent` and that have no judged row above attempt 1.
- `firstTryStrict`: of those, the cards whose earliest attempt-1 row is `consistent` and that have no attempt above 1.
- `rework`: of those, the cards with a judged row above attempt 1.
- `usd`: the dollars of the folded judged rows in the week (a re-verify is not counted twice).
- `choicesStated`, `choicesMean`: the folded judged rows whose `choices` is a number, and their mean (`null` when none).
- `linkedKnown`, `linked`: the attempt-1 spawn rows that state `linked`, one per card (the earliest), and those that are `true`.
- `fixCards`, `escaped`: the attempt-1 spawn rows, one per card, that name `fixes`, and the distinct `[repo, id]` pairs they name.
- `merged`: distinct tasks with a `merged` row in the week.
- `repaired`: of those, the cards a later card repaired. Take the union of the `[repo, id]` pairs that attempt-1 spawn rows name in `fixes`; for each, the cards of that repo whose task is the id and whose lineage is the largest among them are repaired (an id that matches no card marks nothing; a card named twice is marked once). `fixCards` and `escaped` keep counting in the week of the repairing card.
- `brainUsd`, `brainShare`: a session is one `[repo, brain.since]`; its stamped rows are the rows with a `brain` object that has a numeric `since` and a time, in ascending `at` (file order breaks ties), every kind of row. Each such row with a numeric `brain.usd` adds that `usd` minus the `usd` of the session's previous such row (0 before the first, never below 0) to the week of its time. `brainUsd` is the sum over all sessions (`null` where no row falls in the week); `brainShare` is `brainUsd / (brainUsd + usd)`, `null` when `brainUsd` is `null`.

`brains` compares brain setups, one entry per pair (`fable-5.2/high`) that spent dollars or made requests, key-sorted. Only stamps that carry `pairs` are read, so a 0.9.55 stamp (`pair`, `window`) contributes nothing. Walk a session's stamped rows in order, keeping a base (the `pairs` and `compactions` of the last row that carried `pairs`). A row with `pairs` closes an interval when it is the session's first stamped row (the base is then all zeros) or a base exists; a row with `pairs` after stamped rows without `pairs` and before any base only becomes the base (a session that was running when the mod was upgraded); a row without `pairs` closes nothing and leaves the base alone. An interval holds, per pair in the row, the row's `usd`, `turns`, `steps` and `ctx` minus the base's (absent is 0, never below 0), and the `compactions` difference. Its top pair is the one with the most interval `usd` (ties: more `steps`, then the name that sorts first; none when no pair has `usd` or `steps`). A task is `[repo, task]` with a non-empty task id; over its intervals it has dollars per pair and the totals `usd`, `steps` and `ctx`. Its setup is the pair with the most dollars (same tie rule; none when no pair has `usd` or `steps`), and its context is `ctx / steps`. A card takes the setup and the context of its task. A grant is an `amend` row whose `source` is not `worker`; it belongs to the setup of its task. `brains` is `{}` with no interval. Each entry holds:

- `sessions`: sessions with an interval in which the pair has `usd` or `steps`.
- `brainUsd`, `turns`, `steps`, `usdPerStep`, `ctxPerStep`: exactly what was spent on the pair over all intervals (`usdPerStep` to 4 decimals, `ctxPerStep` = `ctx / steps` rounded to a whole number; both `null` with no steps).
- `compactions`: the `compactions` of the intervals whose top pair this is.
- `cards`, `firstTry`, `firstTryStrict`, `rework`, `repaired`: as above, over the cards whose task has this setup.
- `choicesMean`: the mean `choices` over the folded judged rows of those cards (`null` when none).
- `grants`: grants whose task has this setup.
- `workerUsd`: the dollars of the folded judged rows of those cards.
- `brainUsdPerCard`, `brainUsdMedian`, `stepsPerCard`, `brainShare`: over the tasks with this setup that have a card, each once: their total `usd` (all pairs) divided by `cards`, the median of the per-task totals (`nearest(sorted, 0.5)`), their total `steps` divided by `cards` (1 decimal), and total `usd / (usd + workerUsd)`; `null` when the divisor is 0 or there are none.

`contexts` groups cards by the context of their task in buckets of 50,000 tokens: the key is `<lo>-<lo+50>k` with `lo = floor(context / 50000) * 50` (`200-250k`), written in ascending order of `lo`. A card whose task has no context is in no bucket. Each entry has `cards`, `firstTry`, `firstTryStrict`, `rework`, `repaired`, `brainUsdPerCard` and `stepsPerCard`, the last two as in `brains` over the tasks in the bucket. `contexts` is `{}` with none.

The text form has a title, a header, one line per week oldest first, then one line per model, then (when `brains` is not empty) a blank line, a header and one line per pair, most cards first (`reqs` is `steps`, `ctx/req` is `ctxPerStep` in thousands, `$/req` is `usdPerStep`), then (when `contexts` is not empty) a blank line, a header and one line per bucket; the week and model lines have a `repaired` column after `escaped`; `1st try` reads `firstTry/cards` and a percent, `linked` reads `linked/linkedKnown`, and a `-` means no value. With no judged row at all it prints `no judged attempts`.

## Developing

    claude plugin validate <this folder>     # the gate: manifest + what the module hooks and calls
    claude plugin test <this folder>         # every test, the hook tests included (needs the rollout switch)
    tsc -p <this folder>                     # once the engine has laid .claude-plugin/types
    node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs
                                             # the pure tests and the real-git suite, under plain node

If `claude plugin test` refuses on the rollout switch, retry after a minute. Still refused: the node runner covers the pure tests, and the hook tests are owed.
