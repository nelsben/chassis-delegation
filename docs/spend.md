# Spend

What the brain and each worker cost, the spend ceiling and effort by tier.

## The brain's spend

Worker cost is priced per attempt (see the [Dashboard](guide.md#dashboard)); the brain's turns are priced apart.

- **The split.** Each main-loop `turn.complete` with a `usage` adds to one record (tokens, dollars by model, turns, brain edits)
  keyed by the conversation's start; `/clear` starts a new one. Brain share = brain dollars over session total.
- **The spawn.** A worker starts from the brain's own Agent call, whose tokens are the brain's. The worker is priced from its own usage..
- **The dollars.** API list prices (see [the cost formula](#the-cost-formula)), priced per message from reported usage; a turn delivered twice counts once.
  Cache writes cost 1.25x input (2x for `ephemeral_1h_input_tokens`). Left out: fast mode and account discounts.

| Where | What it shows |
| --- | --- |
| `/delegation` | `brain: fable $2.25 over 2 turns · workers $0.75 (3 attempts) · brain share 75%`, then `brain edits: n`. Adds `· ad hoc $1.00 (1 agents)` for briefless Agent spawns and `· unattributed $0.50` for a gap of a cent or more. |
| `/delegation` | `brain calls:` by kind (run or poll, read, edit, spawn) and average context per call. |
| Dashboard | Tile `brain $2.25 / workers $0.75` and a `brain` row in spend by model. |

**delegateOnly** (`off`, `warn`, `deny`; default `off`) applies to the main loop, while the session model is opus or fable.

| Brain edit | `warn` | `deny` |
| --- | --- | --- |
| Under `cardDir`, `.delegation/`, `.chassis-delegation.json`, `CHANGELOG.md` or a `docs/` folder | allowed | allowed |
| Any other path | runs; one row per turn: `chassis-delegation: the brain edited <path> itself; a card would have delegated it (delegateOnly=warn)` | refused: `chassis-delegation: delegateOnly is on: the brain does not edit source …` |

**What counts as a brain edit.** Every one counts in `brain edits: n`, whatever the mode. It is a tripwire; `bash -c` and `eval` are not read.

- `Edit`, `Write`, `MultiEdit` or `NotebookEdit` on a path under the repo root; a `Bash` write there (`>`, `tee`, `sed -i`, `cp`, `mv`).
- A `git commit` in the root: its staged paths (plus `-a` changes and pathspecs) are each judged as a path. Outside the root it is no edit.
- Paths outside the root (scratchpad, `~/.claude`) are no edit.

**Resolving a target.** `~` and `$HOME` become the home folder, `$PWD` the root, `$NAME` a literal assigned earlier in the command.
An unresolved target is not counted. `cd` and `pushd` are followed (`( )` undoes one; a pipeline or background `cd` moves nothing;
an unresolvable one makes later relative writes unknown). `git -C <dir>` moves only its own command. A `$( )` inside double quotes is read as its own command.

**What the brain keeps and what it hands off.** The brain chooses what to build, writes the brief and reviews the hand-back.
A worker takes the build, run and poll loop from a fresh, small context. `resources: ["lab"]` keeps one worker on a one-client app.

- Polling at a large context is mostly cache reads: in one session at a 490-650K context, 1,653 of 3,705 calls drove a lab and cost $258 of $605.
  At 80K they cost about 60% less; Sonnet 5.5's price cuts a further third.
- Ad hoc research agents with no model set run on the brain's model: set one.
- A unit-test gate cannot see gameplay, so the brain still reads bench results. The brief names the branch tip.

## Spend controls

| Control | What it limits | Default | When hit | Change with |
| --- | --- | --- | --- | --- |
| `spend=` | One attempt's dollars; the brief tells the worker | `spendByTier`: economy $3, standard $10, frontier $25; `0` = none | See the next two rows | Card `spend:`, brief `spend=`, `spendByTier` |
| At the ceiling | A run ending past `spend=` with no report line | 1x | One message via `$.session.send` (not a resume), once per attempt: `chassis-delegation: you have spent about $2.20 of a $2 ceiling; wrap up now …`. One row: `chassis-delegation: T-6 spend $2.20 reached its $2 ceiling; …`. That turn is not judged. | `spend=` |
| At twice the ceiling | The same | 2x | Verdict `over-spend` (no escalation, resume or respawn): `chassis-delegation: T-6 attempt 1/3 over-spend · $4.20 of $2 · next=check the worktree …`. The worker's next tool call is denied except `SubagentHandback`: `chassis-delegation: T-6 is over twice its $2 ceiling; hand back now …`. | `spend=` |
| A hand-back | n/a | n/a | A turn carrying the report line goes to the verifier, whatever it cost. | n/a |
| `effortByTier` | A worker's effort | economy `low`, standard `medium`, frontier `high` | Each step is rewritten. A card's `effort:` (`low` to `max`) wins; `0` or empty keeps the engine's. Brain and ad hoc steps are untouched. The started row names it: `· effort high`. | itself, card `effort:` |
| `effortNudge` | The brain's effort (yours, by `/model`; the mod never sets it) | cards `<cardDir>/**` (the card folder), up `high`, down `medium` | A hand-back whose report's `artefacts=` names a file the glob takes ends its row `· lead: judgment next, raise to high`. Once no such hand-back awaits its verdict, the first accept row of another task, or the next started row that is not a resume, ends `· lead: back to medium`, once. `cards: ""` turns it off. | itself |
| `delegateOnly` | The brain's source edits | `off` | Warn or deny, above | itself |
| `driveWarn` | Brain runs the same command a third time (leading `NAME=value` assignments and `cd <dir> &&` ignored; a repeat whose output changed does not count) or polls a job | `true` | One row a turn with the dollars per call, past `driveWarnTokens` | itself |
| `driveWarnTokens` | Context at which `driveWarn` can fire | `200K` | n/a | itself |
| `freshSessionTokens` | The brain's context | `400K`; `0` = off | One row, once a session: start a fresh session at the next phase boundary | `freshSessionTokens` |
| `sessionUsdCap` | T2 live eval | `50` | T2 does not start | itself |
| `evalLiveMaxUsd` | One T2 run | `1` | n/a | itself |

The mod reads a worker's cost from its `turn.complete` events and acts on its next tool call (given the running turn's `agentId`, it also calls `$.turn.abort`).
The band and `/delegation` show each live worker's cost so far: `(2 live: BE-310 $3.10, BE-314 $1.20)`. The host status line is retired.

## Rationing the week

The host reports each rate-limit window (`seven_day`, `five_hour`) as a percent used and a reset time. The mod keeps one record per local day and window, and shows a meter next to `focus` in the prompt footer:

    ██▉░░░░ 41% · day 3/7 · today 6.2/8.4 · on pace

- The bar is seven cells for the seven-day window (a day each) or five for the five-hour one (an hour each), filled by the percent used.
- `today a/b`: points of the window spent today, and today's allowance. With `rationDaily` 0 (the default) the allowance is what was left at the day's first reading, divided by the days to the reset. A number fixes it, and points earlier days left unspent show as `(+x)`.
- The pace is `on pace`, `ahead by x` (more spent than the hours so far allow) or `over by x` (the allowance is gone).
- `ration` picks the window: `seven_day` (default), `five_hour`, or `off` (no meter, no records).
- `/delegation ration` prints the bar with the reset time, today's line and the days so far. `/delegation` carries one `ration:` line. The dashboard pane draws the bar in colour (green under the allowance, yellow within 10% over, red beyond; `?` for a day with no record) and the Spend tile names the window.
- Day records are kept 14 days. Nothing else is stored.

## A worker's identity

The `tool.call` hook gives each worker its own identity, since a lock keyed on the inherited session id would be shared. It runs a recorded worker's Bash command behind

    export CHASSIS_SESSION_ID=BE-101-a2 CHASSIS_TASK=BE-101 CHASSIS_ATTEMPT=2; <the command as typed>

| Variable | Value |
| --- | --- |
| `CHASSIS_SESSION_ID` | `<task>-a<attempt>`; for a subtask other than `main`, `<task>.<subtask>-a<attempt>` (`BE-101.ui-a1`) |
| `CHASSIS_TASK` | the task id |
| `CHASSIS_ATTEMPT` | the attempt number, counted per task and subtask across spawns and resumes |

- It is an `export`, so `a && b` and scripts see it.
- Never rewritten: the brain's Bash; ad hoc agents; the debrief and eval runners;
  a worker started after `readyFallbackMinutes`; a command that already assigns `CHASSIS_SESSION_ID` (`x=… cmd`, `export`, `env`).
- The git guard, `delegateOnly` and the spend check judge the command as typed. No option.

## The cost formula

A worker's cost sums the `usage` of its `turn.complete` events (by `agentId`, reset per attempt), priced by the usage's model (else the spawn's) from `hooks/lib/cost.ts`:

    usd = (in·P_in + out·P_out + cacheRead·P_in·0.1 + cacheWrite·P_in·1.25) / 1e6

Prices per million tokens (in/out): opus-5-5 4/20, opus-5 5/25, fable-5-1 and fable-5 10/50, sonnet-5-5 2/10, sonnet-5 3/15,
haiku-5-5 0.10/0.50, haiku-4-5 1/5. Cache reads cost $0.20 for Opus 5.5 and Sonnet 5.5, $0.25 for Fable and Mythos 5.1, else 0.1x input. Haiku 5.5 bills 0.50/2.50 past a 100K prompt; usage arrives summed, so that rate cannot apply and a long run reads as a floor.
Verdict row, attempt record and ledger carry it: 4 places stored, 2 shown.

With no usage, or an unknown model, the row uses the session's cost growth over the attempt, shown as `usd=~2.91` (`usdApprox: true`); it includes concurrent spend.
