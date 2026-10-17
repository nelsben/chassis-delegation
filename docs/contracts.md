# Contracts and verification

The brief and report lines, and how a report is checked against git.

## The contracts

**Brief.** `/dispatch` writes `<root>/.delegation/briefs/<ID>.brief.md`. It
starts with one header line:

    [[brief v=1 task=<ID> subtask=main purpose=build tier=<tier> model=<alias> scope=<globs> forbid=<globs> red_test="<cmd>" gate=<ids> spend=<usd> budget=<n>-attempts report=chassis.report.v1]]

A card with an output folder or no repo adds `repo=`, `outdir=<abs>` and
`scratch=<abs>` after the gate and before `spend=` (see [Research cards](#research-cards)),
and a card that names resources adds `resources=<a,b>` after those (see
[Exclusive resources and fan-out](#exclusive-resources-and-fan-out)).

`spend=` is the per-attempt ceiling in dollars (GH-106): the card's `spend:`
when it has one, else the tier's entry in `spendByTier`; `0` writes none. The
body's Rules carry the line "Spend: about $<spend> for this attempt. Do what
the card asks and no more; when you are near it, stop and hand back what you
have with the report line." See Spend ceiling below.

The body comes from `hooks/templates/brief.md`. It tells the worker to:

- work only in its worktree;
- install first, by the lockfile at the repo root:

  | Lockfile | Install step |
  | --- | --- |
  | `package-lock.json` | `npm ci` |
  | `pnpm-lock.yaml` | `pnpm i --frozen-lockfile` |
  | `yarn.lock` | `yarn install --immutable` |
  | `requirements.txt` | `pip install -r requirements.txt` |
- write the red test first, and before changing any source save its failing
  output to `.delegation/<ID>/red-<attempt>.txt` in the worktree (a new file
  for each attempt);
- get the gate green and leave the tree clean;
- know its identity: `CHASSIS_SESSION_ID`, `CHASSIS_TASK` and
  `CHASSIS_ATTEMPT` are already set in every Bash call it makes (see "A worker's
  identity"), so it never sets them;
- commit and hold: never push, never open a PR, never commit on main;
- end with the report line.

The repo file's `briefExtra` adds lines for the repo. An existing brief is
reused, never overwritten (and it decides the mode: a reused `repo=here`
brief dispatches with no worktree, whatever the flags say). Two more fields
are optional: `scope_globs=` and `forbid_globs=` replace a prose scope or
forbid. A brief whose `scope=` is prose and that has no `scope_globs=` is not
refused: the verifier marks the scope claim `unchecked` (add `scope_globs=` to
check it), checks every other claim, and the verdict is `unverified` at worst.
Only a brief with no `scope=` at all is refused. Other header fields are optional too:

- `repo=none` marks a task with no git repo; `repo=<abs path>` (MOD-44) names the other local git checkout the task is for, and its worktree is the sibling `<path>-<ID>` (see [Delegating into another repo](#delegating-into-another-repo)); an older `repo=<dir>` with no `<dir>-<ID>` beside it still names the tree to verify. A `repo: none` card dispatches with no worktree, no fetch and no git (see [Research cards](#research-cards));
- `outdir=<abs>` is the card's output folder, outside the repo: the card's `outdir:`, else the folder of its first absolute scope entry. A gate command may name it as `{outdir}`, and a relative `artefacts=` path is read against it. `scratch=<abs>` is where the worker puts helper files (the card's `scratch:`, else `<system temp>/chassis-delegation/<ID>`), never in the repo; the brief template says so. `scratch=` is written whenever there is an `outdir=`, the card is `repo: none` or `repo: here`, or it names a scratch folder, and neither is written for a plain worktree card, so its header is the one it always was;
- `resources=<a,b>` (MOD-23) names the exclusive resources the task holds while its worker runs: free-form words such as `blender-live` (letters, digits, `.` `_` `:` `-`). A spawn of a brief that names a resource another running worker holds is queued, not started (see [Exclusive resources and fan-out](#exclusive-resources-and-fan-out)). Absent, the brief holds nothing and is held up by nothing;
- `repo=here` marks a task worked in the session's own checkout, no worktree (see [repo=here](#repohere-the-main-checkout));
- `base=<ref>` names where the delta starts when the worker commits (GH-10): a branch, `HEAD~2`, a sha. It beats `baseRef` and the `origin/main` chain. A value that is not a git ref (one starting with `-`, or a `a..b` range) makes the brief **refused**. `/dispatch <ID> --base <sha>` (and the tool's `base`) writes it whenever the base is not the default `origin/main`, in worktree mode and repo=here alike (GH-105): a card stacked on an unpushed sibling is cut from that sha and judged on what the worker added to it, not on the sibling's files. The brief's `base=` is the cut point and the diff base, and a dispatch that names a base writes it (MOD-2): against a reused worktree brief it sets or replaces `base=` in the header alone, amend blocks and body untouched, and the reuse line says so (`reused, base= set to <sha>` or `reused, base= replaced <old> → <new>`); a dispatch naming no base against a reused brief that carries one cuts the worktree from it. `--verify <sha>` takes its delta from the same `base=`. The verdict's scope line names the base it diffed from (`every changed path since <base> is within …`);
- `ignore=<globs>` (repo=here only) names paths taken off the delta before scope and files are checked.

A repo=here brief's body comes from the template's `{{#here}}` sections
instead of its `{{#worktree}}` ones. It tells the worker that it shares the
checkout with the brain and maybe other workers, to touch only its scope, not
to commit unless the card says so, and to report `branch=<current>` and
`sha=HEAD` (or the sha it committed). A template of your own without the
sections renders the same in both modes. A repo=none brief keeps the template's
`{{#none}}` sections instead; `{{#repo}}` (the red-test lines) is kept for the
other two modes; `{{#outdir}}` and `{{#scratch}}` are kept when the brief names
the folder, and `{{reportExtra}}` is the report line's `artefacts=` and `metrics=`
placeholders.

**Inline header.** A spawn needs no brief file. The header can sit in the
Agent prompt itself, which suits a subtask or a brain that does not use
cards. When the prompt names no `….brief.md` file and its header has all of
these:

- `task=`;
- `scope=` or `scope_globs=`;
- `gate=` or `repo=none`;

the mod writes the header, then the rest of the prompt, to
`<root>/.delegation/briefs/<task>.<subtask>.brief.md` (or `briefDir`). The
hand-back is verified against that file like any brief. A file already there
is reused, never overwritten, so a later attempt keeps its amend blocks. A
header that lacks a field is not verified, and the row names what is missing:

    note: no brief file named in the prompt; the inline header lacks gate= (or repo=none); verify skipped

**Spawn.** `/dispatch` and the dispatch tool spawn no worker (MOD-12, public
issue #22). After the brief, the worktree and the tier, the result ends with the
spawn block, the Agent tool's input as fenced JSON, and one line:

    spawn: Agent
    ```json
    {
      "subagent_type": "<agent type>",
      "model": "<the tier's alias>",
      "description": "<ID> <tier> <alias>",
      "prompt": "Your brief is the file <brief>. Read it whole, then follow it exactly."
    }
    ```
    The worker starts when you make this Agent call: pass the JSON above as its input, verbatim; the mod tiers it, records the attempt and verifies the hand-back.

The brain passes the JSON to its Agent tool as it is. The engine raises the
mod's `agent.spawn` hook for that call as for any spawn, and the hook shapes it:
it finds the brief, keeps the call's model when it is the tier's alias (else the
brief's tier decides, and the debug log says so), runs the worker in the folder
`/dispatch` prepared (the worktree, or the root for repo=here: the Agent tool
takes no folder), takes a worker slot and records the attempt (`kind: spawn`,
`source: brief`). From there the hand-back, the verdict, the ladder and the
ledger are what they always were. Because the brain made the spawn, the engine
runs the mod's other hooks for the worker too: the git guard on its Bash calls,
its turn usage, its hand-back. A subagent a plugin starts with `$.agent.spawn`
is stepped past by that plugin's own hooks, which is why the mod starts only its
debrief and eval runners that way: they need none of the hooks (and, as a last
resort, a ready worktree row the brain never claimed: see **The queue** below).

The hook refuses a spawn with the same one line the dispatch result gives:

- a second spawn of a brief whose attempt still runs:
  `chassis-delegation: BE-101 not spawned — already running as attempt 1 (agent agent-7); wait for its hand-back`;
- a spawn past the budget, or one whose worktree holds finished work (see
  **Look before you respawn** below);
- a spawn while every worker slot is taken:
  `queued: BE-101 — the mod will tell you when a slot frees (2 live: BE-99, BE-100; 1 queued: BE-101)`;
- a spawn of a brief whose `resources=` names one a running worker holds (MOD-23), a free slot or not:
  `queued: BE-101 — waiting for resource blender-live (held by BE-99)`.

**The queue.** The queue is advice. A queued task waits; when a hand-back frees
a slot, the verdict row says `ready: BE-101 — run its spawn block (/dispatch
BE-101 prints it again)` once, and the "Delegation state" section of the brain's
next prompt says it while it holds (a worker that ended with no hand-back frees
its slot there). The brain makes the spawn, which takes the task's queued place
(`started queued BE-101 (waited 4 min)`). A respawn verdict carries the next
spawn block in its advice the same way. While any row is ready or a respawn block
is pending, or a reviewer's spawn block is (MOD-21: `owed: T-4: review`), the
state section carries one posture line: make a ready row's spawn call, a respawn
block's Agent call or a pending review block's Agent call, without asking the
person; ask only when a verdict is refuted on a claim the brain cannot amend, a
worker is over-spend, or an amend needs the person's approval.

A row that waits for a resource (MOD-23) is not ready while a running worker, or a
queued row ahead of it, names the same resource, whatever the free slots: the
state section says what it waits for, `- queued: BE-101 (position 1) — waiting
for resource blender-live (held by BE-99)`, and no posture line comes of it. The
hand-back of the worker that held the resource carries the `ready:` line for the
next row that wanted it, and only that row: a second card for the same resource
stays queued behind the first. A row with no resources is never held up.

When the brain still does not act, `readyFallbackMinutes` (default 10; `0` is off)
is the last resort: a ready row left unclaimed that long is started by the mod
itself, through the same tier, budget and slot decision the brain's spawn takes,
and the attempt is recorded with `source: fallback`. Only a worktree brief is
started this way. A `repo=here` worker shares your checkout and a `repo=none`
brief has no worktree, so those always wait for the brain; past the timeout their
ready line says how long they have waited (`ready: BE-101 — run its spawn block
(/dispatch BE-101 prints it again) — waited 12 min; a repo=here worker shares
your checkout, so the mod never starts it`). A worker the mod starts itself runs
outside the mod's hooks, because the engine steps a plugin's own hooks past any
subagent that plugin starts: no git guard, no effort setting, and its cost known
only when it ends. The row the mod posts says so (`chassis-delegation: BE-101 was
ready for 10 min and the brain had not spawned it; the mod started it itself …`).
A row the brain spawns first, or one still waiting behind a full house, is never
started.

**Waking the brain.** Wakes are off by default (`wakeOnVerdict`, default `false`,
MOD-64). A wake is the `$.prompt.submit` the mod used to make after it posted a
verdict row (MOD-15): a turn of the brain's own, which the model reads as "The
chassis-delegation plugin sent a message". They were turned off because they
mostly repeated a row the brain had already read in the hand-back turn, a task it
had already merged or a question it had already relayed, and each one started a
turn in the person's place. With wakes off nothing calls `$.prompt.submit`: verdict
rows, `ready:` lines and the debrief's post question are still appended as rows,
the ledger and the state section hold every verdict, and the person is not
interrupted.

The wake existed for one reason. A worker's hand-back starts the brain's turn
before the verifier has finished, so a brain that ended that turn early would sit
idle on an unread verdict. With wakes off the brain keeps the waiting inside the
hand-back turn: **the hand-back-turn rule is to call the `verdict` tool with
`task=<id>` in that turn, before ending it.** The dispatch tool's text under the
spawn block says so, and the "Delegation state" section carries one posture line
saying so while a background worker is running or being verified (the dashboard's
open item for a worker being verified says `call the verdict tool with
task=<id>` instead of `the verdict lands on its own`).

The `verdict` tool (`mcp__chassis-delegation__verdict`) takes `task`, an optional
`subtask` (default `main`) and an optional `waitSeconds` (default 600, at most
900). When the task's latest attempt has been judged it returns at once, with the
verdict row exactly as the mod posted it and any `ready:` lines posted beside it.
While the verifier is still running it waits in clock waits of about 5 seconds,
reading only the mod's own attempt and spawn records (never a shell command), and
returns as soon as the verdict lands. At the timeout it returns
`<task>: still verifying after <n>s; call verdict again`; for a task with no
attempt it says so.

With `wakeOnVerdict` set to `true` the behaviour is as it was before MOD-64, and
what follows describes it. After the mod posts the row for a background worker's
hand-back, it calls `$.prompt.submit` once with that row and its next action
(`next=accept`, `next=resume agent=…`, the `ready:` line the hand-back freed, or
the respawn spawn block). It is never submitted as the person's words (no
`asUser`), and while the person is mid-prompt the engine holds it until idle. One
submit per verdict: a verdict the brain produced itself with
`/dispatch <id> --verify` in its own turn, and a foreground worker's verdict,
which rides its Agent result, wake nothing; an over-spend verdict does wake, so
the brain can tell you.

With wakes on, a verdict whose task is already merged does not wake (MOD-35). Before it submits,
the mod asks MOD-4's retire check about a consistent hand-back: the attempt's sha an
ancestor of `origin/main`, the card there reading `status: merged`, or an accept
already recorded. When the answer is yes the row is still posted, no wake is sent,
and the debug log says `wake skipped: <id> already merged` (a `ready:` line the
hand-back freed is still submitted). A refuted, no-report, over-spend or reviewed
verdict is never skipped by this rule.

The same check runs again at delivery (MOD-42). While the brain's own turn is open
the engine could only deliver a wake after it, by which time the brain has usually
read the verdict from the ledger and merged. So a wake raised during that turn is
held in the mod's session state and submitted at the turn's end, as one message,
after re-running the merged check for each consistent verdict; one whose task is
merged or accepted by then is dropped with the debug line
`wake skipped: <id> merged before delivery`. Refuted, over-spend, no-report and
`ready:` wakes are never dropped. A wake raised while the session is idle is submitted
at once. A held wake is not sent when a later step of the brain's turn already read
its row (MOD-62): the debug line is `wake skipped: <id> read in the turn` (`row` when
the wake has no task), and the row stays in the conversation and the ledger. A row
that landed during the turn's last step, with no step after it, still wakes the
brain. If the session ends before the turn does, nothing is lost: the ledger and the
state section hold every verdict.

**Report.** The worker's hand-back ends with the report line. The mod reads
the last one across the worker's final answer and its SubagentHandback
message; for a background worker it reads that message from the worker's own
transcript:

    [[report v=1 task=<ID> subtask=main branch=<branch> pr=<none|n|url> sha=<sha> gate=pass|fail red=<path|none> files=<a,b> artefacts=<a,b> metrics="k=v,k=v"]]

`red=` names the red test's failing output (GH-20): a file the worker
saved before changing any source, relative to its worktree, such as
`.delegation/<ID>/red-1.txt`. `.delegation/` is gitignored; the verifier reads
the tree, not git. A resume or respawn writes a new file for its attempt. The
field is optional: a brief whose `red_test=` is empty or `none` asks for no
evidence, and the worker may write `red=none`.

`artefacts=` and `metrics=` are optional too (MOD-22). `artefacts=` is a comma
list of the files the worker delivered, relative to the brief's `outdir=` (else
the tree) or absolute; the verifier checks each exists and is not empty (a folder:
has an entry), and the claim fails naming the first that is missing or empty.
`metrics="k=v,k=v"` is numbers or words worth keeping, such as
`metrics="tris=1200,len_s=2.4"`: they are recorded on the attempt (`metrics`) and
shown in the verdict detail as `metrics: tris=1200, len_s=2.4`, and never judged.
Both are absent from the report line of a brief with no output folder.

**Amend.** A worker that had to change a file outside its scope says so on its
own line, just above the report:

    [[amend v=1 scope+=<path> reason=<one line>]]

The mod appends the block to the brief before verifying. It never rewrites
the header. The verifier discloses each block it applied as
`amendment: #n …`.

- **`scope+=` and `forbid+=`** go in on the worker's word.
- **A `scope+=` inside a forbid glob** waits for you too: forbid wins over scope, so to allow a path under a forbid glob you must shrink the forbid with `forbid-=`; `scope+=` alone does nothing. The row says `amend needs approval: scope+=P lies inside forbid Y; scope+= alone does nothing, shrink the forbid`. `/dispatch` warns of the same at render, once per entry: `warning: scope entry X is inside forbid Y and can never be touched; shrink the forbid (forbid-=) to allow it`. The dispatch still proceeds.
- **`scope-=` and `forbid-=`** wait for you. The row says `amend needs approval: …`, and the verdict is the un-amended brief's.
- **A gate failure only a forbidden file can fix** (MOD-55): the brief tells the worker not to touch the file but to hand back gate=fail with `[[amend v=1 forbid-=<the forbid entry that covers it> scope+=<path> reason=<the one-line fix>]]`. The verdict's next step, for a refuted gate or a confirmed gate=fail whose lines hold an `amend needs approval:` line carrying `forbid-=`, is `approve the amend (append it to <brief>), then resume agent=<id> to make the fix; or refuse it` (with no agent left, the same brief respawned at the same tier). It never escalates the tier, and an exhausted budget still stops. `/dispatch` also warns once when a path-like word of `red_test` is outside the scope (`warning: red_test names <path>, which is outside scope`) or inside a forbid (`… which is inside forbid <glob>`); nothing is added to the scope.
- **`ignore+=<globs>`** (repo=here) takes more paths off the delta. Since it hides paths from the check, it always waits for you, like `scope-=`.
- **A malformed block** makes the scope unknowable. The scope claim is then left unchecked.

## How a report is verified

The worker's tree is the `repo=` in the brief header, else the worker's
worktree, else the session root. Verification uses read-only git in that tree
and runs the gate there. It never uses a fresh checkout and never installs
anything. Each claim is held, failed or unchecked.

| Claim | Held when |
| --- | --- |
| `branch` | `refs/heads/<branch>` (or `refs/remotes/origin/<branch>`) exists |
| `sha` | it resolves (`rev-parse --verify <sha>^{commit}`) and is an ancestor of the branch. A sha that does not exist is **failed** (fabrication) |
| `scope` | every path changed between `merge-base(<base>, sha)` and the sha matches a scope glob and no forbid glob. `<base>` is a replay's own base, else the brief's `base=`, else `baseRef`, else the first of `origin/main`, `main`, `origin/master`, `master`. A brief with absolute scope or forbid entries (MOD-22) is also held to the outside delta (see [Research cards](#research-cards)), and a refute names the delta it came from |
| `files` | `files=` equals that changed set exactly. A moved file is listed once, at its new path (git's rename detection; an old path listed too is dropped, not refuted). A path missing from it or invented in it is named. An entry ending in `/` stands for the changed files under that folder; `dir/**` for every changed file under `dir/`, and `dir/*` for those exactly one level under it (MOD-27); a folder entry with none changed is an invented path |
| `gate` | the tree's HEAD is the sha and `git status --porcelain` is empty. Then each gate id runs from `gateMap` in the worktree: exit 0 under `gate=pass` holds, non-zero is failed and shows the last 8 output lines, and `gate=fail` with a red gate holds (an honest stop). A gate red only on timeouts in tests the delta never touched is run once more (see below) |
| `red` | only when the brief's `red_test=` is set (not empty, not `none`). The `red=` file lies in the worker's tree, is not empty, holds a failure marker (`fail`, `error`, `not ok`, `✗`, `exit code 1`-`9`, `exit 1`, `AssertionError`, `expected`; any case), and, if byte-identical (sha-256) to an earlier attempt's red file for the same task and subtask, that attempt's own red claim held (one proof per task: it is held again, `attempt n's proof, reused`). Held shows its size and first failure line: the first marker line with a failing word (`Fail`, `failed`, `not ok`, `✗`, `✕`), else the first marker line whose outcome does not read as passing (a whole-word `pass`, `passed` or `ok`, or a `✓`/`✔` mark, with no failing word), so a passing test named `…Error…` is not quoted (MOD-27). No `red=` or no marker is unchecked; a path outside the tree, a missing or empty file, or an earlier attempt's file that did not itself hold is **failed** |
| `artefacts` | only when the report names `artefacts=` (MOD-22). Each path exists and is not empty (a relative one is read against the brief's `outdir=`, else the tree); the first that is missing or empty fails the claim, named. Unreadable is unchecked. No `artefacts=` is no claim |
| `pr` | `pr=none`, or `gh pr view <n> --json state` finds it |

The gate is left unchecked, never failed, in these cases:

- the tree is dirty, or HEAD is not the sha;
- the gate id is not in the map;
- the gate exits 126 or 127, meaning the environment, not the code.

**A gate that ran beside another worker's (MOD-20).** The engine suite gives
each test 5 seconds, and two suites on one machine at once blow it: tests the
worker never touched time out and a clean branch reads as refuted. So a red gate
whose every failing test failed only with the engine's `timed out after N ms`,
and none of them in a test file the delta changed, is run once more before the
claim is made. When the second run is green the claim says so:

    claim gate: held — gate green on rerun (first run: 2 timeouts in untouched tests) at a1b2c3d (gate=pass confirmed)

When it is red again the attempt is refuted as it always was, the last 8 lines
are the second run's, and a `note:` line says the gate was run twice. A failure
that is not a timeout (an assertion, an error), a timeout in a test file the
delta changed, and any output the mod cannot read as a list of failing tests
(no `(fail)` lines, or a `fail` total that counts more than were read) are never
run again. The rerun reads the output of `claude plugin test` (`(fail) <name>`
under a `<file>:` header, `Error: timed out after 5000 ms` under it).

**Engine gates take turns (MOD-20).** A gate-map command that runs
`claude plugin test <folder>` is an engine gate. The verifiers of one session
run them one at a time: a verifier takes `delegation.engineGate` in the store
before its engine gate and clears it after, and one that finds another's lock
still live waits, looking again every 5 seconds. The lock expires after the gate's own
timeout (9 minutes), so a crash never wedges the rest, and if the store cannot
be read the gate runs without a turn. A rerun stays inside the turn. The wait is
one line of the verdict detail, ahead of the gate claim:

    waited 40 s for MOD-x's engine gate

Other gates (`claude plugin validate`, a node suite) take no turn.

The changed paths are written to `<root>/.delegation/<ID>/files.txt` before
the gate runs. A gate command can take them as `{files}`, and the absolute
path of the tree it runs in (the worktree, or the root for `repo=here`) as
`{worktree}`: `claude plugin validate {worktree}`. A research card's output
folder (MOD-22) is `{outdir}`: `node scripts/check.mjs {outdir}`. Each takes an
absolute path with no `..`, once per word. A command that names `{outdir}` when
the brief has no `outdir=` is "gate not re-run".

The verdict:

| Verdict | When | The row's `next=` |
| --- | --- | --- |
| **refuted** | any claim failed | `resume agent=<id>`, then a respawn |
| **unverified** | no claim failed, but one could not be checked | `resume … — prove: <claims>` while the budget lasts, else `check by hand` |
| **consistent** | every claim held | `accept` |
| **consistent**, `review` on | every claim held, and the `review` option calls for a reviewer | `review`, with the reviewer's spawn block under the row (see [Review](review-and-merge.md#review)) |
| **refused** | the brief is unusable | `fix the brief` |
| **no-report** | no report line | `resume`, then a respawn at the same tier |

`consistent` means every machine-checkable claim of the report matches git:
the branch, the sha, the files, the scope, the gate and the red evidence all
held. It is not a review. Nothing in the check reads the diff, so a worker that
cleanly builds the wrong thing gets the same row as one that builds the right
thing, and the brain still reads the diff before it accepts (or, with the
`review` option on, a reviewer reads it first: see [Review](review-and-merge.md#review)). A report that
declares `gate=fail` honestly is never accepted, whatever else holds: its row
reads `consistent (report gate=fail)` and `next=` resumes the worker.

**Deprecated: `verified`.** Up to 0.7.0 this verdict was called `verified`. The
mod stopped writing that word at 0.8.0 (the verdict row, the `verdict=` line,
the attempt records, the ledger lines, the dashboard, the state block and the
debrief all say `consistent`). One read-only normaliser reads a stored attempt
record, verdict line or metrics count that still carries the old word as
`consistent` (MOD-49), so it escalates, retires, accepts and counts as a
success exactly as a consistent one does. A ledger line already written keeps
its word, because the file is append-only. A script that parses the row text,
`verdict=` or `.delegation/ledger.jsonl` should accept both words.

`repo=none` changes the check (and the row says `(no repo)`). The verifier
then checks only these things:

- every `files=` path exists;
- every path lies in scope and outside forbid;
- the gate exits 0;
- and, for a brief with an output folder (MOD-22), the outside delta and the
  `artefacts=` (see [Research cards](#research-cards)); the metrics are shown.

That gate is a map id, or a bare allowlisted command such as
`claude plugin validate <folder>`.

**Cardless hand-backs.** An ad hoc spawn (the Agent tool with no header and
no brief file) that hands back a `[[report …]]` line is verified too, for what
git can say without a brief. The tree is the spawn's cwd, else the session
root. `branch`, `sha`, `files` and `pr` are checked as above; `scope`, `gate`
and `red` are unchecked, with this reason:

    no brief: no scope=/gate=/red_test= to check against

So a cardless verdict is refuted (a sha off the branch, a files= that invents
a path) or unverified, never consistent. No gate runs and no files.txt is
written. The row is posted like any other, the attempt is recorded under the
report's `task=` (or `adhoc-<key>` when it names none) with `adhoc: true`, and
the ledger line is written. No budget ladder applies: `next=` says `accept`
for consistent, `check the diff` otherwise, and never resume or respawn. A
cardless attempt never counts toward a later dispatch of that task: the
budget and the escalation ladder read only attempts that had a brief. An ad
hoc spawn that hands back no report is judged as before: `no-report` in the
foreground, nothing in the background.

**A worker stopped by a usage limit (MOD-56).** The engine's `turn.complete` event
carries no error text (only `reason`), so the mod reads the hand-back text, and only
when it holds no `[[report]]` block (a worker writing rate-limit code is never taken
for a stopped one). Any of `hit your weekly limit`, `usage limit`, `rate limit`, `too many requests`, or a `429` beside http, status, error or api (never a bare `429`: a sha, a line number or a count),
in any case, marks the stop. The attempt record and its ledger row then carry
`stop: rate_limited` (and `resetsAt` when the text names a reset time), and the
verdict row reads `no-report (rate limited[, resets <time>])`. `next=` is what a
no-report always had: `verify sha=<sha>` when finished work is in the worktree. While
the last worker of the session stopped this way, a freed slot does not announce a
queued task ready; the row reads

    held: <task> queued; the last worker stopped on a usage limit at HH:MM[, resets <time>]; dispatch it when the limit resets

and the mod's own ready fallback starts nothing. The hold clears on the next spawn the
brain makes.

### repo=here: the main checkout

`repo=none` is the far end (no git at all). `repo=here` is the middle: a git
repo, but no worktree. It suits a repo with no `origin` (a local-only repo),
code in a nested child repo, or evidence (traces, results) that lives only in
the main checkout and would vanish with a worktree (GH-16, GH-19, GH-10).

**Dispatch.** `/dispatch <ID> --here` (the tool's `here: true`, or the card's
`repo: here`) writes the brief with `repo=here`, `base=<ref>` when one is
named, and `ignore=<globs>`. It runs no fetch and no `git worktree add`; the
worker spawns with its folder set to the session root. The only git it runs
reads the current branch (`rev-parse --abbrev-ref HEAD`), and the sha `HEAD`
is at when `baseRef` is `HEAD`. The steps say:

    3. no worktree (repo=here): the worker shares /path/to/root

- **`base=`** is a sha given with `--base`, else `baseRef`. A `baseRef` of
  `HEAD` is pinned to the sha HEAD is at when you dispatch, so a worker that
  commits is measured from where it started. With neither, the brief names no
  base and the verifier uses the chain.
- **`ignore=`** is the config's `ignore` (default `.delegation/**`) plus the card folder (`<cardDir>/**`, GH-111, so a new card is never in the worker's delta) plus the
  files= already claimed by the other repo=here cards in flight in this
  checkout. A card is in flight while one of its store records
  (`delegation.tasks.<ID>`, marked with this root) has no verdict yet.
- **The overlap check.** If an in-flight repo=here card in this checkout has a
  scope glob that overlaps this card's (one glob's literal prefix matches the
  other glob, the same conservative rule as the scope-inside-forbid warning),
  the dispatch is refused before anything is written:

      /dispatch BE-101: refused — BE-101 scope src/** overlaps in-flight GH-19 scope src/lib/** in the shared checkout; both would claim the same paths (pass --force-overlap to dispatch anyway)

  `--force-overlap` (the tool's `forceOverlap: true`) lets it through with a
  `warning:` line instead. A record whose worker died stays "in flight" until
  it gets a verdict; force past it, or judge it. **A shared resource is not
  overlap** (MOD-24): a card whose `resources` name one that an in-flight
  repo=here card's brief names is not refused. Overlapping paths corrupt each
  other's dirty-tree delta, which is why a scope overlap refuses; a shared resource
  only needs sequencing, which the queue does. The card is dispatched, and while a
  worker that holds the resource still runs it is queued with the waiting line
  (`queued: BE-101 — waiting for resource blender-live (held by GH-19)`, see
  [Exclusive resources](#exclusive-resources-and-fan-out)) and made ready when that
  worker hands back. No `--force-overlap` is needed for it. A scope overlap
  refuses exactly as above, with or without a shared resource, and still needs
  `--force-overlap`.
- `--here` and `--replay` do not mix: a replay works in its own worktree.

**Verify.** The tree is the session root. Each claim:

| Claim | Held when |
| --- | --- |
| `branch` | it is the checkout's current branch (`rev-parse --abbrev-ref HEAD`). Another branch is unchecked, not failed: the brain may have switched |
| `sha` | `HEAD`, `none`, or a sha that resolves. A sha that does not resolve is **failed** (fabrication) |
| `scope`, `files` | as for any brief, on the subtracted delta (below) |
| `gate` | each gate runs at the root on the tree as it stands. The dirty-tree rule does not apply, and the gate line says so: `… (gate=pass confirmed; repo=here: the dirty tree is allowed, the clean-tree rule does not apply)` |
| `pr` | as for any brief |

The delta:

1. With `sha=HEAD` or `sha=none`, it is every path
   `git status --porcelain=v1 --untracked-files=all -z` names: staged,
   unstaged and untracked, a rename as its new path. With a real sha, it is
   `merge-base(<base>, sha)..sha` as above.
2. Then the brief's `ignore=` globs (plus any `ignore+=` amend, and the
   config's `ignore`) come off.
3. Then the files= of the other repo=here cards in flight in this checkout,
   read from the store at verify time, come off. A worker's files= is written
   to its record when its hand-back arrives, before its own verify, so two
   workers that hand back together each see the other's.

One line, before the scope and files claims, names every subtraction (five
paths a group at most):

    ignored: 1 path by ignore= (.delegation/briefs/BE-101.brief.md), 1 path belonging to GH-19 (src/b.ts)

What it does not verify: who wrote a path. A file another worker is still
editing and has not claimed yet is in the delta; so is a card's work after
its verdict is in and before you commit it. Commit (or stash) an accepted
repo=here card's files before the next hand-back is verified, or add them to
`ignore`. A repo=here worker does not commit unless its card says so, and the
git guard still denies a commit on `main`.

**A nested child repo.** Run Claude Code with the child as the session root
(`cd child && claude`). The mod reads only `<root>/.chassis-delegation.json`,
so the parent's file is never consulted; `/delegation init` there writes the
child's own files (cards, config, `.gitignore` line). Dispatch from the child
with `--here`, or with worktrees if the child has an `origin`.

**Escalation.** A failing verdict while the budget lasts is handled in two
steps. The first failure advises `next=resume agent=<id>`, which means
SendMessage the worker the claim lines. A later one advises a respawn with the
same brief. After a refuted report, or a `gate=fail` the verifier confirmed
(the verdict is consistent), that is `next=respawn at <next tier>`, one tier up.
After a no-report it is `next=respawn at <same tier>`: a missing report line
is a reporting defect, not a reason to pay for a bigger model, so a no-report
never moves the tier up (a respawn after an attempt that was already
escalated keeps that attempt's tier, and the debug line says it was picked by
the last attempt's tier). A refute whose first failed claim is `scope`,
`files`, `branch` or `pr` holds the tier too: it says the brief's globs (or the
base) were wrong, not that the worker was out of its depth. Only a refute on
`sha`, `gate` or `red` (or a record from before the mod kept `firstFailed`)
earns the next tier. A scope refute advises
`next=resume agent=<id> — amend: [[amend v=1 scope+=<path> reason=…]]` with the
first out-of-scope path filled in (for a path from the outside delta, `remove <path>, or amend: …`); a files refute advises listing the paths in
`files=` (or reverting the extras); a later respawn says
`(held: a scope refute)` or `(held: a files refute)`. A respawn verdict carries
the next spawn block under its row (the tier the spawn hook will pick); the
brain makes it, and with `autoEscalate` on as well: `autoEscalate` performs a
resume itself (a message to the worker), never a spawn. The budget counts spawns,
resumes and verify attempts per task. Past it the next spawn is denied.

Resuming after accept: the brain may also resume a worker whose last attempt was judged
consistent (or unverified), with a `SendMessage` of its own, when reading the diff shows
a problem the claims could not. When that worker hands back a report at a different sha,
the mod records the next attempt (kind resume, same lineage, counted against `budget=`)
and judges it like an advised resume's: the verdict row posts and the ledger gains its
row. A hand-back at the same sha is the `--verify` re-judge and changes nothing. Past
`budget=` it is still judged, and the row says the budget is spent.

Unverified is actionable too. While the budget lasts, an unverified verdict
advises a resume naming each unchecked claim and its reason (cut to 160
characters):
`next=resume agent=<id> — prove: gate (tree not at sha: 1 uncommitted path …), red (…)`.
That resume counts against the budget like a failing verdict's, and
`autoEscalate` performs it, sending the unchecked claim lines. Past the budget,
or with no agent id, the advice stays `check by hand — unverified is not a pass`.

**Look before you respawn.** Before a respawn (the brain's spawn of the same
brief, from a spawn block or by hand, and a dispatch preparing one) and before
it advises or performs a resume, the mod reads the worker's worktree with allowlisted git reads only: `rev-parse HEAD`,
`status --porcelain` and `log --format=%H <base>..HEAD` (`<base>` as the
verifier takes it). Work is present when HEAD has commits ahead of the base,
the tree is clean, and the verifier has not judged that sha yet. Then nothing
is spawned or resumed, the attempt is recorded as `work-present` (kind
`verify`, the head as its `sha`), and the row says:

    chassis-delegation: T-4 attempt 1/3 no-report · sonnet · $0.41 · next=verify sha=<sha>
    work present at abcdef1 on agent/frontend/T-4: verify it (next=verify sha=<sha>)

A respawn by hand is refused with the same line. A repo=here or repo=none
task, and a worker with no worktree of its own, are not looked at. A refuted
attempt whose HEAD is still the sha it reported is not new work, so its resume
or respawn goes ahead as before.

**`/dispatch <ID> --verify <sha>`** (the tool's `verify`) judges that work with no
spawn. It reads the task's existing brief and runs the verifier in the task's
worktree (the root for repo=here) at the sha, with a synthetic report:

    [[report v=1 task=T-4 subtask=main branch=agent/frontend/T-4 pr=none sha=<sha> gate=pass files=<the delta>]]

`files=` is the delta `merge-base(<base>, sha)..sha`; `gate=pass` means the
gate is re-run, so a red one refutes; `red=` names the newest
`.delegation/<ID>/red-<n>.txt` in the tree when the brief has a red test. The
verdict lands in one of two places. When the sha is the one the last attempt
record already names (a hand-back the brain is re-judging, say after amending
the brief), it re-judges that attempt: the same attempt number, no new record,
no budget spent, the first line `re-judging attempt n/b at <sha>`, and the
attempt's verdict and advice replaced. Otherwise it lands on the work-present
attempt, or on a new `verify` attempt. The advice follows as for any hand-back:
`accept`, or a resume of the worker that did the work. `--verify` takes no other option, and it is refused while
a worker of the task is still running.

**The git guard (Bash).** It covers the write verbs `commit`, `merge`,
`cherry-pick`, `rebase` and `push`. A command that runs one on a branch in
`guardBranches` is denied:

    chassis-delegation: no <verb> on <branch>; branch first (git checkout -b agent/<domain>/<id>)

A worker the mod recorded (matched by the `agentId` its tool calls carry) is
held to the same rules, and its refusal names its task:
`chassis-delegation: no push on main (T-7); branch first (...)`. A `repo=here`
worker on `main` is refused a commit or a push like the brain; a worktree
worker on its own `agent/<domain>/<id>` branch is untouched.

To find the branch, the guard reads `git rev-parse --abbrev-ref HEAD` in the
command's folder. It follows `cd` and `-C`, and a `checkout -b` earlier in the
same command. A push that names a guarded branch (`git push origin main`,
`HEAD:main`, `--all`) is denied from any branch. On a guarded branch, a push
is a push of that branch only when it has no refspecs, or one is `HEAD`, the
branch's name, `<branch>:<x>`, `--all` or `--mirror`; tag pushes
(`git push origin v1.2.3`, `--tags`) and deletes or pushes of other branches
(`git push origin --delete agent/mod/GH-21`) pass. The guard reads command
words, not text, so a heredoc body that mentions `git commit` never triggers
it. It sees every worker as well as the brain: a worker is the brain's own Agent
call (MOD-12), so the engine runs the mod's `tool.call` hook for the worker's
Bash calls, and a repo=here worker on `main` cannot commit there.

### Delegating into another repo

A brain rooted in one repo is sometimes asked to build something in a sibling: the first version of a
new project, with its own `origin/main`, its own gates (`npm run build`, `npm test`) and no
`.chassis-delegation.json`. Give `repo` as the absolute path of that git checkout (the folder holding
`.git`; `~` is expanded) on the `card` tool, on the `dispatch` tool (`repo`) or on `/dispatch`
(`--repo <path>`), or write `repo: /path/to/checkout` in a card. For that task every place the mod
touches a repo uses that path instead of the session root:

- **The card** is written to that repo's card folder when it has a `.chassis-delegation.json` (its
  `cardDir`), else under this session's own `.delegation/cards/<repo folder name>/`, so another
  project's work never lands on this project's board. Ids stay unique across both boards. The tool
  remembers the repo for the id, so `dispatch` with the id alone finds the card.
- **The base and the worktree.** `git -C <path> fetch -q origin main`, then the worktree is cut from
  that repo's `origin/main` beside it: `<path>-<ID>` on `agent/<domain>/<ID>`. The brief header carries
  `repo=<path>`; the brief itself, the ledger row and the verdict row stay with the session.
- **The verifier, the scope delta, the red file and the gate** run in that worktree, against that
  repo's `origin/main`. The attempt record's `root` (MOD-37) is that repo. The merged check that retires
  an owed row asks that repo's `origin/main`.
- **Its config.** The repo's own `.chassis-delegation.json` supplies the gate map, domains, `cardDir`
  and spend when it exists. When it does not, the gate is the repo's own detected gate, the one
  `/delegation setup` would write (`package.json` `scripts.test`, else pytest, cargo or go test), as the
  gate id `test`; the card tool's `gate` may also be one command written out (`"npm run build"`: words
  only, no comma, under the gate rules). The dry run prints
  `repo: <path> (config: its own | none, gate: <cmd>)`, and the worker's brief names the command.
- **The allowlist** accepts the same git forms with `-C` equal to the task's repo path, for a task that
  names it and for no other (`worktree add` only for that task id, that path, that repo's domains). The
  git guard refuses a worker's commit or push on that repo's `main` or `master` exactly as for the
  session root.
- **The scheduler, the dashboard and `/delegation`** show the repo folder name beside such a task:
  `T-1 [notes-app]`.

Refused in one line, naming why: a path that is not absolute (`repo ../notes-app is not an absolute
path`), the session's own repo (leave `repo` unset), a folder with no `.git`, and a path with characters
a git argument should not carry. `worktree`, `here` and `none` are unchanged. Not supported:
`--replay` for another repo.

**Setting the other repo up first (MOD-45).** `/delegation setup <path>` and `/delegation init <path>`, and
the `setup` and `init` tools with `path`, run their checks and their scaffold against that checkout
instead of the session root, and write nothing in the session root: the card folder README, its
`.chassis-delegation.json` with the detected gate, and the `.delegation/` line in its `.gitignore`,
through the mod's own write path (so `delegateOnly` is not involved). Never overwriting a file, as
at the root. The path is absolute (`~` expanded) and holds a `.git`; anything else is refused in one
line. Setup's handover for a path ends with `Next: call the card tool with repo set to <path>`, so
the next card goes into that repo. With no path both commands are unchanged.

An example, with the session rooted in `/Users/you/api-server` and a new sibling `/Users/you/notes-app`:

    You: build the first version of notes-app next door: an add and a list command.
    Claude calls card { repo: "/Users/you/notes-app", title: "notes add and notes list work",
                        scope: ["src/**", "tests/**"], redTest: "npm test", ... }
      wrote /Users/you/api-server/.delegation/cards/notes-app/OPS-1-notes-add-and-notes-list.md
      repo: /Users/you/notes-app (config: none, gate: npm test)
    You: go.   Claude calls dispatch { task: "OPS-1" }
      3. worktree /Users/you/notes-app-OPS-1 on agent/ops/OPS-1 from origin/main

### Research cards

Some lanes do not change code. They extract a model from a running app, render
images, record a sound, write notes: the outputs land in a folder outside the
repo, the work often needs the live checkout and its running app, and there is
no test to turn green and nothing to commit. Run as ad hoc spawns, those lanes
made claims nobody could check (a report said a glTF validator passed when none
was installed; another claimed byte-identical output nobody had run, and left
scratch files inside the repo). A research card is an ordinary card with four
changes, and it goes through the same dispatch, hand-back and verdict:

1. **`repo: none` or `repo: here`.** The `card` tool takes `repo` (`worktree`,
   the default; `here`; `none`) and writes it on the card; `/dispatch` reads it
   from the card exactly as it reads `--here`. `here` shares the session's
   checkout (the live app is there); `none` is no repo at all: no worktree, no
   fetch, no git, the worker runs in the session folder. The tool's description
   says when: research or extraction with outputs outside the repo, repo none or
   here, scope = the output folder.
2. **Scope names the output folder.** `scope` and `forbid` may hold absolute
   paths and globs (`~` is the home folder). The first absolute scope entry is the
   card's `outdir` unless the card names `outdir:` itself, and the header gains
   `outdir=<abs>` and `scratch=<abs>`. The brief tells the worker to put
   deliverables in the output folder and every helper file in the scratch folder,
   never in the repo.
3. **The verifier lists the folders before and after.** At dispatch the mod
   lists (relative path, size, modification time) every absolute scope and forbid
   *root*, the folder of each absolute entry, and stores the listings
   (`delegation.outside.<ID>`). At hand-back it lists them again. The scope claim
   covers both deltas: every git path against the repo entries, and every
   *changed* outside path (added, removed, or a different size or time) against the
   absolute entries: inside a scope entry and outside every forbid entry. A
   refute names the delta it came from:

       claim scope: failed — out-of-scope path: /out/notes/scratch.txt (outside delta)
       claim scope: failed — out-of-scope path: scratch.py (repo delta)

   A root that does not exist yet lists as empty. A root that exists but cannot be
   read leaves the claim **unchecked**, never held. A root that holds more than 10000
   files is not listed: the dispatch records the time before its walk (a watermark,
   and says so: `<root> holds more than 10000 files, so changes there will be found
   by modification time`), and at hand-back the root is walked again (links not
   followed, at most 1000000 entries; past that the claim is unchecked, naming the
   root and the ceiling). Every file and every folder modified since that time counts
   as changed (a folder's time moves when an entry in it is added, removed or
   renamed, so a deletion shows as its folder) and is judged against scope and
   forbid like a listed root's delta; nothing newer holds the claim, said to be
   checked by modification time. A root nobody listed at dispatch while others were (a root an amend
   added) is unchecked too. A brief with no listing at all (one that never went through `/dispatch`)
   is checked as it always was, plus `note: outside delta not checked: …`. The mod can only see
   the folders the card names, so name what you want watched: a `forbid` entry such
   as `~/exports/avatar/**` is listed too, and a change under it fails the claim.
4. **The gate runs against the folder, and the report can say what it made.** A
   gate-map command may carry `{outdir}`, filled with the brief's `outdir=` at
   verify time; the allowlist accepts it word for word with only `{outdir}` and
   `{worktree}` filled. The report gains `artefacts=` and `metrics=` (see **Report**
   under [The contracts](#the-contracts)): the `artefacts` claim fails naming the
   first path that is missing or empty, and the metrics are recorded and shown,
   never judged.

A `repo: none` card's gate runs in the output folder (the folder of its first
scope entry), so name a gate script by an absolute path or put it on `PATH`; a
`repo: here` gate runs in the checkout, so a path relative to the repo works.

`repo: none` and `repo: here` cards go through the same claims; the git ones
(branch, sha, files, red, pr) apply only to `here`, and a `none` card keeps the
`repo=none` check (`files=` exist and are in scope, the gate exits 0) with the
new claims added. A `none` card's report reads `branch=none sha=none red=none
files=none`.

**Worked example: a hair lane.** The lane exports the hair model from the running
app, renders two turntable views and checks its own output. The repo has a script,
`scripts/check-hair.mjs <folder>`, that fails when `hair.gltf` does not validate
(and when no validator is installed), and exports twice to compare hashes. The
gate map names it, so the claim "validator passed" and the claim "byte-identical"
are both re-run by the verifier rather than taken from the report.

`.chassis-delegation.json`:

    { "gateMap": { "hair-check": "node scripts/check-hair.mjs {outdir}" } }

The card (the `card` tool writes this from `repo: "here"`, `scope: ["~/exports/hair/**"]`
and `forbid: ["~/exports/avatar/**"]`, with the next free id):

    ---
    id: OPS-40
    title: Export the hair model and two turntable renders from the running app
    domain: ops
    tier: standard
    status: queued
    repo: here
    scope: [~/exports/hair/**]
    forbid: [~/exports/avatar/**]
    red_test: none
    gate: hair-check
    budget: 2-attempts
    ---
    ## Why

    The hair model is rebuilt by hand each time. Export it from the running app
    into the output folder, with front and side renders, and say what you measured.

    ## Done when

    - `hair.gltf`, `front.png` and `side.png` are in the output folder and not empty
    - `scripts/check-hair.mjs` passes on the folder (it validates the glTF and exports twice to compare)
    - nothing else changed: no scratch files in the repo, none under `~/exports/avatar/`

The brief header `/dispatch` writes (home folder `/home/ana`):

    [[brief v=1 task=OPS-40 subtask=main purpose=build tier=standard model=sonnet scope=/home/ana/exports/hair/** forbid=/home/ana/exports/avatar/** red_test="none" gate=hair-check repo=here ignore=.delegation/**,agents/tasks/** outdir=/home/ana/exports/hair scratch=/tmp/chassis-delegation/OPS-40 spend=10 budget=2-attempts report=chassis.report.v1]]

The worker's last line, then the verdict:

    [[report v=1 task=OPS-40 subtask=main branch=main pr=none sha=HEAD gate=pass red=none files=none artefacts=hair.gltf,front.png,side.png metrics="tris=18400,export_s=3.1"]]

    chassis-delegation: verdict=consistent task=OPS-40 attempt=1/2 …
    claim scope: held — every changed path is within scope=[/home/ana/exports/hair/**], forbid=[/home/ana/exports/avatar/**] untouched; outside delta: 3 changed paths under /home/ana/exports/hair, /home/ana/exports/avatar, every one within scope and none in forbid
    claim files: held — files= matches the dirty-tree delta exactly
    claim artefacts: held — 3 artefacts exist and are not empty: hair.gltf (212004 bytes), front.png (88120 bytes), side.png (87904 bytes)
    claim gate: held — gate green in the shared checkout … (gate=pass confirmed; …)
    metrics: tris=18400, export_s=3.1

Had the worker left `scratch.json` in the repo, the scope claim would have failed
on the repo delta; had it written into `~/exports/avatar/`, on the outside delta;
had it named a render it never made, the artefacts claim would have failed naming
it; and had the check script failed, the gate claim would have said so, whatever
the report said.

### Exclusive resources and fan-out

Two research lanes could not run at once because there was one live Blender with
one open file. Until MOD-23 that was a line the brain wrote into every brief and
hoped was followed. A card can now name the resources it holds, and the queue
enforces them; and the `card` tool can write several lanes from one sentence.

**Resources.** A card may carry `resources: [blender-live]` (a list of free-form
words: letters, digits, `.` `_` `:` `-`; the name means nothing to the mod beyond
"the same word is the same thing"). The brief header carries them as
`resources=blender-live` after `outdir=` and `scratch=`, before `spend=`. A card with no resources writes
the header it always did and is held up by nothing.

- A worker holds its card's resources from its spawn until it hands back (or its
  run ends with no hand-back).
- A dispatch, or the brain's own Agent call, for a card whose resource is held by
  a running or starting worker is **queued**, whether or not a slot is free, with
  `queued: OPS-9 — waiting for resource blender-live (held by OPS-8)`. The dispatch
  result prints no spawn block and the hook starts nothing; a second ask keeps its
  place (`…; already queued since 14:02 (position 1)`).
- **The hand-back that frees the resource carries the `ready:` line for it**
  (`ready: OPS-9 — run its spawn block (/dispatch OPS-9 prints it again)`), in the
  same row as the verdict (and the same wake, with wakes on). Of several queued cards that name one resource only
  the first is ready; the others wait for it in turn, and a card with no resources
  or others is ready in its place. A row that waits for a resource takes no worker
  slot, and the "Delegation state" section names what it waits for.
- The worktree table of the dashboard and its text fallback show the resource a
  worker holds and the one a queued row waits for (see [Dashboard](guide.md#dashboard)).
- For `repo: here` cards a shared resource **queues, it does not refuse** (MOD-24):
  the overlap check that guards the shared checkout
  (see [repo=here](#repohere-the-main-checkout)) refuses a scope overlap, which would
  corrupt each other's dirty-tree delta, but two cards with disjoint scopes that name
  one resource are both dispatched and the second waits as above. The pane's open
  item for a queued card that waits for a resource reads
  `OPS-9: queued (position 1) — waits for blender-live (held by OPS-8)` instead of
  `… — starts when a worker slot frees`; a card waiting for a slot reads as before.

**Fan-out.** Research usually fans out: two or three workers at once, each owning
an output folder, all wanting the same shared notes file. The `card` tool takes
`lanes: [{ title, scope, doneWhen? }]` beside the shared fields (`title` and
`doneWhen` as the umbrella, `why`, `gate`, `tier`, `repo`, `redTest`, `budget`,
`spend`, `resources`, `forbid`). It writes **one card per lane**, all or none:
sequential ids (`OPS-41`, `OPS-42`), the shared why, gate, tier, repo, resources
and forbid, and each lane its own title, scope (so its own output folder: the first
absolute entry) and `doneWhen` (the shared list when the lane has none). A shared
`scope` beside lanes is refused. Two lanes whose scopes overlap are refused, naming
both:

    card refused: lanes overlap: lane 1 "Extract the hair model" scope /out/avatar/** overlaps lane 2 "Extract the eye model" scope /out/avatar/eyes/**; give each lane its own output folder

The dry run prints every lane's summary and brief header, then says go for all of
them (`Say go and Claude dispatches OPS-41, OPS-42.`); with `dispatch: true` it
dispatches each lane in order, one spawn block per lane under `--- OPS-41 ---`,
and the queue keeps lanes that hold one resource from running together.

**Worked example: two extraction lanes, one notes file.** The avatar is built in a
running Blender; the person wants the hair and the eye model extracted, and both
lanes would like to append to `/out/notes/avatar.md`. That file is the brain's to
merge afterwards, so it is the shared `forbid`: neither lane may touch it, and the
outside delta fails a lane that does. The brain calls the tool once:

    {
      "title": "Extract the avatar parts",
      "why": "The avatar is built in the running Blender; the hair and the eyes are extracted as separate models.",
      "doneWhen": ["each part is a glTF in its lane folder and not empty"],
      "repo": "none",
      "redTest": "none",
      "gate": "hair-check",
      "resources": ["blender-live"],
      "forbid": ["/out/notes/avatar.md"],
      "lanes": [
        { "title": "Extract the hair model", "scope": ["/out/hair/**"] },
        { "title": "Extract the eye model", "scope": ["/out/eyes/**"], "doneWhen": ["eyes.gltf and a render are in the lane folder"] }
      ]
    }

It writes `OPS-41` and `OPS-42`, which differ in title, scope and done-when and
agree on everything else:

    id: OPS-41
    title: Extract the hair model
    …
    repo: none
    scope: [/out/hair/**]
    forbid: [/out/notes/avatar.md]
    resources: [blender-live]

and prints their two headers:

    [[brief v=1 task=OPS-41 … scope=/out/hair/** forbid=/out/notes/avatar.md red_test="none" gate=hair-check repo=none outdir=/out/hair scratch=/tmp/chassis-delegation/OPS-41 resources=blender-live spend=10 budget=2-attempts report=chassis.report.v1]]
    [[brief v=1 task=OPS-42 … scope=/out/eyes/** forbid=/out/notes/avatar.md red_test="none" gate=hair-check repo=none outdir=/out/eyes scratch=/tmp/chassis-delegation/OPS-42 resources=blender-live spend=10 budget=2-attempts report=chassis.report.v1]]

When the person says go, the brain dispatches both and makes both Agent calls.
`OPS-41` starts; the second call is refused, though a worker slot is free:

    queued: OPS-42 — waiting for resource blender-live (held by OPS-41)

`OPS-41` hands back, and its verdict row ends with
`ready: OPS-42 — run its spawn block (/dispatch OPS-42 prints it again)`; the brain
makes the call and `OPS-42` runs with the Blender to itself. Had the lanes needed
no shared app, the card would carry no `resources` and both would run at once, each
in its own folder, still sharing the forbid on the notes file.
