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
| `hooks/lib/dispatch.ts`, `hooks/lib/crossbrief.ts` | the card, brief and worktree; whether an existing brief is reused |
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
- An accept line, `{kind: accept, task, subtask, attempt, sha, at, how, sessionId}`, has `how: merged` (the sha is on the default branch, or the guard saw `gh pr merge` or `git merge agent/<domain>/<id>`) or `how: accepted` (`/delegation accept <id>`).
- A spawn line, `{event: spawn, task, subtask, attempt, lineage, budget, tier, alias, purpose, at, agentId, toolUseId, briefPath, cwd, repo, sessionId}`, is written once per briefed spawn, not with `ledgerFile` off. It has `event`, not `kind`, and no `verdict`, so readers of judged lines skip it.

**The store** is `~/.claude/plugins/store/chassis-delegation_<id>.json`:

| Key | Holds |
| --- | --- |
| `delegation.tasks.<ID>@<repo>` | every attempt, with `here` and `files` for repo=here, `adhoc: true` for a cardless one, `requestedAlias: fable` when opus spawned, `sha` and `metrics` (the report's `metrics=`) once judged, a reviewer's `review` counts; a `work-present` attempt is kind `verify` |
| `delegation.recent.<session>` | the verdict lines |
| `delegation.handoff.<brief>` | the folder `/dispatch` prepared for the Agent call |
| `delegation.outside.<ID>@<repo>` | the listing of a research card's absolute roots, the "before" of the outside delta |
| `delegation.taskRepo.<ID>@<session repo>` | the repo `/dispatch` remembered for the id |
| `delegation.effort.<ID>@<repo>`, `.classifier.<ID>@<repo>`, `.mergePrep.<ID>@<repo>` | the card's effort, the classifier's call, the merge preparation |
| `delegation.posted.<ID>@<repo>:<lineage>:<attempt>`, `.postedRow.…` | the attempt's verdict row, posted once |
| `delegation.debrief.<session>`, `delegation.friction.<session>`, `delegation.evals` | debrief, friction and eval records |
| `$.state` | `chassis-delegation.workers`, `.status`, `.lastVerdict`, `.queue` |

**Pruning.** The host refuses a `$.store.set` past **4 MiB**. The mod prunes at session start and after each verdict via `$.store.delete`, per `hooks/lib/retention.ts`:

- a per-task record (`delegation.spawn`, `.agent`, `.agentName`, `.cost`, `.tasks`, `.handoff`, `.replay`, `.classifier`, `.effort`, `.posted`, `.postedRow`, `.outside`, `.taskRepo`, `.mergePrep`) goes when its newest timestamp is over **7 days** old and its task is not open.
- an open task is never touched;
- over **3.5 MiB**, closed records go too, oldest first, until under **3 MiB**;
- session-level keys (`delegation.recent`, `.debrief`, `.friction`, `.brain`, `.adhoc`, `.evals`) are kept and capped where written (`recent` 50 lines, `friction` 100, `adhoc` 200, `evals` 100).

A prune writes `store: pruned <n> records (<x> MiB to <y> MiB of 4 MiB)` at session start. `/delegation` shows `store: <x> MiB of 4 MiB`.

**A worker whose spawn record was refused** still counts and gets a verdict. The spawn comes from the store, else the hook's memory of this process, else the newest ledger spawn line plus its brief; the verdict tool uses that order. The row then ends with `(from memory: the store had no record)` or `(from the ledger: the store had no record)`.

**A card for another local repo.** Two repos can each have an `OPS-15`, so records are keyed by repo plus id:

- Every per-task key names the card's repo, `<ID>@<repo>` (absolute path, no trailing slash), the session repo's own cards too (MOD-117): the store is one per machine and ids restart in each repo.
- At session start, once, a bare key from an older version moves: a `tasks` row goes to the key of the `root` (or `repo`) it names, else the session repo's; any other family goes to the session repo's key (or the repo its value names), and an attempt key gets the session repo after its label. The bare key is deleted and the debug log says `store: moved <n> per-task keys to their repo's key (MOD-117)`. Retention groups the scoped keys by id.
- Doors that take only an id (the verdict tool, `/delegation accept`, merge and retire checks) read `delegation.taskRepo.<ID>@<session repo>`, else the session repo.
- `posted`, `postedRow` and the start row's `attempt n/m` use the same key. The ledger is one file per session repo, rows carrying `repo`.
- The brief is read from the session's `briefDir`. A resume (SendMessage) arrives as an ad hoc `agent.spawn` with the same agent id; the spawn hook keeps the id on its briefed spawn, so the hand-back records the next attempt (kind `resume`).
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

## Developing

    claude plugin validate <this folder>     # the gate: manifest + what the module hooks and calls
    claude plugin test <this folder>         # every test, the hook tests included (needs the rollout switch)
    tsc -p <this folder>                     # once the engine has laid .claude-plugin/types
    node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs
                                             # the pure tests and the real-git suite, under plain node

If `claude plugin test` refuses on the rollout switch, retry after a minute. Still refused: the node runner covers the pure tests, and the hook tests are owed.
