# Spend

What the brain and each worker cost, the spend ceiling and effort by tier.

## The brain's spend

The workers' cost is priced per attempt (see the [Dashboard](guide.md#dashboard)). The brain's own turns are
priced too, and shown apart, so you can see how much of a bill was the brain
reading, editing and running tests itself.

**The split.** Every main-loop `turn.complete` (no `agentId`) with a `usage`
adds to one record: tokens, dollars by the model each turn reported, the turn
count and the brain's edits. The record is kept in the store under the
conversation's start time (a resume keeps it; `/clear` starts a new one), with
`$.state` as its view, so a resume or a reload of the mod does not drop the
turns before it. The brain's share is its dollars over the session total (brain
plus workers when the session total is unknown).

**What the dollars are.** API list prices from the mod's own table (checked
2026-10-06 against the claude-api skill's pricing table), priced per message
from the usage each turn reports, never from a transcript. Per million tokens:
Opus 5.5 $4 in / $20 out, cache reads $0.20; Sonnet 5.5 $2 / $10, cache reads
$0.20; Fable 5.1 and Mythos 5.1 $10 / $50, cache reads $0.25; every other model
reads the cache at 0.1x its input price. Cache writes cost 1.25x input, or 2x for
the part the usage reports as `ephemeral_1h_input_tokens` (Claude Code writes
1-hour entries); a usage without that split is priced at 1.25x. What the figures
leave out: Haiku 5.5's long-prompt tier ($0.50 / $2.50 for a prompt past 100K
tokens; usage arrives summed per turn, so the tier cannot be applied and a long
Haiku 5.5 run reads as a floor), fast mode's premium, and any discount or credit
on your account. A turn delivered to the hook twice (same turn id, same counts)
is counted once.

**The brain makes the spawn (MOD-12).** Every worker starts from the brain's
own Agent call: the one a dispatch result's spawn block names, or a ready
queued task's, or a respawn verdict's. That call is part of the brain's turn and
its tokens are the brain's; everything the worker does is the worker's, priced
from the worker's own `turn.complete` usage (keyed by its agent id), so nothing
is counted twice. The mod spends no turn of its own to start a worker.

**Where it shows.**

