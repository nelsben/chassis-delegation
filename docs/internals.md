# Internals

Running without the engine, known issues, the store and ledger, and developing the mod.

## Without the engine: two settings.json hooks

The mod is a function-hook plugin, so where the engine's rollout switch serves
off, or a host cannot load a hooks module, none of it runs. The two parts most
worth carrying are pure functions: the native verifier (the report and brief
grammar, the gate rules) and the git guard. `bin/chassis-hook.mjs` exposes
them through ordinary `settings.json` command hooks, with no engine behind
them. It needs only a `node` on PATH that strips types by itself, **node 22.18
or newer**, where that is on by default; nothing is installed or fetched. On an
older node it prints that to stderr and exits 1, a hook error that blocks
nothing.

Merge this into the `"hooks"` block of `~/.claude/settings.json` (every
project) or `.claude/settings.json` (one repo), with `<this folder>` the
absolute path of your clone. `tests/selfcheck.sh` prints it with the path
filled in when it finds the rollout switch off.

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

Use it where the mod does not load. With the mod loaded as well you would get
two verdict rows and two guards for one worker.

- **`post-agent`** (PostToolUse on the Agent tool) reads the hook input on
  stdin and takes the last `[[report …]]` of the result. With none it prints
  nothing and exits 0. Otherwise it finds the brief the way the mod does: the
  `….brief.md` path the prompt names, else an inline `[[brief …]]` header in
  the prompt (a report with no brief is checked for what git alone can say, as
  in a cardless hand-back, and is never consistent). It finds the worker's tree
  (the brief's `repo=`, the call's `cwd`, the worktree that has the report's
  branch checked out, the sibling `<repo>-<id>` worktree, else the repo the
  hook runs in), runs the verifier there, and prints the verdict row as the
  hook's additional context:

      {"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"chassis-delegation: verdict=consistent task=T-1 via=settings-hook next=accept\nclaim branch: held — …"}}

  The row is the mod's own: the verdict line, then one line per claim. The
  gate can take minutes, hence the `timeout`.
- **`pre-bash`** (PreToolUse on the Bash tool) runs the git guard over the
  command, against the repo the command runs in (`cd` and `git -C` are
  followed), and when it refuses prints the deny with the guard's own reason:

      {"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"chassis-delegation: no commit on main; branch first (git checkout -b agent/<domain>/<id>)"}}

  Anything else prints nothing and exits 0. The guarded branches are `main`
  and `master`.

Every command the wrapper runs itself (read-only git, and the repo's gate)
first passes `hooks/lib/allow.ts` with the gate map of the repo's
`.chassis-delegation.json`, as in the engine; it never pushes, installs or
fetches. The gate map is read from that file alone (there is no `/config`
without the engine).

What differs from the engine's verdict:

- the row has no attempt count (`via=settings-hook` in its place): nothing is
  recorded, so a red file reused from an earlier attempt is not caught;
- a `repo=here` or `repo=none` brief gets an `unverified` row saying so;
- the hand-back's `[[amend …]]` blocks are not applied (a note says so), so the
  worker is judged against the brief as written;
- a gate red only on timeouts in untouched tests is run once more, as in the
  engine, but engine gates take no turns (the turn is held in the engine's
  store), so two workers verified at once can still time each other out.

What exists only with the engine: tiering (the model picked from the card's
tier, the effort setting), the queue and `maxWorkers`, the respawn ladder and
attempt budgets, the spend ceilings, the dashboard and the delegation band, the
debrief, the eval runner, the "Delegation state" section the brain reads, the
verdict waking the brain, `/delegation`, `dispatch` and the other tools,
`readyFallbackMinutes`, and `delegateOnly`.

## Known issues

- **Function-hook plugins need the engine's rollout switch.** Where it serves
  off, the mod does not load. `claude plugin test` then refuses with "hooks
  modules are turned off in this process: the rollout switch served off".
  `tests/selfcheck.sh` says so instead of failing. The pure tests also run
  under plain node (see Developing).
- **A gate runs in the worker's worktree, as the worker left it.** If a tool
  the gate needs is missing there, the gate exits 127, which reads as
  unchecked, not refuted. The brief tells the worker to install first.
- **`usd` is approximate when marked `~`.** It is then the session delta; see the cost formula.
- **Concurrent workers can starve the machine.** `maxWorkers` (2) caps briefed
  workers. It does not count ad hoc agents. A briefed spawn past the cap waits
  in a queue that holds one row per task and subtask: the dispatch result and
  the spawn hook's refusal read
  `queued: BE-314 — the mod will tell you when a slot frees (1 live: BE-310; 1 queued: BE-314)`,
  and a second dispatch of a queued task answers `…; already queued since
  14:02 (position 1)` and prints no spawn block. The queue is advice (MOD-12):
  the brain starts a queued task, and only a ready worktree row left unclaimed
  for `readyFallbackMinutes` is started by the mod itself (MOD-15; that worker
  runs outside the mod's hooks). When a hand-back frees a slot, its verdict
  row says `ready: BE-314 — run its spawn block (/dispatch BE-314 prints it
  again)` once, and the "Delegation state" section says it while the slot
  stays free; the brain's spawn of the task takes its queued place and toasts
  `started queued <task> (waited <m> min)`. Only live agents and other tasks'
  starting spawns hold slots, never queue rows. A queued row leaves the queue
  only once its spawn succeeds: a spawn the engine refuses leaves it at the head.
  A refusal retrying cannot cure (budget exhausted, work present in the
  worktree) removes the row. A resource (`resources=`, MOD-23) queues a spawn
  too, slot or no slot: `queued: BE-314 — waiting for resource blender-live
  (held by BE-310)`. Only a running or starting worker holds a resource; a
  worker that has handed back holds none, even while its verdict is still out.
- **The git guard reads the command text.** It cannot see a commit made inside
  a script, or a folder named through a variable.
- **The background runners act on the session's permissions.** The built-in
  debrief is told to write only under `<root>/.delegation/`; your own
  `~/.claude/commands/debrief.md` writes where it says. The eval is off until
  you set `evalCommand`.
- **The dashboard shows run-end numbers for workers.** See [Dashboard](guide.md#dashboard):
  a worker's tokens and cost update when its run ends, not per step. "Across
  sessions" draws this session from the store's attempt records, so its
  sparklines hold one point until a history of earlier sessions is kept.

## Store and ledger

- **`<root>/.delegation/ledger.jsonl`** gets one JSON line per judged attempt,
  holding the attempt fields plus `verdict`, `next` and `sessionId`. A reviewer's
  line (MOD-21) has `kind: review`, `verdict: reviewed` and
  `review: {confirmed, refuted, unverifiable}`. A line
  written before the `consistent` rename says `verified` and is never
  rewritten (see the deprecation note under [How a report is verified](contracts.md#how-a-report-is-verified)).
  Each verdict line is written once (MOD-35): a line with the same task, subtask,
  attempt, sha and verdict as one already in the file is not appended, so a hand-back
  that arrives twice (as a tool result and as a notification) leaves one line.
  An accept line records a closed outcome: `{kind: accept, task, subtask, attempt,
  sha, at, how, sessionId}` with `how: merged` (the retire check found the sha on the
  default branch, or the git guard saw the brain run `gh pr merge` naming the task's
  branch or PR, or `git merge agent/<domain>/<id>`) or `how: accepted`
  (`/delegation accept <id>`). One accept line per task attempt, never two.
- **The store** is `~/.claude/plugins/store/chassis-delegation_<id>.json`, with
  these keys:
  - `delegation.tasks.<ID>`: every attempt (a repo=here attempt also carries `here`, the root it shares, and `files`, what its hand-back claimed; a cardless one carries `adhoc: true`; one where fable was asked for and opus spawned carries `requestedAlias: fable`; a judged one carries `sha`, the sha its report named, and `metrics`, the report's `metrics=` (MOD-22); a `work-present` attempt, kind `verify`, carries the branch head it found; a reviewer's attempt, kind `review` (MOD-21), carries the number of the attempt it reviewed, its verdict `reviewed` and the `review` counts, and is on no ladder);
  - `delegation.recent.<session>`: the verdict lines;
  - `delegation.handoff.<brief>`: the folder `/dispatch` prepared for the brief's worker, which the spawn hook gives the brain's Agent call (MOD-12);
  - `delegation.outside.<ID>`: the listing `/dispatch` took of a research card's absolute scope and forbid roots, the "before" of the outside delta (MOD-22); a re-dispatch of a reused brief keeps it;
  - `delegation.debrief.<session>`;
  - `delegation.friction.<session>`;
  - `delegation.evals`.

  The host refuses a `$.store.set` once the store passes **4 MiB** of JSON text in all (MOD-89, #157). So the
  mod prunes it at session start and after each verdict, through `$.store.delete` only (never the file), with
  the plan in `hooks/lib/retention.ts`:
  - a per-task record (`delegation.spawn`, `.agent`, `.agentName`, `.cost`, `.tasks`, `.handoff`, `.replay`,
    `.classifier`, `.effort`, `.posted`, `.postedRow`, `.outside`, `.taskRepo`, `.mergePrep`) is deleted when its
    newest timestamp is more than **7 days** old and its task is not open. A record with no timestamp of its own
    takes that of the record it hangs off (an agent pointer its spawn's, a cost its agent's, an effort its task's
    attempts), and a spawn counts its task's attempts too. A record with no timestamp at all is left alone;
  - an open task is never touched, whatever its age: a running worker, a pending verdict, a queued spawn, and
    (a worker of another session) a task with a pending attempt younger than 7 days;
  - when the store is over **3.5 MiB**, closed records younger than 7 days go too, oldest first, until it is
    under **3 MiB**;
  - session-level and global keys (`delegation.recent`, `.debrief`, `.friction`, `.brain`, `.adhoc`, `.evals`
    and the like) are never deleted; the lists among them are capped where they are written (`recent` 50
    lines, `friction` 100 events, `adhoc` 200 attempts, `evals` 100 rows).

  A prune that deleted anything writes one debug line, and at session start one row:
  `store: pruned <n> records (<x> MiB to <y> MiB of 4 MiB)`. A spawn record keeps no prompt text (MOD-89).
  A refused write is said out loud: the first in a session is a toast and the row
  `store write failed: <key> (<reason>); new workers may have no verdict until the store is pruned`; later
  ones are counted. `/delegation` shows `store: <x> MiB of 4 MiB`, and
  `store: <n> writes refused this session (last <key>)` when any were.
- **`$.state`** holds `chassis-delegation.workers`, `.status`, `.lastVerdict`
  and `.queue`, declared in `hooks/types/index.d.ts`.

## Developing

    claude plugin validate <this folder>     # the gate: manifest + what the module hooks and calls
    claude plugin test <this folder>         # every test, the hook tests included (needs the rollout switch)
    tsc -p <this folder>                     # once the engine has laid .claude-plugin/types
    node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs
                                             # the pure tests and the real-git suite, under plain node

The code is laid out like this:

- **`hooks/lib/*.ts`** are pure (no `$`):
  - `verify-native.ts` holds the verifier, `gates.ts` the gate commands and `allow.ts` the allowlist;
  - `repoconfig.ts` reads the repo file, `init.ts` scaffolds and `gitguard.ts` holds the guard;
  - `dispatch.ts` covers the card, the brief and the worktree;
  - `cleanstop.ts` decides the debrief and `evaltrigger.ts` the eval.
- **`bin/chassis-hook.mjs`** is the settings.json fallback (see
  [Without the engine](#without-the-engine-two-settingsjson-hooks)): plain
  node, no `$`. It reads the pure libraries above through `bin/ts-resolve.mjs`.
- **`hooks/register.ts`** holds every `$` call. `$` is only ever spelled
  `$.noun.method(...)` or passed to a function, never stored.
- **`tests/harness.ts`** answers every `$` call from memory. No test spawns,
  dispatches or runs anything real.
- **`tests/node/bin.node.mjs`** pipes hook input JSON into
  `node bin/chassis-hook.mjs` against real repositories under `tests/.tmp/`:
  a matching report (consistent), a file outside the delta (refuted), no report
  (nothing printed), a commit on `main` (denied) and on `agent/x/y` (passes).
- **`tests/node/verify-native.git.node.mjs`** builds temporary git
  repositories under `tests/.tmp/`. It checks these cases: consistent, a sha off
  the branch, a sha that does not exist, a dirty tree, a files mismatch, a red
  gate, a red file in the worktree (held, then refuted when named again), and a
  dirty repo=here checkout shared with another worker.

If `claude plugin test` refuses with the rollout-switch message, wait a minute
and retry. If it still refuses, the node runner covers every pure test, and
the hook tests are owed until the switch is on.
