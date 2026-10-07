# Changelog

## Unreleased

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