- `/delegation` adds
  `brain: fable $2.25 over 2 turns · workers $0.75 (3 attempts) · brain share 75%`
  and, once the brain has edited, `brain edits: n`. The figures are this session's
  only: an attempt record carries the id of the session that made it, and one from
  another session (or, in an old store, another root) is not counted. Once an Agent
  spawn with no brief header has run, the line also reads
  `· ad hoc $1.00 (1 agents)` (from that agent's own cost record), and
  `· unattributed $0.50` when the session total exceeds brain, workers and ad hoc
  by a cent or more; the share is the brain over the session total.
- The dashboard's tile row (pane, hover card) gains a tile
  `brain $2.25 / workers $0.75`; spend by model gains a row labelled `brain`
  for the brain's model, so Fable's spend is never mistaken for a worker's. The
  text fallback prints `Spend split: …` and the same `brain · fable · …` row.

**`delegateOnly`** (`off`, `warn`, `deny`; default `off`; `/config` or the repo
file). It applies to the main loop only (a worker's tool calls reach the mod's
hooks but are never touched by it), and only while the session model is opus or fable; a Sonnet or Haiku
brain is never restricted. Under it the brain's own edits are:

- **allowed** when the path is under the card folder (`cardDir`), `.delegation/`,
  `.chassis-delegation.json`, `CHANGELOG.md` or a `docs/` folder;
- otherwise, with `warn`, run, and the mod posts one row per turn:
  `chassis-delegation: the brain edited <path> itself; a card would have delegated it (delegateOnly=warn)`;
- otherwise, with `deny`, refused: `chassis-delegation: delegateOnly is on: the
  brain does not edit source. Describe the task and call the card tool, or set
  delegateOnly off.`

**What counts as a brain edit.** A call to `Edit`, `Write`, `MultiEdit` or
`NotebookEdit` on a path under the repo root, and a `Bash` command that writes
a path under the root: a `>` or `>>` redirection, `tee`, `sed -i`, `cp` or
`mv` into the root, or a `git commit` that takes a path (see below). Reading the words is a tripwire, not a
sandbox (`bash -c "…"` and `eval` are not looked into). Every brain edit,
allowed or not, counts in `brain edits: n`, whatever the mode. Paths outside
the root (the scratchpad, `~/.claude`) are no edit.
A write target is resolved before it is judged: a leading `~` or `~/` and
`$HOME` / `${HOME}` become the home folder, `$PWD` / `${PWD}` become the repo
root, and `$NAME` / `${NAME}` assigned a literal value earlier in the same
command (or as a prefix assignment of the same command) becomes that value. A
target that still holds `$`, a backtick or `$(` after that (an unset variable, a
command substitution, `~` with no known home) is unknown and is not counted as a
write in the repo.

`cd` is followed (MOD-9). A relative target resolves against the folder the last
`cd` (or `pushd`) in the same command left, the repo root to begin with, so
`cd <worktree> && rm -rf .claude-plugin/types` is a write in the worktree, not in
the repo. `cd` alone or `cd ~` goes home; a `cd` inside `( )` is undone at the
closing parenthesis; a `cd` in a pipeline or run in the background moves nothing
after it. A `cd` whose folder cannot be resolved (a variable never set, a command
substitution) makes every later relative write in the command unknown, and
unknown writes are not counted. `git -C <dir>` moves only its own command. A
`git commit` is judged by where it runs and what it takes: in a repo outside the
root it is no edit; in the root the staged paths (plus the changed files for `-a`
and the pathspecs on the command) are read with read-only `git diff` and each is
judged like a written path, so a commit of only card, `.delegation/`, repo-file,
`CHANGELOG.md` or `docs/` files runs and one that includes a source path is
warned or denied naming it. `sed -i ''` and `sed -i .bak` take the suffix word
as the suffix, not as a file.

Quotes inside a command substitution are quoted (MOD-20). A `$( )` or backtick
substitution inside double quotes is read as a command of its own, with its own
quotes, so `gh issue close 2 --comment "$(printf "id <task>-a<n>")"` writes
nothing: the `>` in the id is text. A real redirect inside one still counts,
quoted or not: `echo "$(echo x > hooks/a.ts)"` writes `hooks/a.ts`. The text of a
`git commit -m "$(cat <<'EOF' … EOF)"` is read to its end.

**Posture.** While the session model is fable and `delegateOnly` is not `off`,
the "Delegation state" section of the system prompt starts with two lines: "You
are the brain on a premium model. Build work goes to workers through the card
tool; you read the repo to write cards, verify hand-backs, and read diffs. Do
not edit source or run the test suite yourself." The section keeps its
40-line cap.

## What the brain keeps and what it hands off

`/delegation` shows `brain calls:` the brain's own main-loop calls this session by kind (run or poll, read,
edit, spawn) and its average context per call (input plus cache-read tokens over calls). Past a context of
`driveWarnTokens` (default 200K; `driveWarn: false` turns the row off) the mod adds one row a turn when the
brain runs the same command a third time or polls a job, with the dollars one call costs at that context.
`freshSessionTokens` (default 400K; `0` turns it off) sets the context at which the brain's own turn end adds one
row, once a session, telling it to start a fresh session at the next phase boundary: the cards, the ledger and the
lessons are on disk, so a new session reads them for far less than the grown one re-reads itself each turn.

The worked example is one long Game-Decompiler session on an Opus 5.5 brain with a median context of
490-650K tokens. Of its 3,705 main-loop calls, 1,653 drove an emulator lab (builds, boots, bench runs,
`until grep` polls, filming, reading bench CSVs) and cost $258 of the main loop's $605 at list prices; 71%
of that was cache reads of the whole context on every poll. The same calls at an 80K context cost $99 on
Opus and $63 on Sonnet 5.5: the small context cuts about 60%, Sonnet's price a further third. The 61 ad hoc
research agents it spawned cost $286, 39 of them on Opus because no model was set: set the model on
research spawns as well as on cards.

