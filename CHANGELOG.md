# Changelog

## 0.7.0 — 2026-10-11

- **Workers under the mod's hooks (MOD-13).** Now that the brain makes every
  spawn, the mod uses what it sees. The git guard names a worker's task in its
  refusal (`no push on main (T-7); ...`), for a `repo=here` worker as for the
  brain; a worktree worker on its own branch is untouched. The spend ceiling
  posts one row at `spend=` (task and dollars, once) and, at twice it, denies
  the worker's next tool call (`T-6 is over twice its $2 ceiling; hand back now
  with what you have`; `SubagentHandback` passes) beside the `over-spend`
  verdict; the recorded `usd` still comes from the end-of-run accounting.
  `turn.step` on a worker is rewritten to an effort by tier, from the new key
  `effortByTier` (economy `low`, standard `medium`, frontier `high`; `0` or
  empty leaves the engine's; a card's `effort:` wins), recorded on the attempt
  and printed by `/delegation`. The brain's steps, `delegateOnly` and the brain
  spend ignore agent-context calls as before. The text MOD-12 left is brought in
  line: the `autoEscalate` and `maxWorkers` descriptions, the `_agentTypes` and
  `_maxWorkers` scaffold notes, the `QueuedSpawn.model` doc, and the respawn
  advice (`make the spawn block below (it names the model)`).

- **The brain spawns, the mod shapes (MOD-12; public issue #22, option 1).**
  The engine steps a plugin's own hooks past any subagent that plugin starts
  with `$.agent.spawn`, and every worker used to start that way, so a dispatched
  worker ran with no git guard (a repo=here worker on `main` could commit), no
  mid-run spend and no hand-back capture from its tool calls. Of the options #22
  laid out, this takes option 1: the mod prepares everything and the brain makes
  the spawn with its own Agent tool. `/dispatch` and the dispatch tool still
  write the brief, cut the worktree and pick the tier, then spawn nothing: the
  result ends with a spawn block, `spawn: Agent` and a fenced JSON object
  (`subagent_type`, `model` = the tier's alias, `description` = `<id> <tier>
  <alias>`, `prompt` = the brief handoff) the brain passes verbatim, and one line
  saying the worker starts when it makes that call. `--dry-run` and `--verify`
  are unchanged. The `agent.spawn` hook shapes the brain's call as it shaped
  every spawn: it keeps the call's model when it is the tier's alias, runs the
  worker in the folder `/dispatch` prepared (new store key
  `delegation.handoff.<brief>`; the Agent tool takes no folder), claims the slot
  and records the attempt (`kind: spawn`, `source: brief`); the hand-back,
  verdict, ladder and ledger are what a mod-spawned worker produced. A second
  spawn of a brief whose attempt still runs is refused naming it (`… not
  spawned — already running as attempt 1 (agent agent-7); wait for its
  hand-back`), by the hook and the dispatch result alike, as are a spawn past
  the budget, one with work present, and one with every slot taken. The queue
  and the ladder are advice: a full house answers `queued: <id> — the mod will
  tell you when a slot frees (…)`; the hand-back that frees a slot carries
  `ready: <id> — run its spawn block (/dispatch <id> prints it again)`, as does
  the "Delegation state" section while it holds; a respawn verdict prints the
  next spawn block (one tier up after a refute) instead of spawning, with
  `autoEscalate` too, which now performs resumes only. Nothing in the mod calls
  `$.agent.spawn` for a worker (a node test reads `hooks/register.ts`:
  `spawnSelf` serves only the debrief and eval runners, which need no hooks).
  The evidence for #22, in `tests/hooks.test.ts`: "#22 evidence: a repo=here
  worker the brain spawned is seen by the mod" (the git guard denies its `git
  commit` on `main`, and its turn usage lands on the attempt mid-run) and "#22
  evidence: a worker the mod spawns itself (the old path, kept here in a
  helper) is stepped past by the mod's hooks". The harness now records who
  raised each spawn (`spawnedBy`, from the kit's `next.origin`). The setup
  handover, the card folder's README template and the brief template say who
  starts the worker. Using the worker's steps mid-run (the spend ceiling, effort)
  is the next card.

## 0.6.1 — 2026-10-10

- **A breadcrumbs-mode debrief is bounded to its window and validated at
  hand-back (MOD-10).** Both prompts carry the window (breadcrumb lines
  `(watermark, end]`, first and last timestamps), say to read only entries inside
  it and never to summarise from tool error text, and ask each correction, denial
  and outcome for an `at`. At hand-back the new `hooks/lib/debriefcheck.ts` strips
  an entry whose `at` is outside the window, counts one with none, flags a list the
  window's breadcrumbs cannot contain, and the printed result says so. The debrief
  record moves only on a clean check (otherwise the previous record stands).
  `mod_findings.surface` is an enum of the mod's twelve surfaces; a finding on
  another surface, or about the permission classifier, a host safety check, the
  engine or the person's own hooks, goes to `host_findings`, which
  `/delegation debrief post` never lists or files (it says how many it set aside).
  Fixes the debrief in public issue #50.

- **`delegateOnly` follows `cd` and `git -C`, judges `git commit` by the repo and
  the paths it commits, and reads BSD `sed -i ''` right (MOD-9).** `cd <worktree>
  && rm -rf .claude-plugin/types && cp -R …` was refused as a source edit because
  the relative target was read against the repo root; it now resolves against the
  folder the `cd` left, and an unresolvable `cd` makes later relative writes
  unknown and uncounted. A `cd` inside `( )` is undone at the closing
  parenthesis. A commit in a repo outside the root is never an edit; in the root
  the staged paths are read with `git diff --cached --name-only` and judged like
  written paths, so a commit of only card, `docs/`, `.delegation/`, repo-file or
  CHANGELOG files runs. `sed -i '' …` and `sed -i .bak …` no longer take the
  suffix or the script as a file.

- **`delegateOnly` resolves `~`, `$HOME`, `$PWD` and earlier variables before it
  decides a Bash write is in the repo (MOD-8).** `M=~/.claude/m; cat >> $M/p.md`
  was read as a file named `$M` under the root and denied; it is now a write
  outside the repo and runs. An unresolvable target is unknown and not counted.
  `bashWrites` takes the home folder as a third argument.

- **`/delegation debrief post` shows the findings, then posts the named ones
  (MOD-7).** New repo-file key `issueRepo` (`owner/name`; empty = off, and
  `/delegation` prints `issues: <repo>` when set). `post` alone prints the latest
  `.findings.json` as it would be posted, scrubbed again, each `new` or `covered
  by #k` against the repo's issues; `post 1,3` or `post all` runs one `gh issue
  create` per new finding and records the number (a covered one is skipped, or
  added as a comment when named); a body in which a `redact` word survives is
  refused. The allowlist gains `gh issue create`, `gh issue comment` and the
  read-only `gh issue list`, each only for the configured `issueRepo` and a body
  file under `<root>/.delegation/debriefs/`; edit, close, delete and `gh pr create`
  stay refused. Pure logic in the new `hooks/lib/findings.ts`.

- **`/delegation debrief` runs the debrief now, and every debrief ends with
  scrubbed findings about the mod (MOD-6).** The command starts the background
  debrief at once (no idle, cooldown or minimum-friction test; one at a time;
  it runs while a worker runs and says so) and prints the agent id, the mode and
  the folder. Both debrief prompts ask for a `mod_findings` key (went_well /
  went_wrong, surface, fault_class, severity, title, body, evidence); at
  hand-back the mod scrubs every string with `redact` (new `hooks/lib/redact.ts`:
  home paths, the repo and its origin, the git user, and the new `redact`
  `/config` list, which is never read from the public repo file) and writes
  `<name>.findings.json` beside the debrief, printing one line per finding.

## 0.6.0 — 2026-10-10

- **Owed rows retire by themselves, `/delegation accept <id>` closes one, and
  the state block counts the old ones (MOD-4, public issue #23).** An owed row
  leaves the compaction block, the prompt section and `/delegation` when its
  task's last attempt sha is an ancestor of `origin/main` or its card there
  reads `status: merged` (read from the configured `cardDir`; the allowlist
  takes `ls-tree` / `show` at `origin/main` for it); the attempt records
  `retired: merged`. The check runs at most once per 15 minutes per task and a
  failed one changes nothing. `/delegation accept <id> [note]` records
  `accepted` plus the note on the last attempt and retires the row. The block
  prints the live rows in full and then `n older owed rows: <ids>`.

- **`/delegation update` brings the loaded copy to origin/main (MOD-3).** It
  classifies the loaded folder (`classifyRoot` in `hooks/lib/update.ts`): a git
  clone is fetched and fast-forwarded (`git -C <root> merge --ff-only
  origin/main`, the one new allowlist form, only for the loaded folder); any
  other folder is left alone and the clone command that replaces it is printed.
  The output is `update: <old> (<sha>) → <new> (<sha>), n commits`, the
  CHANGELOG sections newer than the old version (40 lines at most, with a
  pointer to the README's `From <old> to <new>`), the keys added to
  `.chassis-delegation.json` (every defaulted key it lacked, with a `_<key>`
  note; every other byte unchanged), and the reload story: a folder under
  `~/.claude/dev-mods` reloads when the turn ends; any other needs the window
  reloaded. It refuses while a worker runs. `/delegation` adds `update: n
  commits behind origin/main` when the loaded clone is behind (one fetch per ten
  minutes, cached in the store).

- **One proof of red per task; `--verify` at the last attempt's own sha
  re-judges it (MOD-1, public issue #35).** A red file byte-identical to one an
  earlier attempt of the task held with is held again (`attempt n's proof,
  reused (one proof per task)`); one whose earlier claim did not hold is still
  refuted. `/dispatch <id> --verify <sha>` at the sha on the last attempt record
  re-judges that attempt (same number, no new record, no budget spent, first
  line `re-judging attempt n/b at <sha>`); any other sha opens a verify attempt
  as before. The choice is the pure `verifyTarget` in `hooks/lib/attempts.ts`.

- **A dispatch that names a base writes it into an existing brief (MOD-2, public
  issue #37).** Dispatching with `--base <sha>` (or the tool's `base`) against a
  brief already on disk now sets or replaces `base=` in its header
  (`setHeaderField` in `hooks/lib/brief.ts`; the amend blocks and body stay
  byte-identical) and says `reused, base= set to <sha>` or `reused, base=
  replaced <old> → <new>`, instead of the note that the verifier diffs against
  origin/main. A dispatch with no base against a reused brief that carries
  `base=` cuts the worktree from it, so the cut point and the verifier's base are
  the same ref.

- **Spend ceilings that fit the host (GH-116, public issue #34).** The defaults
  are now economy 3, standard 10, frontier 25 dollars (were 2, 6, 15). Setup
  proposes economy 5, standard 15, frontier 35 when a gate command is `sf`,
  `sfdx`, or names a deploy or a remote test runner (`deploy`, `--target-org`,
  `gcloud`, `aws`, `az`, `terraform`), writes it as `spendByTier` into a fresh
  config, and prints `config: spendByTier = …` with the reason.

- **The brain's own spend is priced and shown apart; Fable is priced; a
  delegate-only mode (GH-113).** `hooks/lib/cost.ts` prices `fable-5-1` and
  `fable-5` at $10 / $50 per million tokens. Every main-loop `turn.complete`
  with a usage adds to a brain record in `$.state` (tokens, dollars by model,
  turns, brain edits; pure model in `hooks/lib/brain.ts`). `/delegation` prints
  `brain: <family> $x over n turns · workers $y (n attempts) · brain share p%`;
  the dashboard gains a "brain $x / workers $y" tile and a `brain` row in spend
  by model (the text fallback too). A new `delegateOnly` key (`off`, `warn`,
  `deny`; `/config` and the repo file) keeps an opus or fable brain from editing
  source itself: `warn` posts one row per turn, `deny` refuses and names the
  card tool; the card folder, `.delegation/`, `.chassis-delegation.json`,
  `CHANGELOG.md` and any `docs/` folder stay writable, workers and a Sonnet
  brain are never restricted. A fable brain under it is told its posture at the
  top of the delegation state. README: "The brain's spend".

- **A scope or files refute holds the tier (GH-115, public issue #34 ask 3).**
  The attempt record keeps `firstFailed`, the first failed claim of a refuted
  verdict. A refute on `scope`, `files`, `branch` or `pr` no longer earns the
  next tier on respawn (only `sha`, `gate` or `red` does, as does a record
  without the field). A scope refute advises
  `resume agent=<id> — amend: [[amend v=1 scope+=<path> reason=…]]`, a files
  refute advises listing the paths in `files=`, and a later respawn says
  `(held: a scope refute)` or `(held: a files refute)`.

- **`/delegation` names what each alias resolves to and when it moved; the card
  dry run shows the classifier's tier (GH-114, public issue #34).** The store's
  alias record is now `{ id, since, previous?: { id, until } }` (the old plain
  id still reads). `/delegation` prints one `aliases:` line and, for a move in
  the last 7 days, a line naming it. The card tool's dry run asks the classifier
  once and prints `card says <tier> · classifier says <tier>` (or `agrees`); a
  new boolean `classifierSecondOpinion` (default true) turns it off, and the
  answer is kept as `classifierTier` on the card's first attempt record.
  The `classifierSecondOpinion` option still needs declaring in
  `.claude-plugin/plugin.json`.
- **A live delegation dashboard (GH-112).** A band above the prompt (drawn only
  while a worker is live, queued or owed a verdict; hover it for a card, press
  `[ details ]` for the pane) and a pane opened by `/delegation dashboard`:
  tiles (live, queued, spend, verified first try), session spend over time with
  spawn and verdict ticks, a worktree table (task, model chip, state, folder and
  branch, tokens, cost, attempt), spend by model, then the six cross-session
  blocks under "Across sessions". Pure model in `hooks/lib/live.ts`; the band and
  pane in `band.tsx` and `pane.tsx`; the spend series (15 s live, 60 s idle, 240
  points) lives in `$.state`. A new `/config` boolean, `dashboardBand`, turns the
  band off. A worker's tokens and cost update when its run ends (public issue
  #22), and the UI says so.
  A redraw reads the store's attempt records at most once every 15 seconds;
  the mod's own record writes show at once, other sessions' within 15 seconds.
  `/delegation dashboard` reports whether the pane was placed. On a screen
  that shows no mod panes (the VS Code extension today) it closes the waiting
  pane and prints the dashboard as markdown: the headline, spend over the
  session, the worktree table and spend by model.

## 0.5.0 — 2026-10-08

Twelve cards from adopter reports and a first new project, each dispatched
through the mod and verified in its worktree: GH-100 to GH-111. See
"Upgrading" in the README for what changes when you move from 0.4.0.

- **Claude Haiku 5.5 is priced.** The cost table gains `haiku-5-5` at $0.10 /
  $0.50 per million tokens. Its higher rate for prompts past 100K tokens is not
  applied, because usage arrives summed over a run; a long Haiku 5.5 run's
  figure is a floor. The economy tier needs no change: it maps to the alias
  `haiku`, which Claude Code resolves to Haiku 5.5 on the Anthropic API.
- **`/delegation` names the loaded version and folder**
  (`mod: chassis-delegation 0.5.0 loaded from <folder>`), so an upgrade can be
  checked from inside the session. A node test holds the version equal in the
  manifest, the README, this file and `hooks/lib/version.ts`.
- **The README gains an Upgrading section** an agent can follow.

- **Say the task, get the dry run (GH-111).** A new model-callable tool,
  `mcp__chassis-delegation__card` (pure logic in `hooks/lib/card.ts`): the
  brain turns a sentence into the fields (title, why, done-when, scope globs,
  red test, and optional tier, domain, gate, budget, spend) and the mod writes
  the card (the next free `<PREFIX>-<n>` in the card folder, a slug from the
  title, never overwriting), runs the same dry run as `/dispatch <ID>
  --dry-run`, and returns `wrote <path>`, a one-line summary, the brief header
  and `Say go and Claude dispatches <ID>.` With `dispatch: true` it dispatches
  instead. Prose scope, a gate id missing from `gateMap`, a missing red test,
  an unknown tier or domain are refused with the fix and write nothing.
  `/delegation setup` now ends with `Set up. Tell Claude your first task in a
  sentence, for example: "…"` (the example follows the detected gate) instead
  of a card skeleton to edit; through its tool it adds `Ask the person for the
  first task, then call the card tool.` Setup no longer writes
  `OPS-000-sample.md` (bare `/delegation init` still does) and no longer tells
  anyone to commit the card: a worktree dispatch reads it from the main
  checkout, and in repo=here mode the card folder joins the always-applied
  `ignore=` set. README: Setup, Sixty seconds, the commands table, the card
  format.
- **Setup's output reads right in VS Code and the desktop app (GH-110).**
  The first card is printed inside a ```markdown fence (its `---` lines were
  rendering as rules and the lines ran together). Setup no longer prints
  init's "Next:" line or the restart note, so there is one set of next steps.
  The card skeleton gains a `red_test:` line with an example taken from the
  detected gate. A fresh config is followed by one `config:` line per key set.
  When the scaffold leaves the tree dirty, the next steps start with committing
  it. `/delegation init` text is unchanged.