- **The brain keeps** choosing what to build and the numbers that make it right, writing the brief (the
  goal, the numbers, the check to pass, what to hand back: the diff, measured results, images) and
  reviewing the hand-back (the diff, the bench lines, stills or a video).
- **A worker hands back** the build, run, poll and read-the-logs loop from a fresh, small context: edit,
  hot-load, bench and read the CSV, disc builds and boots, filming, and the docs that record the result.
  A standard card is a Sonnet worker; `resources: ["lab"]` keeps one worker on a one-client app, so lab
  workers run one at a time.
- **What stays with the brain anyway:** a repo whose gate is unit tests cannot tell whether a move works in
  the game, so the brain still reads the bench results and looks at the stills. A worktree is cut from
  main, so the brief names the branch tip.

## Spend ceiling

An attempt has a ceiling in dollars: `spend=` in the brief header (see [The contracts](contracts.md#the-contracts)).
The brief tells the worker its ceiling, and that line is the part that limits
spend while a worker runs.

**What the mod can see, and when.** The engine does not show a plugin the
steps or tool calls of a subagent the plugin spawned itself
(`$.agent.spawn`): its `turn.step` and `tool.call` hooks are skipped for that
worker (public issue #22). Since MOD-12 no worker is such a subagent: `/dispatch`,
the dispatch tool, a queued task and a respawn all hand the brain the Agent call
to make, so every worker is the brain's own spawn and the mod's hooks see it,
its tool calls (the git guard) and its turns. The spend checks below read the
worker's cost from its `turn.complete` events, and act on the worker's next
tool call; its steps are given an effort (see "Effort by tier").

What the mod does with each worker's own cost (the cost formula below):

- **At the ceiling.** When a run ends with the worker's own spend past
  `spend=` and no report line, the mod sends it one message through
  `$.session.send` (the path a resume uses, but it is not a resume and does not
  count against the budget):
  `chassis-delegation: you have spent about $2.20 of a $2 ceiling; wrap up now and hand back with the report line`.
  Once per attempt. The worker carries on, so that turn's end is not judged.
  The mod also posts one row to the conversation, naming the task and the
  dollars: `chassis-delegation: T-6 spend $2.20 reached its $2 ceiling; the worker was told to wrap up and hand back`.
- **At twice the ceiling.** The attempt's verdict is `over-spend`, and the mod
  posts:

      chassis-delegation: T-6 attempt 1/3 over-spend · $4.20 of $2 · next=check the worktree (work may be present: /dispatch T-6 --verify <sha>)

  `over-spend` is not a failing verdict: it never escalates the tier, and the
  mod does not resume or respawn on it. If the engine hands the mod the id of
  the worker's running turn (`turn.start` carrying the subagent's `agentId`),
  the mod also ends that turn with `$.turn.abort`. The engine's `turn.start`
  carries no `agentId` today, so that is rarely possible; what stops the worker
  is its next tool call, which the mod denies with one line (MOD-13):

      chassis-delegation: T-6 is over twice its $2 ceiling; hand back now with what you have (SubagentHandback)

  Only `SubagentHandback` is let through. A hand-back after that is today's
  `over-spend`: the end-of-run accounting stays the source of the recorded `usd`.
- **A hand-back wins.** A turn whose answer carries the report line is left to
  the verifier, whatever it cost.
- **On the status line.** The status line and the queued-spawn refusal name
  each live worker with its cost so far: `(2 live: BE-310 $3.10, BE-314
  $1.20)`. That figure moves when a turn of the worker ends (a resumed worker
  shows its earlier runs).

## Effort by tier

The mod rewrites each of a worker's `turn.step` requests to an effort by the
card's tier: `effortByTier`, built in as economy `low`, standard `medium`,
frontier `high` (premium reads the frontier's). A card's own `effort:` (one of
`low` ... `max`; `0` keeps the engine's) wins; `/dispatch` writes it to the store
for the task. An entry of `0` or empty leaves the engine's default. The brain's
own steps and an ad hoc agent's are never touched. The effort used is recorded
on the attempt (`effort`), and `/delegation` prints
`effort: economy low · standard medium · frontier high`.

## A worker's identity

A worker inherits the brain's session id. A lock keyed on role plus session id
(a vendored lock script, public issue #24) then gave two sibling workers on
one shared environment the same identity, and one could release the other's
live hold. Telling every worker in `briefExtra` to prefix its lock calls by hand
failed silently the first time a worker forgot. Since the mod sees every
worker's Bash calls (MOD-12), it now sets the identity itself: the `tool.call`
hook runs a recorded worker's Bash command behind an export,

    export CHASSIS_SESSION_ID=BE-101-a2 CHASSIS_TASK=BE-101 CHASSIS_ATTEMPT=2; <the command as typed>

| Variable | Value |
| --- | --- |
| `CHASSIS_SESSION_ID` | `<task>-a<attempt>`; for a subtask other than `main`, `<task>.<subtask>-a<attempt>` (`BE-101.ui-a1`) |
| `CHASSIS_TASK` | the task id (`BE-101`) |
| `CHASSIS_ATTEMPT` | the attempt number (`2`) |

- **Per attempt.** The attempt is the one the worker is on, counted per task and
  subtask across spawns and resumes, so a resume moves it on and two siblings,
  or two attempts of one task, never share an id.
- **Every command of a line.** It is an `export`, so `a && b` and a script the
  command starts all see the variables. The values are shell-quoted.
- **What is never rewritten.** The brain's own Bash; an ad hoc agent and any
  agent with no attempt record; the debrief and eval runners (the mod's own
  subagents, whose calls its hooks do not see); a worker the mod started itself
  after `readyFallbackMinutes` (MOD-15), which runs outside the hooks and keeps
  the inherited id; and a command that already assigns `CHASSIS_SESSION_ID`
  (`CHASSIS_SESSION_ID=x cmd`, `export CHASSIS_SESSION_ID=x`, `env
  CHASSIS_SESSION_ID=x cmd`), which is left as typed. A command that only reads
  it is rewritten.
- **Nothing else changes.** The git guard, `delegateOnly` and the spend check
  judge the command as the worker typed it, and the rewrite is the last link
  before the engine's tool, so no refusal text or decision moves.
- **No option.** The brief tells the worker its identity and that it is already
  set. A `briefExtra` line asking workers to prefix their lock calls by hand is
  no longer needed; one a worker follows is left as typed.

## The cost formula

Each worker's own cost is summed from the `usage` of its `turn.complete`
events (keyed by the event's `agentId`, reset when a resume starts a new
attempt), priced by the model the usage names (else the model the spawn
resolved), with the built-in table in `hooks/lib/cost.ts`:

    usd = (in·P_in + out·P_out + cacheRead·P_in·0.1 + cacheWrite·P_in·1.25) / 1e6

Prices are dollars per million tokens, from a small table: opus-5-5 4/20,
opus-5 5/25, fable-5-1 10/50, fable-5 10/50, sonnet-5-5 2/10, sonnet-5 3/15,
haiku-5-5 0.10/0.50, haiku-4-5 1/5. Haiku 5.5 bills 0.50/2.50 for a request whose prompt passes 100K tokens;
usage arrives summed over a worker's run, so that rate cannot be applied, and
for a long Haiku 5.5 run the figure is a floor. The verdict row's
`usd`, the attempt record's `usd` and the ledger's `usd` are that number, kept
to 4 places in the store and shown to 2.

When no usage was reported (or a model is not in the table), the row falls
back to the session's cost growth over the attempt, `$.session.usage().cost.usd`
at the verdict minus at the spawn (or resume), shown with a `~`
(`usd=~2.91`, `~$2.91`; the attempt record has `usdApprox: true`). That delta
includes whatever the main loop and the other workers spent at the same time,
so it is approximate.