- **`/delegation setup` checks the repo and hands over the first card (GH-109).**
  A new project learned each requirement (a git repo with a first commit, a
  remote with `main` or `repo=here`, a passing test command, a lockfile, no
  shadowing skill) from a failure. `/delegation setup` and the
  `mcp__chassis-delegation__setup` tool run one function: six required checks
  and seven advice lines, each failing check with the exact fix to run (the
  allowlist admits no `git init`, commit or install, so the mod checks and the
  brain fixes). While any required check fails it writes nothing; when they
  hold it runs the init scaffold, writes the config with the detected
  `gateMap`, `baseRef` (no remote) and `cardDir` (plugin repo), and prints the
  first card and the next `/dispatch` steps. Pure logic in `hooks/lib/setup.ts`.
  `/delegation` with no config adds `not set up here: run /delegation setup`.
  README: step 4 is now setup, a Setup section, the commands table.
  A Python project runs `pytest` only when `pytest.ini` names it or it is
  installed; otherwise the gate is `python3 -m unittest discover -s tests`,
  which needs nothing but `python3`. The README's install steps now lead with
  hot reload for a session already running (VS Code, the desktop app), and
  warn against pointing the global setting at a session's hot-reload folder.
  The card tool works in the shared checkout (`repo: here` on the card) when
  the repo has no `origin/main`; a `baseRef` alone does not change the mode.

- **A per-attempt spend ceiling (GH-106, closes public #15).** Fifteen
  standard cards cost $1 to $4.55; two cost $21.79 and $32.48 because the
  workers over-delivered, and nothing told the worker or the mod what one
  attempt may spend.
  - *The ceiling.* New brief field `spend=<usd>`; config key `spendByTier`
    (repo file and `/config`; default economy 2, standard 6, frontier 15; `0`
    means none). `/dispatch` writes the card's `spend:` if present, else the
    tier default; the brief template's Rules gain a Spend line.
  - *Per-worker cost.* `hooks/lib/cost.ts` is wired: each worker's spend is
    summed from its own `turn.complete` usage. The verdict row's, the
    record's and the ledger's `usd` use it; without usage they keep the
    session delta, now marked `~` (so concurrent workers no longer inflate it
    silently: a $2 card read $14.47).
  - *The warning and the stop.* At the ceiling the worker gets one wrap-up
    message (not a resume, not charged to the budget). At twice it the
    attempt is recorded `over-spend` and a row says to check the worktree;
    `over-spend` never escalates the tier. The engine's `turn.start` carries
    no `agentId` for a subagent, so the turn is aborted only when it does;
    otherwise the row alone is posted (README, Spend ceiling).
  - *Visible mid-run.* The status line and the queued-spawn refusal show each
    live worker's running cost.
  The engine does not show a plugin the steps of a worker it spawned itself,
  so for a dispatched worker the cost, the wrap-up and the over-spend check
  come when its run ends; the brief's spend line is what limits it mid-run.

- **A tier the mod does not know is named (GH-108).** A card `tier:` (or a
  header `tier=`) that is not economy, standard, frontier or premium used to
  dispatch at standard with no word; one adopter has 14 cards with
  `tier: deep` and one with `tier: opus`. Now a model name (`haiku`, `sonnet`,
  `opus`, `fable`, or a full id containing one; case-insensitive) is taken as
  its tier, and anything else prints once in the `/dispatch` output
  `warning: tier "deep" is not economy, standard, frontier or premium;
  dispatched at standard` (the header carries `tier=standard`). The spawn hook
  applies the same mapping to a header `tier=` and logs the warning to debug.

- **A dispatch's `--base` reaches the verifier (GH-105, closes public #14).**
  A card stacked on an unpushed sibling was cut from the sibling's sha, the
  worker changed only its own files, and the verdict was `refuted on scope`
  on a file from the base commit: the brief never said `base=`, so the
  verifier diffed against `origin/main`.
  - `/dispatch <ID> --base <sha>` (and the tool's `base`) now writes
    `base=<sha>` into the header whenever the base is not `origin/main`,
    worktree mode and repo=here alike. A reused brief is not rewritten; when
    it has no `base=` the dispatch output says so.
  - The scope line names the base: `claim scope: held — every changed path
    since <base> is within …`. `--verify <sha>` takes its delta from the
    same `base=`.

- **A refused drain keeps the queue head (GH-107, closes public #16).** The
  drain used to remove the head before spawning it, so a spawn the hook
  refused lost its place and the brain, which never reads toasts, saw nothing.
  The head now leaves the queue only after its spawn succeeds. On a refusal it
  keeps position 1 and its `at`, the drain stops for that pass, and a session
  row reads `queued <task> not started: <reason>; it keeps its place (position
  1)`. A budget-exhausted or unreadable-brief refusal removes the row instead,
  with a row saying so.
- **Spend guards (GH-104, closes public #10).** One Sonnet-sized task cost an
  adopter about $15: its first worker finished, the report was misread as
  no-report, and the retry spawned one tier up on Opus as attempt 2.
  - *No escalation on no-report.* A no-report is a reporting defect: the
    first still advises a resume, the second a respawn at the SAME tier
    (`next=respawn at standard`), and the spawn hook holds a respawn after a
    no-report at that attempt's tier (`held` in the debug line when it is
    above the brief's). Escalation stays for a refuted report and for a
    `gate=fail` the verifier confirmed; an unconfirmed `gate=fail` no longer
    moves the tier up.
  - *Look before you respawn.* Before a respawn (the mod's, a by-hand Agent
    spawn, a queued one) and before a resume it advises or performs, the mod
    reads the worker's worktree with allowlisted git reads (`rev-parse HEAD`,
    `status --porcelain`, `log --format=%H <base>..HEAD`). Commits ahead of
    the base, a clean tree and a head the verifier has not judged mean the
    work is there: nothing spawns, the attempt is recorded as `work-present`
    (kind `verify`), and the row says `work present at <short sha> on
    <branch>: verify it (next=verify sha=<sha>)`. A by-hand respawn is
    refused with the same line. repo=here and repo=none are not looked at.
    Judged attempts now keep the report's `sha`, so a refuted attempt's own
    head is not mistaken for new work.
  - *`/dispatch <ID> --verify <sha>`* (the tool's `verify`) runs the native
    verifier on that branch head with a synthetic report naming the delta
    (`gate=pass`, so the gate is re-run; the newest red file when the brief
    has a red test), with no spawn. The verdict lands on the work-present
    attempt, else on a new `verify` attempt.
  - *The notice says what it spends.* A briefed spawn's notice ends with
    ` · attempt <n>/<budget>` (`tier=standard → sonnet (brief) · attempt 2/3`),
    and `/dispatch` line 4 reads `spawned <type> agent <id> on <model> ·
    attempt <n>/<budget>`. The debug line still names the tier source.
  - The queue dedupe the same report asked for is GH-101's, not this change.
  A refusal for work already present in the worktree also removes the row
  (it needs `--verify`, not a respawn), and a refusal that keeps the head is
  posted once, not on every drain.

- **A moved file is listed once, at its new path (GH-102, closes public #6).**
  The verifier's delta used `git diff --no-renames --name-only`, so a `git mv`
  read as the old path omitted and the new path added, and a correct hand-back
  was refuted. The delta is now `git diff --name-status -M`, a rename is its new
  path, and an old path a worker lists as well is dropped before comparing (the
  held line says `(1 rename collapsed)`).

- **A prose scope is caught at dispatch (GH-103, closes public #8).** When a
  card's `scope:` reads as prose and no `--scope` (tool `scope`) is given,
  `/dispatch` and the tool write the brief, print the header and the prose,
  and stop before the worktree and the spawn; dispatch again with globs and the
  brief is reused. A prose `scope=` that reaches the verifier is no longer a
  refusal of the whole brief: the scope claim is `unchecked` and the rest is
  checked, so the worker's finished work stands. `BRIEF-SCOPE-PROSE` is gone;
  a brief with no `scope=` is still refused.

- **The queue never holds a phantom (GH-101, closes public #4 and #7).** The
  queue keeps one row per task and subtask: a second dispatch answers
  `already queued since <HH:MM> (position <n>)` and spawns nothing. The queue
  drains after every hand-back, after a dispatch that did not spawn, and at the
  start of every dispatch, one toast per start: `started queued <task> (waited
  <m> min)`. A by-hand Agent spawn with an inline header for a queued task
  takes the queued place when a slot is free instead of being refused. The
  refusal names live agents and queued rows apart: `(1 live: BE-310; 1 queued:
  BE-314)`; `queuedDeny` takes both lists. Slots count live agents and other
  tasks' starting spawns, never queue rows.
- **A shorter repo root (GH-100).** The root held fifteen entries above the
  README; it now holds ten. `types/` is `hooks/types/`, `templates/` is
  `hooks/templates/` (so the default brief template is
  `hooks/templates/brief.md`), `eval/` is `tests/eval/`, `scripts/selfcheck.sh`
  is `tests/selfcheck.sh`, and this repo's cards moved from `delegation/tasks/`
  to `docs/cards/`. `init` now picks `docs/cards` in a plugin repo (it picked
  `delegation/tasks`), so a plugin repo that init'd earlier keeps its
  `cardDir` setting. No behaviour changed; `--replay` still reads
  `agents/tasks/` at the base commit.

## 0.4.0 — 2026-10-05

The adopter reports, worked through: every entry below was a card under
`delegation/tasks/` (named GH-<n>), dispatched to a worker and verified in its
worktree by the mod itself.

- **The adopter review's remaining items (GH-1, items 2, 5, 6 and 8).**
  - *Item 2, cardless hand-backs.* An ad hoc spawn (the Agent tool with no
    header and no brief file) whose hand-back carries a `[[report …]]` line was
    marked `unverified` with "no brief header". Now the git claims are checked
    without a brief, in the spawn's cwd or the session root: branch, sha (a sha
    off the branch is refuted), files= against the delta, pr. Scope, gate and
    red are unchecked ("no brief: no scope=/gate=/red_test= to check
    against"). The row is posted, the attempt recorded under the report's
    `task=` (or `adhoc-<key>`) with `adhoc: true`, and the ledger line written.
    No budget ladder: `next=accept` for verified, `next=check the diff`
    otherwise, never resume or respawn.
  - *Item 5, unverified is actionable.* An unverified verdict with an agent id
    and budget left advises `next=resume agent=<id> — prove: <claim> (<reason>),
    …`, each reason cut to 160 characters. The resume counts against the budget
    like a failing verdict's, and `autoEscalate` performs it, sending only the
    unchecked claim lines. Past the budget, or with no agent id, the advice
    stays "check by hand".
  - *Item 6, the budget grammar warns.* `parseBudget` and `budgetAttempts`
    still fall back, but `/dispatch` now prints `warning: budget "frontier-60m"
    is not <n>-attempts; using the default 3` once, and the spawn hook logs the
    same line to debug for a header's malformed `budget=`. The tier part of a
    chassis `<tier>-<minutes>m` budget is never taken as the tier.
  - *Item 8, small things.* The classifier runs only with no header and no
    caller-model hint (this already held; a test now pins it), and every
    spawn logs which source picked its tier, such as `T-7: tier=economy picked
    by the brief header's tier= (no classify call)`. When a brief (`model=` or
    `tier=premium`), the caller or the tier map asks for fable and opus spawns,
    the notice reads `tier=frontier → opus (fable requested; fable is never
    spawned by the mod)` and the attempt record keeps `requestedAlias: fable`.
  - A cardless attempt is kept under its report's task for the record but never counts toward a later dispatch's budget or escalation ladder: no brief was given for it.

- **cardDir: the card folder is configurable (GH-12).** In a repo that is
  itself a plugin, the engine offers every `agents/*.md` as a subagent and
  `claude plugin validate` warns about each card. A new repo-file key
  `cardDir` (default `agents/tasks`; relative, no `..`) sets where `/dispatch`
  and the dispatch tool read cards. `init` picks `delegation/tasks` when the
  root holds `.claude-plugin/plugin.json`, writes it as `cardDir`, and says
  why; the card README it writes names the folder it used. `--replay` still
  reads `agents/tasks/` at the base commit.

- **`{worktree}` in a gate-map command, and a bad command refused at config
  load (GH-11).** `"validate": "claude plugin validate ."` passed the
  template check but was refused at verify time, after the worker had run.
  Now `{worktree}` (beside `{files}`) is filled with the absolute path of the
  tree the gate runs in, so `claude plugin validate {worktree}` works. And the
  repo file and `/config` gate map are checked at load by filling both
  placeholders with a sample path and running the allowlist's own check: a
  command it would refuse is dropped and named in the toast and log with the
  reason (`gateMap.validate: claude plugin validate . is not an absolute
  folder; write {worktree}`).

- **The git guard no longer denies a tag push or a remote-branch delete from
  main (GH-24).** `git push origin v0.3.0` and `git push origin --delete
  agent/mod/GH-21` were denied on `main` as pushes of `main`. A push is now a
  push of the current branch only when its refspecs are empty, or one is
  `HEAD`, `HEAD:<x>`, the branch name, `<branch>:<x>`, `--all` or `--mirror`.
  Tags, `--tags`, other branches and deletes of them pass. A push naming a
  guarded branch as its destination (`origin main`, `:main`, `--delete main`)
  is still denied from any branch. The deny line is unchanged.
- **repo=here: a main-checkout mode (GH-16, GH-19, GH-10).** Local-only
  repos with no `origin`, code in a nested child repo, and evidence that lives
  only in the main checkout could not use `/dispatch`. Now:
  - `/dispatch <ID> --here` (the tool's `here`, or a card's `repo: here`)
    writes a `repo=here` brief, runs no fetch and no `git worktree add`, and
    spawns the worker in the session root. Its brief says the checkout is
    shared: touch only your scope, do not commit unless the card says so,
    report `branch=<current>` and `sha=HEAD` (or the sha you committed). The
    template carries the mode in `{{#here}}` / `{{#worktree}}` sections.
  - The verifier reads a repo=here hand-back in the root: the branch must be
    the current one; `sha=HEAD` (or `none`) takes the delta from
    `git status --porcelain=v1 --untracked-files=all -z`; the brief's
    `ignore=` globs (plus an `ignore+=` amend, which always waits for
    approval) and the files= other in-flight repo=here cards claimed come off,
    each disclosed on a new `ignored:` line; the gate runs on the dirty tree.
  - Two in-flight repo=here cards whose scope globs overlap are refused at
    dispatch, naming both cards and globs; `--force-overlap` lets it through
    with a warning (GH-19).
  - New config keys: `baseRef` (where the delta starts when a brief names no
    `base=`; default the `origin/main → main → origin/master → master` chain)
    and `ignore` (default `[".delegation/**"]`). A brief may name its own
    `base=` in any mode, which beats both (GH-10); a repo=here dispatch writes
    `baseRef` into it, pinning `HEAD` to its sha. The settings layer reads
    both keys and the manifest declares them, so `/config` offers them too.
  - The README documents running in a nested child repo: the child is the
    session root, and the parent's `.chassis-delegation.json` is never read.

- **The report names its red-test evidence, and the verifier checks it (GH-20,
  GH-1 item 4).** The brief asked the worker to run the red test first and
  show it failing, but the report had no place for the evidence, so the
  verifier took the worker's word; one adopter's worker pasted attempt 1's red
  output as attempt 2's. The report grammar gains an optional `red=` (a path
  relative to the worker's tree, or `none`). `templates/brief.md` tells the
  worker to save the red test's failing output to
  `.delegation/<task>/red-<attempt>.txt` in the worktree before changing any
  source, a new file per attempt, and to name it as `red=`. A new `red` claim,
  after `gate`, runs only when the brief's `red_test=` is set (not empty, not
  `none`). It holds when the file lies in the tree, is not empty, carries a
  failure marker, and is not byte-identical to an earlier attempt's red file
  (sha-256, kept on the attempt record as `red` and `redHash`). No `red=`, or no
  failure marker, is unchecked (unverified, never refuted). A path outside the
  tree, a missing or empty file, or an earlier attempt's file again is failed.
  The pure claim is `redClaim()` in `hooks/lib/verify-native.ts`; register.ts
  reads the file through `$.fs` as bytes and hashes it with `crypto.subtle`.

## 0.3.0 — 2026-10-04

The first release built through the mod itself: every fix below was a card under
`agents/tasks/`, dispatched to a worker and verified in its worktree. Seven
reports closed: GH-2, GH-3, GH-4, GH-5, GH-6, GH-17, GH-21.

- **A scope entry inside a forbid is caught early (GH-17).** Forbid wins
  over scope, so a `scope+=` for a path under a forbid glob did nothing and the
  card was refuted on scope. `/dispatch` now warns once per scope entry that a
  forbid glob entirely covers, and a hand-back `scope+=` into a forbid is held
  as `amend needs approval: … shrink the forbid` instead of applied. The new
  pure helper is `scopeInsideForbid`; `amendNeedsApproval` takes the forbid.

- **The README tells a stranger how to install (GH-21).** "Install on a new
  machine" is now numbered steps (clone, load the plugin, start or restart
  Claude Code, run `/delegation init`) and says the restart out loud. A
  "Commands and tools" table lists what you type and what the model may call,
  and warns that a user skill or command named `delegation` or `dispatch`
  shadows the mod's. `init`'s closing text ends with a note to restart once if
  Claude Code says an update is pending.

- **An inline header is verified (GH-6).** A spawn whose Agent prompt
  carries a complete `[[brief …]]` header (`task=`, `scope=` or
  `scope_globs=`, and `gate=` or `repo=none`) and names no brief file used to
  hand back `unverified` with `no brief file named in the prompt; verify
  skipped`, so a fabricated sha went unchecked. The mod now writes the header
  and the rest of the prompt to
  `<root>/.delegation/briefs/<task>.<subtask>.brief.md` (or `briefDir`). It
  never overwrites a file already there. The hand-back is then verified
  against that file like any brief. A header that lacks a field still hands
  back unverified, and the line now names the missing field.

- **Budget refusal tells the truth (GH-3).** At resume and respawn the
  budget is read from the brief file named in the spawn record (falling back to
  the record), so raising `budget=` in the brief lifts the refusal; the record
  is not rewritten. The refusal now names the brief path and the field, says the
  ladder continues from the stored attempt count, and names no person.

- **A report delivered only through the hand-back is verified (GH-2).** A
  background worker that ended its run with SubagentHandback and a short final
  answer was judged `no-report`, so the ladder resumed and respawned it until
  the budget ran out while the work was done. No `tool.call` for that tool
  reached the mod in those runs, and `turn.complete` carries the answer
  alone. The mod now reads the hand-back where the engine keeps it, the
  worker's own transcript (`$.session.messages({ agentId })`), from the run
  that just ended only. The last `[[report]]` across the answer and the
  hand-back wins. Debrief agents and eval runners are read the same way.

- **A dispatch no longer counts its own starting token (GH-5).** With
  `maxWorkers=2` and one worker live, the dispatch tool's spawn was queued
  because its own `starting` token held the second slot; the queued line named
  the task itself as running. The slot claim now ignores the token the same
  task already holds, so the spawn starts at once, and a full house still queues
  with a line naming only the real workers. The 5D git-guard tests now stub Bash
  with `{ result }`, which the 2.1.288 engine requires.

- **`files=` folder entries (GH-4).** An entry ending in `/` now stands for every
  changed path under that folder, so listing `docs/img/` no longer refutes on files.
  A folder with nothing changed under it is still named as invented, and the held
  line says how many folder entries were expanded.

## 0.2.0 — 2026-10-03

Standalone. The mod no longer calls or needs anything outside its own folder.

- **Native verification (5A).** A report is checked with read-only git in the
  worker's own worktree: the branch, the sha (ancestor of the branch, or a
  fabrication), the scope and forbid globs over the delta, `files=` against the
  delta exactly, and the gate re-run in place once HEAD is the sha and the tree
  is clean (a dirty tree or another HEAD leaves the gate unchecked). It also
  checks the PR (`gh pr view <n> --json state`). The calls to
  `dispatch-verify.sh`, `dispatch-emit.sh` and `which-model.sh` are gone, and
  so are their allowlist shapes. The store is the ledger, plus an optional
  `<root>/.delegation/ledger.jsonl` (`ledgerFile`, on). `repo=none` briefs
  keep the no-repo check.
- **Tier map and repo config (5B).** The built-in tier map is economy→haiku,
  standard→sonnet, frontier→opus. A repo can add an optional
  `.chassis-delegation.json` with these keys: `gateMap`, `agentTypes`,
  `tierMap`, `evalCommand`, `evalLiveCommand`, `briefTemplate`, `briefExtra`,
  `maxWorkers`, `domains`, `worktreeRoot` and `autoEval`. Precedence is
  defaults < repo file < `/config`. `/delegation init` and the
  `mcp__chassis-delegation__init` tool scaffold a repo and never overwrite a
  file. `/delegation` alone prints the state. No repo's own subagent types are
  built in: a domain runs on the type `agentTypes` names, else a type of its
  own name, else `general-purpose`.
- **Portable briefs (5C).** Briefs go to `<root>/.delegation/briefs/`. The
  session scratchpad is used only when the root is not writable. The brief
  template is repo-neutral: its install step is picked by lockfile, and the
  repo's own lines come from `briefExtra`.
- **Git guard (5D).** A `commit`, `merge`, `cherry-pick`, `rebase` or `push` on
  a branch in `guardBranches` (main, master) is denied with
  `chassis-delegation: no <verb> on <branch>; branch first (git checkout -b agent/<domain>/<id>)`.
  So is a push that names a guarded branch, from any branch. The guard reads
  command words, so heredoc bodies never trigger it. It is controlled by
  `gitGuard` (on).
- **Debrief and eval without a harness (5E).** The debrief falls back to the
  built-in `templates/debrief.md`. It writes
  `<root>/.delegation/debriefs/<date>-<slug>.json` and adds a line to
  `<root>/.delegation/ledger.md`. Without a breadcrumb file, its friction
  signal is the corrections, tool denials and refutes the mod saw
  (`debriefMinEvents`, 5). `autoEval` is off by default and runs only with an
  `evalCommand`.
- **The repository (5F).** This release adds the git repository, the MIT
  license, this changelog, a README for a stranger and `scripts/selfcheck.sh`.
- **Tests (5G).** New tests cover the native verifier against temporary git
  repositories and against a table. They also cover:
  - the repo config precedence, init and the git guard;
  - the debrief fallback and the friction count;
  - the portable brief folder.

  The engine hook tests are rewritten for the above. A plain-node runner
  (`tests/node/run.mjs`) runs every pure test where `claude plugin test`
  cannot.
- The quiet row says `(no repo)` after the verdict and keeps its reason.

Changed defaults:

- `gateMap`, `agentTypes`, `evalCommand` and `evalLiveCommand` are now empty;
- `autoEval` is now `false`;
- `verifyBootstrap` is removed.

To keep the old behaviour, put the old values in the repo's
`.chassis-delegation.json`.

## 0.1.0 — 2026-10-02

Parts 1 and 2: the brain seat's hand steps, and the same steps in the background.

- **Part 1.**
  - Tier on spawn: the brief's `tier=`, then the caller's model, then the classifier.
  - The verifier's report check, the per-task budget, and resume-first escalation (`autoEscalate`).
  - The amend protocol, alias-drift and agent-type watch, and the status line.
  - `/dispatch <ID> [--dry-run] [--base] [--replay] [--scope] [--forbid]`, which goes from a card to a running worker.
- **Part 2.**
  - The `dispatch` tool, a second door to the same function as `/dispatch`.
  - Quiet one-line verdicts (`verdictVerbosity`).
  - The clean-stop background debrief and the background eval trigger (T1, and T2 behind `evalLive`).
  - The compaction block and the "Delegation state" prompt section.
  - The worker scheduler (`maxWorkers`).
