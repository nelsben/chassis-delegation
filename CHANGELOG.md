# Changelog

## Unreleased

### Fixed

- **Scope is charged only for paths the worker wrote (MOD-217).** The `tool.call` hook now keeps a per-worker write log (the Edit, Write, MultiEdit and NotebookEdit `file_path` and the paths a Bash command writes, resolved against the worker's cwd; at most 2000 paths; reviewers unchanged). At the verdict the outside delta and a repo=here git delta count against scope and forbid only the changed paths in that log; the others are listed on one line, `changed during the run, not by this worker: <paths>`, and never refute, so a brain edit to a shared file or a sibling worker's edit no longer refutes a card and burns an attempt. A worktree card's git delta is unchanged, and a worker with an empty log is charged for the whole delta as before.
- **`.delegation/**` is never part of a scope, forbid or outside delta (MOD-217).** The mod's own `.delegation/<other-task>/files.txt`, under the repo root or any worktree, no longer counts as a forbid or scope hit on another card.

## 0.9.37 — 2026-10-30

### Changed

- **`landAuto` now defaults to off (MOD-208, #301).** A fresh install files nothing to GitHub without a yes: the `land` tool and `/delegation land` write the body, show the issue and print `nothing filed: landAuto is off; …`, and file only with `confirm: true` (`--confirm`). The land nudge says propose by default. To turn auto-filing back on, run `/delegation config landAuto on` (or set `landAuto` to true in the plugin options).

### Documentation

- **The card frontmatter and brief header fields the GitHub sync reads, for hand-written cards (MOD-209, #303).** `docs/contracts.md` gains `Fields the GitHub sync reads`: the exact syntax of `issue:`, `parent:`, `parentScope:`, `status:` and the brief's `parent_scope=`, which step reads each (dispatch and verdict comments, merge-finish closes of the task and parent, `scopeAmends within-parent`, `land --supersedes`), where a hand-written line is read differently from a `card` tool one, and a minimal card and header that get the full sync.

### Fixed

- **A malformed report line is matched to its task and named as malformed, not filed as a fabrication (MOD-211, #271).** A report's `card=` or `id=` now stands for `task=` (`task=` wins), and a report that names no task takes the task of the brief header its spawn named, so the attempt is recorded under that task, not `adhoc-<key>`. A report with no `sha=` (or an empty one) is refuted as `malformed report: missing sha=…`, naming every missing contract field (`branch=`, `sha=`, `files=`, `gate=`, `red=` as they apply) and the exact line to resend; `fabrication` is kept for a `sha=` that is present and does not exist. The malformed refutation charges no attempt: the verdict row's `next=` says to resend the report with the named fields, and the resent line is judged on the same attempt.
- **The land nudge stays quiet on turns that drive an existing card (MOD-210, #302).** A `dispatch`, `verdict` or `merge` tool call in the turn now clears the pending prompt nudge, as `land`, `land_plan` and `card` do; the parent line keeps its rule (cleared by dispatch, set by merge finish).
- **A `land_plan` retry is keyed to the plan, not just the title (MOD-207).** Every landed file `land_plan` writes now ends (before any `issue:` line) with a `plan: <key>` line, the feature title's slug plus `-` plus the first 8 hex of a sha-256 of the sorted feature paths. A feature's earlier file is reused only under the same key and while its issue is OPEN; a task's only when its issue is OPEN and a sub-issue of this run's feature (read once with the existing `gh issue view` shape). A later plan with a task or feature of the same title files its own issues instead of attaching to the earlier plan's.
- **`land_plan` without `confirm` runs no gh (MOD-207).** An item with an earlier `issue:` line prints `may reuse #n (checked on confirm)` and is checked on the confirm call.
- **`land` on confirm reuses its preview file and resumes (MOD-207).** With landAuto off, the confirm call reuses the newest `<slug>[-n].md` that has no `issue:` line and the same body, instead of writing a `-2` copy; when the newest file with that body ends in an `issue:` line whose issue is OPEN, `land` reports `already filed #n url` and files nothing (resume after a create that timed out). landAuto on keeps its behaviour apart from the same resume check.
- **The gh guard reads `gh repo clone` and `gh repo view` as reads (MOD-207).** `gh repo create|delete|edit|fork|rename|archive|sync` stay writes.

## 0.9.36 — 2026-10-30

### Added

- **Option `landAuto`, default on: off makes `land` show the issue first and file only with `confirm: true` (MOD-205).** Off, the `land` tool and `/delegation land` write the redacted body, print the issue (title, type, parent, the `gh` line) and file nothing, ending `nothing filed: landAuto is off; call land again with confirm: true once the person says yes`; the tool files as before when called with `confirm: true`, and the command with `--confirm`. With it on, `confirm` is ignored. The land nudge reads `lead: propose landing this as an issue (land shows it; file on the person's yes) or say it is not work` when it is off. Turn it off with `/delegation config landAuto off`.

### Fixed

- **The worker gh guard reads the verb past `-R`/`--repo`/`--hostname` after the noun, and covers more write nouns (MOD-203).** `gh issue -R o/r close 5` and `gh pr --repo o/r merge 3` are now denied like `gh issue close 5`; `--repo=<v>` and other flags consume nothing more. `gh run` (any verb but list, view, watch, download), `gh cache` (any verb but list), `gh codespace|extension|alias|ssh-key|gpg-key` (any verb but list and view) and `gh config set` are writes too; reads still pass.
- **Land titles are redacted like the bodies (MOD-204).** `land` and `land_plan` pass every title through the redact rules before the slug, the printed dry-run line and `gh issue create`, so a redact-list word no longer reaches GitHub in a title.
- **A landed body lists only the open cards that overlap its paths (MOD-204).** Under `## Landed from` only the open cards whose scope holds one of the item's paths appear; the section is left out when none does or the item has no paths, so unrelated work titles no longer leak into public issues.
- **A `land_plan` retry matches by slug and open issue (MOD-204).** The newest `<slug>.md` or `<slug>-<n>.md` ending in an `issue: #n url` line is reused as `already filed` when that issue is still OPEN (read with `gh issue view`), whatever the body says now; a closed or unreadable issue is filed anew. A card changing between preview and confirm no longer files duplicates.
- **Status comments are not re-posted after a reload (MOD-204).** A status file under `.delegation/status/` that ends in a `posted:` line is not commented again, for the started and the verdict comment alike; a successful comment appends `posted: <ISO time>`.

## 0.9.35 — 2026-10-30

### Added

- **A land nudge: one band line when a prompt describes work and the turn lands nothing, and one after a merge finish while the parent has open tasks (MOD-201).** The line is for the brain (`lead: land this as an issue (land or land_plan) or say it is not work`; `lead: parent #<n> has <k> open tasks; land the next or close it`), drawn last in the band even when no worker is live, and cleared by the next land, land_plan or card call (dispatch too, for the parent line). New option `landNudge`, default on; off draws and records nothing. It runs no gh and writes nothing to GitHub. See [Guide](docs/guide.md).
- **GitHub is kept current: status comments, merge finish closes, and `land --supersedes` (MOD-200).** Dispatch comments `attempt 1/2 started · standard sonnet · card <ID>` on the card's `issue:` when a worker starts, and the verdict comments the verdict row; both bodies are redacted files under `.delegation/status/`, nothing runs for a card without an issue, and a failed comment adds one `status: comment on #n failed: ...` line and is not retried. Merge `--finish` now runs the task close (`merged in #<pr>`) and, when every other sibling is closed, the parent close itself, reports `closed #n`, and keeps the old printed line, marked `(close failed: ...)`, for a close that failed. `land` gains `supersedes` (`--supersedes <n>`): the new issue is filed with a `supersedes: #<old>` line and the old one is closed with `superseded by #<new>: <note or title>`. The allowlist gains exactly two shapes, `gh issue comment <n> --repo <landRepo> --body-file <file under .delegation/status/>` and `gh issue close <n> --repo <landRepo> --comment <text>`, which also pass while merge runs. Workers stay denied every gh write, and the mod writes nothing to the Project beyond the item-add.

## 0.9.34 — 2026-10-30

### Fixed

- **A `land_plan` retry with `confirm: true` resumes instead of re-filing (MOD-198).** An item whose landed file already ends in an `issue: #n url` line and whose body is unchanged is reused: it is listed as `already filed #n url title`, its number is taken from that line (the feature's becomes `--parent` for the rest), no `-2` copy is written and no second issue is created. When a create fails, the issues filed so far (this call's and earlier ones) are still added to the Project before the failure text is returned.

### Added

- **A recorded worker's (or reviewer's) Bash is denied any `gh` command that writes to GitHub (MOD-197).** Closing, editing or filing issues, merging or editing PRs, writing to the Project and a mutating `gh api` are the brain's; reads (`gh issue view`, `gh pr list`) pass. It rides the `gitGuard` switch, and the brain and ad hoc agents are untouched. The merge allowlist now passes the one read-only `gh issue view` shape MOD-195 needs, so `/delegation merge --finish` no longer lifts its merge context around that read.
- **`scopeAmends within-parent` applies a worker's `scope+=` only when it stays inside the parent's scope (MOD-196).** A card cut under a parent now keeps `parentScope:` in its frontmatter (right after `parent:`), the brief header carries it as `parent_scope=` after `forbid=`, and the verifier applies an amend whose every path sits inside it and holds the rest with the usual `amend needs approval` row. Without `parent_scope=` the mode behaves as `ask`. Use it while parents are in use. See [Configuration](docs/configuration.md).
- **Merge `--finish` prints the close line for the feature when its last task closes (MOD-195).** For a card with `issue` and `parent`, finish reads the parent with the read-only `gh issue view` shape `/delegation tree` uses; when every other sub-issue is closed it prints `gh issue close <parent> ... 'all <k> tasks done'` after the task's close line, and otherwise a comment naming the tasks still open. A failed read keeps the old hand-check comment. The mod still runs no gh write.
- **A `tree` tool and `/delegation tree <n>` read an issue and its sub-issues back (MOD-194).** One read-only `gh issue view` prints the issue with its `scope` and `forbid` blocks and each sub-issue as done, in flight (matched to the card that names it) or planned, with a count line and a `parentScope` line for cutting a task card under it. It writes nothing. The allowlist gains exactly one shape for it, bound to the session's origin repo.
- **A `land_plan` tool lands a feature and its tasks as a GitHub sub-issue tree in one call (MOD-193).** Every task's paths are checked inside the feature's paths before anything is written or filed. Without `confirm` it writes the bodies under `.delegation/landed/` and prints the tree; with `confirm: true`, given only after the person says yes in chat, it files the feature, then each task under it, and adds each issue to the Project. A failed create stops the run and lists what was filed. It uses the same allowlist shapes as `land`.
- **`/delegation land` files the issue itself, and a `land` tool does the same (MOD-192).** After writing the landed body it runs `gh issue create` (label `type:<type>`, `--parent` when given), adds the issue to the Project named by the new `project` option (`<owner>/<number>`) with `gh project item-add`, and writes `issue: #<n> <url>` to the end of the landed file. `--dry-run` (tool: `dryRun`) keeps the print-only behaviour. The allowlist gains exactly two shapes for this, bound to the session's origin repo and the configured project. The `type:*` labels must exist in the repo.

## 0.9.33 — 2026-10-29

### Added

- **`/delegation land <type> <title> [--parent <n>] [--paths a,b] [--note <text>]` lands new work as an issue body without starting it (MOD-190).** type is one of feature, epic, story, task, bug, spike. It writes the body (the note, a `scope` block from `--paths`, the open cards and the default branch, passed through the redact rules) to `.delegation/landed/<slug>.md`, adding -2, -3 for a repeat title, and prints the `gh issue create` line plus a `parent hint` when a path sits in an open card's scope. It files nothing, dispatches nothing and calls no gh. The guide gains a Planning on GitHub section.
- **A card with `issue:` gets `Refs #n` in its PR body and a printed `gh issue close` line at merge finish, with a parent pointer when it has `parent:` (MOD-189).** The close line comes first in the finish block (`--comment 'merged in #<pr>'`, else `merged at <sha7>`); the parent gets a shell comment pointing at its sub-issue progress, never a close. pr.md never carries Closes, Fixes or Resolves. A card with neither field is unchanged. See [Review and merge](docs/review-and-merge.md).
- **The card tool takes `issue`, `parent`, `parentScope` and `parentForbid` (MOD-188).** A card records its GitHub issue and parent issue (`issue:` and `parent:` after `status:`); with `parentScope` every scope glob must sit inside it, and forbid gains `parentForbid` and the scopes of the open sibling cards under the same parent (the ledger decides who is done). A sibling scope that overlaps the card's own is refused. See [Parent scope](docs/contracts.md).

## 0.9.32 — 2026-10-29

### Fixed

- **A `repo=none` card's outside listing is kept in a file under the session's `.delegation/outside/` folder, not in the store, so several research cards in flight no longer push the store past its 4 MiB cap (MOD-186).** The store key holds only a pointer (`at`, `briefPath`, `file`, `files`); the verdict reads the roots from the file, and a record written by an older version with the roots inline still verifies. A missing or unreadable file leaves the scope claim unchecked, naming the file. When retention prunes the record, the file goes with it (the host's file API has no delete, so the file is emptied).
- **A `repo=none` card's outside check no longer counts what the mod and the lead write in the session checkout (MOD-185).** A forbid naming the session checkout was refuted by the ledger row at dispatch, a brief the lead edited mid-run or a new card file. Changed paths under the checkout's `.delegation/` folder and its configured cards folder are now ignored for scope and forbid alike, and the claim says `ignored <n> path(s) the mod and the lead write`; every other path is judged as before.

## 0.9.31 — 2026-10-25

### Changed

- **A `tool.call` hook on `SendMessage` budget-checks and records a resume when `session.send` did not, so a resume is counted once whichever events the host fires (MOD-176).** The guard and budget check are one helper both hooks call; the `tool.call` hook refuses the call with the budget message when the attempts used reach the budget, and records the resume after the call only if the attempt has not already moved. tests/resume.test.ts pins tool.call only, both events in either order, and the refused call.

### Added

- **An engine test pins what fires when the brain resumes a worker with `SendMessage`, and the internals page states it (MOD-175).** tests/resume.test.ts covers a resume that arrives as a second `agent.spawn`, as a `tool.call` only (which records no attempt until the next hand-back), and as a `session.send` (recorded at the send); docs/internals.md replaces the sentence that said a resume arrives as `agent.spawn`, with the host's source.

## 0.9.30 — 2026-10-25

### Fixed

- **The README fits its front-door limit again, and the no-repository pre-bash test no longer depends on the checkout's branch (MOD-173).** The "How it fits" section is three bullets, and the test builds its plain folder outside the checkout.
- **A budget raised on the card now reaches its rewritten brief (MOD-172).** A brief rewritten because its card changed took its `budget=` from the old brief alone, so a card changed from 2 to 3 attempts was re-rendered with 2. The rewrite now keeps the higher of the card's budget and the brief's own (a budget raised by hand in the brief still survives), counts a changed budget as a reason to rewrite, and the line reads `rewritten: the card changed, budget 2→3 attempts`; the spawn line shows the new budget.

### Changed

- **`/delegation merge` prints each amend the card carried, and the alignment page states the amend design (MOD-171).** When the task's brief holds `[[amend …]]` blocks, merge (and the merge tool) prints `amend: <ops> (<reason>) — check these paths in the diff` for each, in brief order, before its success line, and pr.md gains an `## Amends` section after `## Done when`; with none, nothing changes. docs/alignment.md moves the `scope+=` bullet from "Where it differs" to "Where it makes the guidance a check": `forbid=` is the hard boundary, `scope=` is the plan, and `scopeAmends` holds widening amends for approval.

### Added

- **`scopeAmends` decides whether a worker's `scope+=` amend applies on its word (MOD-170).** `apply` (the default, today's behaviour) appends it before verifying; `new-files` appends it only when every path it names is absent at the brief's base and sits in a folder a scope entry already names; `ask` holds every one. A held block is not appended: the row says `amend needs approval: <block> (scopeAmends <mode>) — append it to <brief> to accept, then dispatch verify=<sha>`, and a verdict that refutes only on scope for paths such blocks cover now reads `next=approve the amend (append it to <brief>), then dispatch verify=<sha>; or refuse it` instead of resuming the worker. `forbid+=` applies in every mode, and `applyAmends` off still lists every block and applies none. Set it in the repo file or with `/delegation config scopeAmends`.
- **The README maps the mod onto Anthropic's subagent guidance (MOD-169).** A new "How it fits Anthropic's guidance" section lists what the mod follows, enforces and adds, and the new [docs/alignment.md](docs/alignment.md) gives each point with its source, the mod doc that shows it, and where the mod differs.

## 0.9.29 — 2026-10-25

### Changed

- **`review` now defaults to `on-frontier` and `delegateOnly` to `warn` (MOD-166).** The mod assumes the brain forgets to delegate and skips checks, so a fresh install now gets the fresh-context review on frontier and premium cards and the brain guard's one warning row per turn. To turn either off, write `"review": "off"` or `"delegateOnly": "off"` in the repo file (`.chassis-delegation.json`); `off` in `/config` or the host settings still means "not set here". `/delegation update` and setup write `delegateOnly: "warn"` rather than `"off"`. The `ration` option's help text now says the band's meter, not the footer's.
- **The README says why the mod exists and reports the evidence honestly (MOD-165).** A new Why section cites Anthropic's guidance on delegation and on a lead that starts the work itself, and the evidence list now gives 52% of tasks ended consistent ahead of 88% needing one attempt. Three stale figures are corrected: the attempt budget default is 3, the release count is 38 from 2 to 25 October, and a lane's done-when is the shared statements then its own.

### Fixed

- **The price table matches the live pricing page (MOD-168).** Checked against platform.claude.com/docs/en/about-claude/pricing on 2026-10-25. Sonnet 5 was priced $3/$15 and is now $2/$10 (the page says $2/$10 is the standard price); Sonnet 5.5 cache reads were $0.20 and are now $0.10 per million tokens. Every other model already matched.
- **A lane's own `doneWhen` is added to the shared one instead of replacing it (MOD-162).** With `lanes`, each lane card's Done when is the shared statements in order, then that lane's own; a lane with none gets the shared ones alone, as before. The card tool's text for `lanes` and a lane's `doneWhen` says so, so a layout or rule put in the shared `doneWhen` reaches every worker's brief.
- **A `repo=none` hand-back's gate fills `{worktree}` with the checkout the worker ran in (MOD-163).** It filled it with the card's output folder, which is not a plugin or a repo, so a research card's `claude plugin validate {worktree}` gate exited 1 on every attempt however the worker had run it. The gate now gets the session root (or the task's other repo path) as `{worktree}` and as its working directory; `{outdir}` and `{files}` fill as before. The verdict names it (`gate <id> ran in the checkout (repo=none)`), and the dispatch line and dry run for a research card end `· gate <ids> runs in <root>`.

## 0.9.28 — 2026-10-25

### Changed

- **A repo option `gateTimeoutMinutes` sets how long the verifier and merge let one gate run (MOD-155, #246).** Whole minutes, 1 to 10, default 9. The verifier's gates, the merge gate run, the card-gate run and the engine-suite lock all read it at the time of the run. A value outside 1 to 10, or not a number, is named in the config errors and 9 is used. Unset behaves as before. The range stops at 10 because the host caps one run at 10 minutes.
- **An ad hoc hand-back's owed row names how it clears (MOD-154, #246).** A cardless ad hoc hand-back judged `check the diff` leaves the owed row `<ID>: check the diff (ad hoc: clears with /delegation accept <ID>)`, since the retire sweep has no sha, patch or card to match it by. The verdict row's `next=` is unchanged, carded tasks' owed rows are unchanged, and `/delegation accept` (one id or `--owed`) clears the new rows as before.
- **The worker's worktree is locked while the verifier judges it (MOD-152, #246).** A worktree-task verify runs `git worktree lock --reason "chassis-delegation: verifier running; land after the verdict"` before the gate and `git worktree unlock` after it, so a plain `git worktree remove --force` refuses the directory mid-gate. A lock that fails is logged and the verify goes on; a worktree already locked by someone else is left locked. `repo=here` and `repo=none` tasks take no lock. `/delegation merge <ID> --finish` unlocks before it removes, ignoring a failure. The allowlist passes exactly those two shapes for a task worktree.
- **The hand-back row says to land after the verdict (MOD-153, #246).** The row now reads `chassis-delegation: <label> handed back · <glyph><alias> · <n> min · <usd> · verifying · land after the verdict`, with the up nudge still last, on every route that prints it, so a lead does not land or remove the worktree while the verifier's gate runs. The dashboard's verifying line and `/delegation status` are unchanged.

## 0.9.27 — 2026-10-25

### Added

- **A queued dispatch and `/delegation` name where the worker limit came from (MOD-145, #234).** A queued line now ends `; limit: maxWorkers 3 from your options file` (or `the repo file`, `the host options`, `the default`; `maxWorkersByTier.<tier> …` when a tier's cap is what queued it), read from the resolved config. `/delegation` shows `max workers 3 (from your options file; standard 2 from the repo file)`, naming a tier only when its source differs from the total's. A queue wait on a resource gets no limit text.
- **A card can name a merge check (MOD-143, #231).** `merge_check: <command>` in a card (the card tool's `mergeCheck` writes it), or a repo `mergeCheckMap` entry (gate id → command) for one of its gate ids, is run by `/delegation merge` in the worktree before it fetches and rebases, with `{card}`, `{sha}` and `{worktree}` filled in. A non-zero exit, a timeout or a spawn error refuses the merge with `<ID>: merge check failed: <command> exited <code>; nothing was rebased or committed` and the last 15 output lines; a pass adds `merge check passed (<command>)` to the success line. The dry run prints `merge check: <command>`. A command the gate map would refuse is refused at card write, at config load and at merge.
- **The dry run flags a hedged `Done when` line (MOD-140).** A statement that says `appropriately`, `as needed`, `tidy` or another listed hedge word outside backticks gets `hint: done-when line <n> says "<word>": the worker decides that alone; name the outcome`, printed beside the scope-size warning and the tier hint (at most three lines, then a count). Nothing is refused.

### Changed

- **A gate the verifier finds red says why on the verdict row (MOD-149, #222).** A refuted gate claim now reads `gate=pass claimed but the gate is RED at <sha> (exit <n>; output <path>)`, where the path is `verify-gate-<attempt>.txt` under the session's `.delegation/<task>/` and holds the gate's full stdout and stderr; the output tail lines stay. With no folder or a failed write the claim reads as before. After a red run in a worktree the verifier reads HEAD again: when the worktree is gone or HEAD moved, the gate claim is `unchecked` with `the worktree changed while the gate ran (gone | HEAD now <short>); the gate was not judged`, so the verdict is not refuted on gate.
- **The docs and the card tool say the card is the worker's whole instruction (MOD-139).** `docs/guide.md` gains a "What the worker sees" subsection under "The card", the card tool's top-level `doneWhen` description names the rule, and `docs/how-it-works.md` step 2 says the same.

### Fixed

- **A refuted verdict does not propose a resume when the worker's commits are already on the base (MOD-150, #222).** Before the next step of a refuted or unverified verdict for a worktree task is chosen, the mod lists the branch's commits not on the base by patch (`git log --cherry-pick --right-only --no-merges`, read-only). When none is left and the branch has a commit of its own, the row reads `next=none — the work is already on <base> (cherry-picked or merged); nothing to resume`, and nothing is resumed or escalated. Any commit not on the base, or a log that fails, leaves the next step as before.
- **The verdict tool waits for a hand-back adopted onto its task's brief (MOD-148, #222).** A spawn with no brief whose report names `task=` is judged against `<root>/.delegation/briefs/<task>.brief.md`, but its attempt was written only after the verify, so the verdict tool called in the hand-back turn answered `no attempt recorded` and the row arrived minutes later. Now the adopted attempt is recorded as pending, and held in the process memory, before the verify runs; the verdict tool waits for the row, and a verify in flight whose spawn names the task counts as an attempt. The record is patched with the verdict afterwards, so the ladder holds one record for the attempt. A task with no record and no verify in flight still answers `no attempt recorded` at once.
- **`dispatch verify=<sha>` at the last attempt's own sha reads the newest red file (MOD-147, #234).** A re-judge used to take the red file the attempt first recorded, so a worker that wrote a new `red-N.txt` after an `unverified on red` verdict never moved it. Now, when the brief wants a red and the task's `.delegation/<ID>/` folder holds a `red-N.txt` with a higher N than the recorded one (or, for a recorded red not named `red-N.txt`, a `red-N.txt` newer by modification time), the re-judge reads it, prints `red: <new path> (newer than the attempt's <old path>)` before the synthetic report, and patches the attempt's red to it. A new file whose text matches an earlier attempt's red is still refused as reused. A verify at a new sha takes the newest red as before.
- **Dispatch reads the session's own card first (MOD-144, #234).** A task id the store remembered for another repo (written when the id was once delegated there, or carried over by the key migration) sent dispatch to that repo's card of the same id, so a new queued card was refused as `status merged`. Now a card with the id in the session's own card folder is the one dispatched, and the remembered repo is read only when the session holds no such card. Dispatch adds `note: <ID> was once a task for <repo>; this dispatch is for the card in <dir> (pass repo=<repo> for the other)`, and once it cuts a worktree for the session's own repo it deletes the stale record. `repo=`, a card's own `repo:` path and a task with no session card behave as before.
- **The card tool warns on a placeholder red test path (MOD-146, #234).** A `red_test` path that still holds a template marker such as `test/core/<module>_test.cjs` gets `warning: red_test names <path>, which holds a placeholder <module>; name the real file or command` at the dry run, in place of its scope warning. A `<…>` in prose, with no slash joined to it, stays quiet.
- **`merge --finish` keeps a worker's evidence (MOD-142, #231).** `git worktree remove` refuses on untracked files but not on git-ignored ones, so finish deleted a worker's screenshots and logs saved under an ignored folder. Now, before the pull or any removal, finish lists the worktree's untracked and ignored files outside a built-in skip list (`node_modules/`, `.delegation/`, caches, build output, `.DS_Store`, `.pyc`) and stops with `…holds <n> untracked or ignored files the merge does not carry; copy what you need…`, naming up to 20 paths. `--finish --discard` (or `discard: true` on the merge tool) deletes them and notes `discarded <n> untracked or ignored files`; `--discard` without `--finish` is refused.
- **Dispatch re-renders a stale brief for the same repo (MOD-141, #232).** An existing worktree or `repo=none` brief used to be reused whatever the card or the flags said, and `--scope` and `--forbid` did nothing to it. Now dispatch renders the brief again and, when the card, `--scope` or `--forbid` would change it, rewrites the file and says `2. brief <path> rewritten: the card changed, --scope applied, --forbid applied`; an unchanged brief reads `exists — reused, not overwritten` with no suffix. While a worker on the task is live, a brief that would change is refused with `a worker on <ID> is live and reads <brief path>; its brief is not rewritten under it`, before any worktree is cut. Amend blocks survive, a base flag still only sets `base=`, and a brief written by hand or a `repo=here` brief is never rewritten. The forbid/done-when warning gains `fix: forbid=<list>`, the forbid to pass back as `--forbid`.

## 0.9.26 — 2026-10-24

### Added

- **`/delegation debrief ingest <note.md>` turns the lead's review note into debrief findings (MOD-137, #223).** Each top-level bullet under a `For the mod owner` heading becomes one finding (`P1`/`P2`/`P3` prefix for severity, the first sentence for the title, nested `Evidence:` lines for the evidence, source `review note <name>`). The findings are scrubbed as a debrief's are and written to `<root>/.delegation/debriefs/YYYY-MM-DD-note-<name>.findings.json`; `/delegation debrief post` lists them. Nothing is posted by ingest.

### Changed

- **The clean-stop debrief asks for a review note instead of running an agent (MOD-137, #223).** A new user option `debriefMode` (`notes` by default, or `transcript`). With `notes` the clean stop spawns nothing and appends one row per round of closed tasks: `a round of tasks closed (N verdicts): write the review note, then /delegation debrief ingest <note.md>`. `transcript` runs the background debrief exactly as before; `autoDebrief false` silences both.

### Fixed

- **A task already merged stays closed (MOD-136, #222).** A hand-back for a task whose last attempt is retired (or whose card on the default branch reads merged), or whose worktree folder and branch are both gone, was verified against the post-merge tree, gave a misleading refute and left an owed row for finished work. Now it is not verified, counts against no budget, writes no owed row, and posts one row: `<task>: hand-back after the task closed (merged|branch gone); not verified, nothing owed`. Retiring a task (the sweep, a merge command, `/delegation merge --finish`) clears its owed row, and the `/delegation` summary skips a retired task even for rows written before the retire. A task that is not retired and still has its branch is verified as before.

- **The verifier finds a brief written by hand (MOD-135, #222).** A spawn prompt that names its brief by a relative path (`.delegation/briefs/T-1.brief.md`, with or without `./`) is verified against that brief, read from the spawn's folder, else the session root; a path that climbs out with `..` is not read. A spawn that names no brief at all, whose report names a `task=`, is verified against `<root>/.delegation/briefs/<task>.brief.md` when that file exists and its header is for that task, and the attempt is recorded under that task. With no such file nothing changes.

## 0.9.25 — 2026-10-24

- **The ration health bar moves from the prompt footer to the band above the prompt (MOD-133).** The footer label never showed on a client that does not draw that row. The band now draws the coloured seven-cell bar and one line, `59% left · resets 2d 4h · today 6.2/8.4 · on pace`, with the `[ details ]` button, whenever the chosen window has a reading and no survey is showing, with no worker figures. `dashboardBand: true` still adds the worker line and sparkline under it while a worker is active; `ration: off` draws nothing. The footer label is gone; `/delegation ration` and the `ration:` line are unchanged.

## 0.9.24 — 2026-10-24

- **`maxWorkersByTier` caps the briefed workers of each tier beside the `maxWorkers` total, so a cheap row no longer waits behind queued frontier rows (MOD-131, #219).** A repo-scope option, an object of tier (`economy`, `standard`, `frontier`, `premium`) to a whole number of 1 or more, default `{}` (no per-tier cap); it merges key by key across the layers and is a second, lower ceiling under `maxWorkers` (which still means the built-in 2 at `0`). A briefed spawn starts when the total has room and its tier's own count is under its entry; a tier the map lacks takes the total alone. The queue plans per tier: a row whose tier is full is skipped without taking a slot, so a row of another tier behind it is `ready:` in its place. When only the tier is full the refusal reads `queued: X — the mod will tell you when a frontier slot frees (…)`, and the dashboard line and the debug line name the tier; `/delegation` prints `max workers 6 (economy 5, standard 5, frontier 2)`. With the option absent nothing changes.

## 0.9.23 — 2026-10-23

- **A rationing meter in the prompt footer shows the week's rate-limit window, today's share and the pace (MOD-128).** Next to `focus` the footer now reads `██▉░░░░ 41% · day 3/7 · today 6.2/8.4 · on pace`: a bar of the window (a cell a day for `seven_day`, an hour for `five_hour`), the share of what is left that today may use, and whether today is on pace. The mod keeps one record per local day and window for 14 days. New options `ration` (`seven_day` default, `five_hour`, `off`) and `rationDaily` (points; `0` paces to the reset). `/delegation ration` prints the report, `/delegation` gains a `ration:` line, the pane draws the bar in colour and the Spend tile names the window.

- **The host status line is retired and `dashboardBand` now defaults to off (MOD-128).** The status line text and its refresh timer are gone; the mod clears the line once at session start. The band above the prompt no longer draws unless `dashboardBand` is on (`/delegation config dashboardBand on`); the config view says `off: no band above the prompt`.

## 0.9.22 — 2026-10-23

- **The verdict row keeps `next=` last: `allow` rides inside it, and `/delegation config` names `briefLocal`'s default (MOD-126, follow-up to MOD-124).** The `allow` clause was appended after `next=`, so a reader scanning for `next=` met it mid-row. Now the quiet line carries `allow <a,b>` after the amend clauses and before `next=`, and the full verdict line carries ` · allow=<a,b>` before ` · next=`; with no allow ids both rows are byte-identical to before. The config view shows `none: no local rules` for an empty `briefLocal`, as `briefTemplate` shows its default. A test pins that a repo with neither `briefLocal` nor a card `allow:` renders the same brief as one whose `briefLocal` names a missing file. No new option.

## 0.9.21 — 2026-10-23

- **`briefLocal` copies a gitignored rules file into every brief, and a card's `allow:` pulls a named exception into it (MOD-124, #188).** A loop that drives one shared live app could not become a card: its rules lived in an untracked file a worktree never sees, and `briefExtra` forbade the one thing the loop must do. Now the repo key `briefLocal` (string, default empty; a path relative to the repo root or absolute) names such a file. Its text up to the first `### allow:` heading is rendered after `briefExtra` under `## Local rules (not for debrief)`; a missing file renders nothing, and a git-tracked or unreadable one refuses the dispatch in one line. A card key `allow: [id]` (plain words, like `resources`; the card tool takes `allow` too) renders the `### allow: <id>` block of that file as `## Exception for this card: <id>`, writes `allow=<id>` on the brief header after `resources=`, and ends the verdict row with ` allow=<id>`; an id with no block, or `allow:` with no `briefLocal`, refuses. The debrief template skips both sections and the findings scrub drops a finding that quotes them. `git ls-files --error-unmatch -- <path>` joins the allowlist. `briefExtra` stays a string; unset, a brief is byte-identical to before.

## 0.9.20 — 2026-10-23

- **`effortNudge.cards` unset means the card folder, so a repo on defaults gets the up nudge (MOD-121).** The built-in glob was `cards/**` while the built-in `cardDir` is `agents/tasks`, so a repo left on defaults never saw the nudge when a worker handed back cards (the 0.9.19 note had people set the glob by hand). Now, when no layer sets `effortNudge.cards`, the glob is `<cardDir>/**` (`agents/tasks/**` on defaults, and it follows `cardDir`); a layer that sets `cards` wins, `cards: ""` still turns the nudge off, and `up` and `down` merge key by key as before. `/delegation` prints the resolved glob: `effort nudge: agents/tasks/** · up high · down medium`.

- **`gateMap._empty` names the gate a hand-back with no changed files runs (MOD-122, #199 item 2).** A card whose delta is empty (research, renders, reads) still paid for whatever its gate id mapped to, one adopter's 30-minute suite included. Now `gateMap` may hold `_empty`, whose value is a gate id of the same map (not a command; other `_` keys stay comments). When the changed-files listing is empty, the verifier and `/delegation merge` run that gate instead of the card's, and the verdict says `gate: <card ids> → _empty <id> (no changed files)`; a non-empty delta runs the card's gates as before. A value naming no id in the map is named in the config errors and ignored. The `_gateMap` help text from init and docs/configuration.md name it. No new option.

- **The polling row keys a command by its command word and counts only a repeat that gets nowhere (MOD-119, #187).** Three Bash calls that began with the same `NAME=value` assignment, or three distinct probes to one tool while diagnosing, were counted as one command run three times, and the row advised a card for an investigation. Now `commandKey` drops leading `NAME=value` assignments (each optionally followed by `;` or `&&`) and a leading `cd <dir> &&`, and keys on the whole remainder (hashed when long), not its first 60 characters. A run counts toward the row only when the same key repeats, and a repeat whose output changed since the last same-key call does not count. The row's wording and the `driveWarn` and `driveWarnTokens` options are unchanged.

- **`/delegation merge` targets the configured base branch (#186).** With `baseRef` naming a branch (`work` or `origin/work`), merge requires the main checkout to be on that branch (`… is on X, not work; switch it to work first`), rebases onto `origin/work`, and prints `gh pr create --base work`; `--finish` checks `origin/work`. A `baseRef` that is a sha or a tag keeps the default branch, and the merge output says so in one line (`baseRef <ref> is not a branch; merging onto main`). Unset `baseRef`: unchanged. No new option.

- **The brief shows the gate as the command it is judged by, and a red log under `scratch=` is read like one in the worktree (MOD-120, #199 items 1 and 3).** The verifier fills `{worktree}`, `{outdir}` and `{files}` in a gate-map command, but the brief showed the raw command, so a worker could not run its own gate. Now the gate line renders each id's command with the three filled (`{files}` as `<scratch>/files.txt`) and one line telling the worker to write that file with `git diff --name-only <base>` first. And a repo that forbids `.delegation/**` kept red logs in the worker's scratch folder, where the verifier refused them, so every such card came back refuted on red. Now an absolute `red=` is accepted when, and only when, it lies under the brief's `scratch=`, and read exactly like a worktree-relative one; any other absolute path is refused as before, the line naming `scratch=` as the allowed place. No new option.

- **Every per-task store key names the card's repo, so a card id reused in a second repo is that repo's own (MOD-117, #185, #184).** The store is one file per machine and card ids restart in each repo, but a local card's records sat under bare ids. Two repos with an `OPS-4` shared the verdict-row claim (`delegation.posted.OPS-4:1:1`), so the second repo's verdict row was never posted, and they shared the outside listing (`delegation.outside.OPS-4`), so one repo's verdict was judged against the other's folders. Now `tasks`, `outside`, `effort`, `classifier`, `mergePrep`, `taskRepo` and the attempt keys `posted` and `postedRow` take the `<id>@<repo>` form a card of another local repo already had, for the session repo's cards too (`taskRepo` and `mergePrep` by the session repo). At session start, once, each bare key moves: an attempt row goes to the key of the root (or repo) it names, else the session repo's, the bare key is deleted, and the debug log says `store: moved <n> per-task keys to their repo's key (MOD-117)`. Retention walks the new keys. Cards for another repo behave as before. No new option.

## 0.9.19 — 2026-10-23

- **The rows nudge the brain's own effort, and the started row names the worker's (MOD-114, #201).** The brain's effort is the user's `/model` setting, which the mod never changes; the user's rule was high for judgment turns and medium for the rest, and the way back down relied on memory. Now a hand-back whose report's `artefacts=` names a file under `cards/**` ends its handed-back row `· lead: judgment next, raise to high`, and once no such hand-back awaits its verdict, the first accept row of another task, or the next started row that is not a resume, ends `· lead: back to medium`, once. The started row also names the effort the worker's steps run at (`· effort high`, from `effortByTier` or the card's `effort:`). New repo option `effortNudge` `{cards, up, down}`: the glob and the two words; `cards: ""` turns the nudge off. `/delegation` prints `effort nudge: cards/** · up high · down medium`.

## 0.9.18 — 2026-10-19

- **docs/how-it-works.md shows the mod's flow in four sequence diagrams (MOD-105).** Card to merge, what the verifier checks, resume and the attempt budget, and a card for another repo. Each is a mermaid block with an italic alt line above it and a numbered plain-text walkthrough below, so the page reads without mermaid. Docs only; no behaviour change.

- **`bin/evidence.mjs` turns delegation ledgers into one anonymized JSON summary of outcomes, cost and time (MOD-104).** `node bin/evidence.mjs <ledger.jsonl> [<ledger.jsonl>...]` prints verdict counts, attempt histogram, first-attempt rate, per-tier cost and minutes, per-day totals and per-repo figures, with repos labelled A, B, C. It emits no path, task id, sha, session id or free text. No new option.

- **The docs are half as long, with an evidence page and a README that shows the flow (MOD-106 to MOD-112).** docs/evidence.md has six charts from six repos' ledgers, each with a data table and a lesson, and `bin/evidence-charts.mjs` redraws them. The reference pages were cut from about 38,000 words to about 17,000, in tables and steps, with every command, option and linked heading kept. docs/upgrading.md lists what to do at each version, and docs/how-it-works.md has three corrections.

## 0.9.17 — 2026-10-18

- **A short red file with no failure marker is settled by the red test's own run at the head (MOD-102, #166, follow-up to #117).** A state-style red file (55 bytes of `count=3`) came back `unverified on red (no failure marker found…)` though the work was fine, and the brain checked it by hand. Now, for a red file of at most 2048 bytes with no marker, the verifier runs the brief's `red_test` command once at the worker's head, in the worker's tree, under the gate time limit. Exit 0 and trimmed output that differs from the red file: the red claim is held, `red=<path>, 55 bytes, no failure marker; the red test passes at the head and prints otherwise`. A run that fails, cannot run or prints the same leaves it unchecked with today's detail plus a reason (`; the red test at the head printed the same`), and the advice stays `check red by hand`. A larger file, a `red_test` that is `none` or names no command the allowlist takes (prose after the command is dropped), and a file with a marker behave as before; the one-proof-per-task and byte-identical checks still apply first. No new option.

- **An owed row retires when the work lands by cherry-pick on the current branch, and `/delegation accept` takes several ids or `--owed` (MOD-101, #158).** Where the default branch is guarded, work reaches a long-lived working branch by cherry-pick, so the worker's sha never reached `origin/main` and its owed row stayed, to be accepted one at a time (22 times in the reported case). The retire check now also counts a consistent worker's sha as landed when its patch is on the session's current branch (every commit of its side has a patch-equal commit on `HEAD`, the `git cherry` answer, read with a `git log --cherry-mark` the allowlist already knows), and a card reading `status: merged` or `landed` in the working tree retires its row, not only one on `origin/main`. `/delegation accept A B C [note]` retires each named id and prints a line per id (an unknown or already-retired id says so; the others still retire); `/delegation accept --owed [note]` retires every owed row of the session and says how many. Anything that is not a task id (`PREFIX-N`) is still the note. No new option.

- **A worker whose store record was refused still counts and still gets a verdict (MOD-94, #157, #159).** MOD-89 keeps the store under the host's cap, but the slot count and the verdict still hung on a spawn record landing: with the record refused, a third worker started under `maxWorkers` 2 and the verdict tool said "no attempt recorded". Now the hook remembers the briefed workers it saw start in this process, and the live count (slots, resources, the status line, `/delegation`) reads that memory when the store has no record. A briefed spawn appends a spawn line to `.delegation/ledger.jsonl` (`event: spawn`, with the task, attempt, budget, tier, agent, brief and worktree; skipped with `ledgerFile` off), which every reader of verdict lines reads past and the card tool still counts as a taken id. A hand-back with no record is judged from memory, else from that ledger line plus its brief, and the verdict tool takes the same path before it answers no attempt recorded. Such a verdict says so on its row, `(from memory: the store had no record)` or `(from the ledger: the store had no record)`, and once in the debug log. No new option.

- **A gate the verifier stopped at its time limit is advised as a re-verify, not a resume (MOD-96, #147).** A gate still running at the verifier's 9-minute limit left the attempt unverified with `next=resume`, which cannot make the gate faster and spent an attempt. Now, when every unchecked claim is such a gate, the advice is `check`: `gate <id> hit the verifier's <n>-minute limit: time it by hand in the worktree, then re-run the verifier with /dispatch <ID> --verify <sha> (no attempt spent)`. With another unchecked claim the advice stays a resume and its `prove:` list says the gate timed out and need not be proved. A refuted verdict is unchanged. No new option.

- **A cross-repo dispatch never reuses a brief written for another repo, and its brief carries the target repo's briefExtra (MOD-95, #154).** A card first written for the session repo and then re-carded for another repo kept its old brief at dispatch ("exists — reused"), with the session repo's worktree, card path and gate, so a worker would have worked in the wrong repo; and every brief for another repo carried the session repo's `briefExtra` lines. Dispatch now compares an existing brief with what it would write on three points, the header's `repo=`, the worktree the brief names and the card path it names. All three agree: the brief is reused as before (an amended scope or a hand edit is kept). Any differs and no attempt of the task is running or awaiting its verdict: the brief is rewritten and the dispatch says `brief <path> was written for <what it named>; rewritten for this card (<points>)`. Any differs and an attempt is open: dispatch refuses in one line and writes nothing, no worktree either. A brief for a card in another local repo takes `briefExtra` from that repo's `.chassis-delegation.json` (empty with none); a card in the session repo is unchanged.

- **The card tool says why a gate was refused, takes a forbid with a space, and warns once about done-when paths (MOD-98, #160).** A gateMap entry the gate checker refuses (`env FOO=1 make`, say) was dropped without a trace, so a card naming it was told `gate <id> is not in gateMap`, which reads like a typo. The loader now keeps the reason: the card tool says `gate "<id>" refused: <reason>; put the command in a script file and name the script as the gate`, and `/delegation config` lists the entry and its reason under gateMap. What a gate may run is unchanged. A scope or forbid entry that is a path holding a space (`Old Stuff/**`), given as a list element, is now written whole: the card and the brief header quote it (`forbid="Old Stuff/**",b/**`), the header parser reads the quote, and the verifier checks a path under that folder like any other; a spaced scope also adds `scope_globs=` so the verifier does not read it as prose. An entry with no space is written exactly as before. The `forbid <glob> matches <path> named in done-when` warnings for paths a done-when line merely mentions collapse into one line, `warning: forbid covers paths done-when names: <path> (<glob>), …`; a path whose statement says it is written, changed, created, added or updated keeps its own full line, listed first. The scope warnings are unchanged. No new option.

- **A waiting worker wakes the brain once per state, says what it waits on and says stalled past a ceiling; the polling nudge names the move (MOD-99, #161, #165).** A background worker waiting on its own job woke the lead about ten times in 15 minutes with the same message. The source is the worker's `turn.complete`: a briefed background worker whose turn ends with no report and says it is waiting is now a wait, not a hand-back. The first wait wakes the brain once, `<id> waiting on <resource> held by <holder>` when its card names a resource another worker holds, else `<id> waiting on its own background job (<n> min)`; every repeat in the same state goes to the debug log only; a resume or a hand-back starts the state over. A new option `waitStallMin` (default 20, 0 = off) says once `<id> stalled <n> min; resume or stop it`, by the clock even when the worker goes silent. A host notification the hooks never see cannot be held (docs/internals.md). The brain's polling row now names the move: `card it with resources: [<name>] so one worker drives it` when the command names a resource a running card declares, `wait with the verdict tool (it returns when the worker hands back) instead of polling` when a worker is running, else its old text plus `see docs/guide.md#one-client-resources`.

- **The docs name the by-hand gate for a hand-back with no trustworthy verdict, and the ledgerFile option says the ledger also holds spawn lines (#162).** While the verifier was out, every card landed through a by-hand gate and none had to be reverted. `docs/review-and-merge.md` now has a section for a verdict that is missing (`no attempt recorded`) or unverified for a reason the worker cannot fix: re-run the verifier with `/dispatch <id> --verify <sha>` first, then, if that cannot judge it, the by-hand gate. The `ledgerFile` option text, its row in `docs/configuration.md` and its manifest description now say the ledger holds one line per briefed spawn and one per judged attempt. No behaviour change.

- **A card for another repo is counted, resumed and verified as a local one is (MOD-97, #155, #163, #164).** One store serves every repo, so a task id known in two repos shared one attempt list: an `OPS-15` dispatched into B started as "attempt 2/2" because A's `OPS-15` had run, and its verdict could name A's attempt (#163). Attempts of a task for another repo now live under `delegation.tasks.<ID>@<repo>`, with the bare key's records read by the repo their `root` names, so each repo counts its own; the verdict tool, the start row, the budget, `/delegation` and the owed rows name that repo's attempt. A worker resumed with SendMessage after a verdict was judged with no brief ("attempt 2/3 unverified ... no brief: no scope=/gate=/red_test= to check against") while its brief existed, because the engine's resume spawn took over the agent id; it now keeps its brief, so the resume is attempt 2 of the brief's budget, verified against the brief, for a card of the session repo as well as another (#155). And a stale outside listing left by another repo's task of the same id left in-scope work unverified on scope; the outside listing is now per repo too, and a dispatch whose brief names no outside root clears it, so in-scope work in the other repo is `consistent` and a real out-of-scope path there is still refuted (#164).

## 0.9.16 — 2026-10-18

- **A failed debrief check no longer restarts the debrief (MOD-91, #156).** A debrief whose check failed put back the previous record, whose time and watermark made both clean-stop guards pass, so the next idle stop started the same debrief again, each run spending an agent. The record now carries `lastAttemptAt` and `failedChecks`: the cooldown counts from the latest start, and a second failed check on the same start watermark stops the automatic start with one row per session (`debrief stopped: the check failed twice on the window from line <n>; run /delegation debrief to retry by hand`). `/delegation debrief` still runs; a clean check clears the count. A check that is not clean keeps its lines in `<debrief>.check.txt`, and a check that rewrites the file keeps the agent's original as `<debrief>.orig.json`. No new option.

- **Parallel spawns no longer kill the hooks worker (MOD-92, #168).** When the brain made several Agent calls in one message, their spawn decisions ran side by side. They lost each other's record writes (two subtasks of one task, the workers list) and took slots in whatever order their awaits finished. Each waited on the scheduler lock, which counts against the hook's 10 s budget: one decision holds that lock through a store read for every agent in the session. No decision ever read `next.signal`, so a hook past its budget ran on, and twice in a row the host killed the hooks worker. Now the spawn hook decides one spawn at a time, in the order the calls came. Its every step races the hook's signal, so an aborted hook returns at once, starting and recording nothing. A decision that has not started its subagent with 2.5 s of budget left is refused with `<id>: the spawn decision ran out of time; make the Agent call again`. The status-line walk runs after the next decision is let go. No new option.

## 0.9.15 — 2026-10-18

- **The store stays under the host's 4 MiB cap (MOD-89, #157, #159).** The host refuses a `$.store.set` once the plugin's store passes 4 MiB of JSON text, and the mod never deleted a record, so the store shared by every repo and session filled up: new spawn records were refused, the verdict tool said "no attempt recorded", no verifier ran, and `maxWorkers` was not enforced (a worker counts only when its spawn record reads back). Now, at session start and after each verdict, the mod deletes (through `$.store.delete` only) every per-task record whose newest timestamp is more than 7 days old and whose task is not open (no running worker, pending verdict or queued spawn); over 3.5 MiB it also deletes closed records younger than that, oldest first, until the store is under 3 MiB. An open task, a record with no timestamp, and the session-level keys are never touched. A prune says `store: pruned <n> records (<x> MiB to <y> MiB of 4 MiB)` in the debug log, and at session start as a row. A new spawn record no longer keeps the prompt text (nothing read it). A refused write is said out loud: the first in a session is a toast and the row `store write failed: <key> (<reason>); new workers may have no verdict until the store is pruned`, and `/delegation` shows `store: <x> MiB of 4 MiB`, plus `store: <n> writes refused this session (last <key>)` when any were. No new option.

## 0.9.14 — 2026-10-16

- **The card tool never reuses an id that owns a brief or a ledger row (MOD-87).** `nextNumber` read only the card folder, so after a card was deleted the next card could take its id and dispatch reused the old brief, tier and attempts. The ids in the session root's brief folder (and the scratchpad brief folder when no briefDir is set) and in `.delegation/ledger.jsonl` now count as taken. A ledger line that is not JSON, or has no task, is skipped.

- **Scope is checked under an outside folder too big to list (MOD-85).** A forbid or scope root outside the repo that holds more than 10000 files used to come back unchecked, because its listing is kept in the store. Now the dispatch records the time before that root's walk (a watermark) and says `<root> holds more than 10000 files, so changes there will be found by modification time`; at hand-back the root is walked again (up to 1000000 entries, links not followed) and every file and folder modified since is judged against scope and forbid, a deleted file showing as its folder. Nothing newer holds the claim.

- **`/delegation merge` works with a git-ignored card folder (MOD-86).** A repo that keeps its cards local
  through `.git/info/exclude` could not use the merge: prepare's `git add` of the card was refused as an ignored
  path, and `--finish` refused because the card was not on origin. The merge now asks
  `git check-ignore -q -- <card>` (a new read shape in the allowlist, nothing but `-q -- <one path>`). For an
  ignored card, prepare marks the root card `status: merged` in place (with the Review section), makes no card
  commit and says `card kept local (git-ignored): <path> marked merged`; `--finish` keeps the root card, confirms
  the merge by the worktree head or its rebased twin on origin, then cleans up and writes the merged row.
  `/delegation setup` and `/delegation init` print a `cards: <cardDir> is git-ignored, so cards stay local; …` line.
  A tracked card behaves as before.

## 0.9.13 — 2026-10-16

- **The README is a front door (MOD-83).** README.md is now a short page: what the mod is, one picture, install in three lines and a list of pages. The reference moved, text unchanged, into eight pages under docs/ (install, guide, contracts, review-and-merge, configuration, spend, internals, upgrading), and the per-version upgrade notes are in docs/upgrading.md. `/delegation update` now points at `docs/upgrading.md` for the `From <old> to <new>` section. tests/node/docs.node.mjs keeps the links honest.

## 0.9.12 — 2026-10-15

- **One delegation meter (MOD-81).** While the band above the prompt is drawn, the host status line is cleared
  instead of repeating it. The band's row now names the live workers and the context percent
  (`delegation · 2 live: OPS-165, OPS-160 · 0 queued · $109.92 · ctx 11%`; a long list is cut with `…` before the
  dollars), and the pane's header gains the same `ctx` part. The band and the status line read the newest
  `$.session.usage()` cost the mod has seen, so their dollars agree; the sparkline still draws from the sampled
  series. With the band off, empty, or undrawn for over a minute, the status line shows as before.

- **`/delegation debrief post` and `apply` find the findings where the debrief wrote them (MOD-80).** With your own
  debrief skill installed the debrief and its `.findings.json` land under `~/.claude/harness/debriefs`, which the
  by-hand doors never read, so `debrief post 1` answered "no .findings.json under <root>/.delegation/debriefs/" right
  after a debrief that wrote one. One resolver (`hooks/lib/debriefdir.ts`) now picks: this session's debrief record
  path, else the newest findings file in `<root>/.delegation/debriefs`, else the newest in the harness folder whose
  debrief has this session's `session_id` (another session's file there is never picked). `apply`, the settled-notes
  and the posture line read through it, and a refusal names every folder it looked in.

## 0.9.11 — 2026-10-13

- **Every subagent row and every mod row carries a model glyph (MOD-78).** 🟢 haiku · 🔵 sonnet · 🟣 opus · 🟠 fable · ⚪ other.
  The agent.spawn hook rewrites the description of every spawn it resolves a model for to `<glyph> <description>`
  (once; a description already starting with a known glyph is kept), so the host's own subagent row shows the model.
  The started, resumed, started-from-queue and handed-back rows, the one-line verdict row, the `running:` and
  `brain:` lines of `/delegation`, and the dashboard's band and pane lines put the same glyph before the alias. The
  full-form verdict row, the ledger and the debug log stay bare (machine-read). New option `modelGlyphs`:
  `alias=glyph` pairs, `off`, or empty for the built-in set.

## 0.9.10 — 2026-10-13

- **The verdict tool waits for the verdict for real (MOD-72).** Live, every call failed with "registered the tool
  verdict but no tool.call hook answered this call": `runVerdict` waited in `$.clock.sleep(5000)` steps and the host
  counts a clock wait against the hook's 10-second budget (HookBudget), so the hook was dropped after two steps. The
  waits are now `$.process.run(['sleep', '5'], { timeoutMs })` steps (`$` calls other than the clock stop the budget
  clock), still stopping at `waitSeconds`; a sleep that cannot start answers the still-verifying line at once. The
  engine-gate lock wait was the only other long clock wait in a dispatch and is a process wait too (a clock wait of 1 s
  at most when the sleep cannot start). Engine tests cover both.

- **`/delegation merge <ID>` does the merge pipeline the brain typed by hand (MOD-75).** Half the brain's shell calls
  were the same fifteen-step merge after every consistent verdict.
  - Prepare: it refuses unless the last verdict is consistent with next=accept, the worktree is clean on its branch,
    and the main checkout is on its default branch with no tracked changes. It then fetches and rebases the worktree
    onto origin/main (a conflict aborts and names the files), commits the card as `cards: <ID> merged` (with
    `--review` text, and a model trailer when the model can be named), and runs the card's gates in the worktree
    (output in `.delegation/<ID>/merge-gates.txt`; a red gate stops it with the last 20 lines). It writes
    `.delegation/<ID>/pr.md` and prints the push, `gh pr create`, `gh pr merge` and `--finish` lines as one block to
    run verbatim.
  - `--finish`: refuses until the branch (or its rebased twin) is in origin. It removes the root card when it matches
    the merged one (else names the lines that differ), pulls, removes the worktree and branch, marks the record and
    the ledger `merged`, and prints the branch delete and, when `hooks/lib/version.ts` moved, the tag, its push and
    the loaded clone's pull. `/delegation` lists it under `merged:`.
  - The `merge` tool does the same for the model. The mod still never pushes or calls `gh`. Every argv still goes
    through `run()` and the one allowlist. The local merge writes are exact shapes in `allow.ts`, bound to the one
    task and on only while the merge command runs (`AllowConfig.merge`). While it runs, a push, gh, curl, sf or
    wget is refused before any other rule.

- **`/delegation config` shows the options the mod really runs with, each with its source, short by default; sets
  any of them on every screen; and every option is measured (MOD-73).** The list showed the manifest layer, not the
  values in use (`maxWorkers = 0 (default)` while the repo file set 3), and in the VS Code extension, where the host
  lists no settings rows for a folder-loaded mod, no option could be set at all.
  - One truth: every option resolves to its effective value and a source, `default` < `repo` < `yours` < `host`
    (`locked` for a policy row), the same values the mod and `/delegation status` use. A host value that is unset
    (its empty placeholder, or the manifest default the host fills in) counts as absent. Maps still merge per key.
  - Settable everywhere: a user options file, `~/.claude/chassis-delegation/options.json`, holds any option. The mod
    rereads it when it changes. `/delegation config <field> <value>` writes there when the host has no row (or
    refuses for having none) and answers `<field> = <value> (yours)`; with a host row it sets the row as before
    (`(host)`). `<field> default` resets; `repo <field> <value>` writes a repo-scoped option into
    `.chassis-delegation.json`, keeping its other keys and `_` comments, and refuses a personal one; a locked option
    says `<field> is locked by policy`; a malformed options file is said once by toast and in the debug log, and
    ignored.
  - Short by default: `/delegation config` prints a count line, only the options not at their default (grouped), and
    the how-to line; `all` prints every option with its summary, `<group>` one group, `<field>` one option with its
    scope and an `in effect:` line when the mod does something other than the stored value says. The MOD-68 no-rows
    line is gone.
  - Names match in any case, and an unknown name suggests the nearest option. Values read as a person reads them
    (on/off, `20 min`, `6 h`, `$10`/`no cap`, `200K`, `economy→haiku`, gate ids, `(none)`), lines are cut at 100
    characters, and the same forms are accepted when typed.
  - Measured: `tests/options.test.ts` sets each of the 49 options through `/delegation config` with no host rows and
    asserts a change in what the mod does; a node test holds the option table to the manifest both ways and holds
    that file to one case per option. The summary of `tierMap` and `ignore` now say what they do.

## 0.9.9 — 2026-10-13

- **`/delegation config` shows the options the mod really runs with, each with its source, short by default; sets
  any of them on every screen; and every option is measured (MOD-73).** The list showed the manifest layer, not the
  values in use (`maxWorkers = 0 (default)` while the repo file set 3), and in the VS Code extension, where the host
  lists no settings rows for a folder-loaded mod, no option could be set at all.
  - One truth: every option resolves to its effective value and a source, `default` < `repo` < `yours` < `host`
    (`locked` for a policy row), the same values the mod and `/delegation status` use. A host value that is unset
    (its empty placeholder, or the manifest default the host fills in) counts as absent. Maps still merge per key.
  - Settable everywhere: a user options file, `~/.claude/chassis-delegation/options.json`, holds any option. The mod
    rereads it when it changes. `/delegation config <field> <value>` writes there when the host has no row (or
    refuses for having none) and answers `<field> = <value> (yours)`; with a host row it sets the row as before
    (`(host)`). `<field> default` resets; `repo <field> <value>` writes a repo-scoped option into
    `.chassis-delegation.json`, keeping its other keys and `_` comments, and refuses a personal one; a locked option
    says `<field> is locked by policy`; a malformed options file is said once by toast and in the debug log, and
    ignored.
  - Short by default: `/delegation config` prints a count line, only the options not at their default (grouped), and
    the how-to line; `all` prints every option with its summary, `<group>` one group, `<field>` one option with its
    scope and an `in effect:` line when the mod does something other than the stored value says. The MOD-68 no-rows
    line is gone.
  - Names match in any case, and an unknown name suggests the nearest option. Values read as a person reads them
    (on/off, `20 min`, `6 h`, `$10`/`no cap`, `200K`, `economy→haiku`, gate ids, `(none)`), lines are cut at 100
    characters, and the same forms are accepted when typed.
  - Measured: `tests/options.test.ts` sets each of the 49 options through `/delegation config` with no host rows and
    asserts a change in what the mod does; a node test holds the option table to the manifest both ways and holds
    that file to one case per option. The summary of `tierMap` and `ignore` now say what they do.

- **Every worker's model is visible all the time (MOD-74).** When a briefed worker starts the mod posts one row,
  `<task> started · <alias> (<tier>) · attempt <n>/<budget>` (`resumed` for a resume, `started from queue` for a
  queued start); when it hands back, before verification, one more: `<task> handed back · <alias> · <m> min · $<usd> ·
  verifying` (`$?` while the spend is unknown). An ad hoc spawn posts neither, and `verdictVerbosity=silent`
  suppresses both; `line` and `full` post them. `/delegation` status opens with a `running:` section, one line per
  live, verifying or queued worker (`<task> · <alias> (<tier>) · <state> · <m> min · $<usd>`) and `brain: <model>`
  from the host, or `running: none · brain: <model>` when nothing is live. Logic is in `hooks/lib/rows.ts`.

## 0.9.8 — 2026-10-12

- **`/delegation config` lists the options in named groups, each with a short plain-English line (MOD-70).** The list
  was 48 bare `field = value` lines. It now prints seven groups in order (Workers and models; Checking the work;
  Where things go; Debriefs; Evals; Guards and nudges for the brain; Display), each a heading line, then every option
  as `field = value` with its `(default)` / `(locked)` marks and a summary of at most 90 characters on the next
  line, indented two spaces; a blank line separates groups, and the how-to and no-rows lines stay last. The table of
  groups and summaries is in `hooks/lib/configcmd.ts`; a manifest field it lacks still lists, under a last group
  named Other with no summary. `/delegation config <field>` shows the summary under the value line. A node test fails
  when a manifest option has no entry, the table names a field the manifest lacks, or a summary is over 90 characters.

## 0.9.7 — 2026-10-12

- **`/delegation config` lists the mod's options from its manifest, even when the host gives no rows for it (MOD-68).**
  In the VS Code extension the command printed only its how-to line: no row of `$.config.list()` had a key starting
  with `chassis-delegation.`. The list is now every `userConfig` field of the manifest, one line each; the value is
  the host row's when there is one, else the option the mod was activated with, else the manifest default. A host
  row is this mod's when its `provider.plugin` is the plugin's name or its key starts with `<name>.`, and its own key
  is what `$.config.set` gets (else `<name>.<field>`). When the host gives no row for the mod, the list ends with a
  line saying so, with the number of rows the host did list, and that a set may be refused on that screen while the
  `/config` menu in a terminal sets the same options. `/delegation config <field>` and `<field> <value>` work for
  any manifest field, reading kind and choices from the manifest when there is no row; a denied or thrown set
  answers `<field> was not set: <reason>`, the host's reason as given.

## 0.9.6 — 2026-10-12

- **`/delegation config` lists, shows and sets the mod's own options (MOD-66).** The mod told the person to set its
  options "in /config", which the VS Code extension gives to another extension or does not have, so wakeOnVerdict,
  redact and the rest could not be changed there. `/delegation config` lists every option of this mod, one line
  `<field> = <value>` each, marked `(default)` when it equals the manifest default and `(locked)` when managed
  settings own it; `/delegation config <field>` shows its value, kind, choices and description;
  `/delegation config <field> <value>` sets it through `$.config.set` and answers
  `<field> set to <value>; the mod reloads with it`, or the deny reason. The value is parsed by the option's kind
  (boolean: true/false/on/off/yes/no; number: finite; choice: one of its options; text: the rest of the line, `""`
  empty); a bad value or an unknown field says why and sets nothing. The usage line and the command hint name
  `config [<field> [<value>]]`, and the texts that said "in /config" (the empty `redact` refusal, the autoDebrief
  advice, the briefDir error, the status `config:` line, the scaffolded repo config's comments, the README) now name
  `/delegation config <field> <value>`. The `/config` menu in a terminal still works.

## 0.9.5 — 2026-10-11

- **Wakes are off by default, and the brain waits for its verdict with a new `verdict` tool (MOD-64).** The "The
  chassis-delegation plugin sent a message" turn that `wakeBrain` submitted (MOD-15) mostly repeated something the
  brain had already handled (a verdict it read in the hand-back turn, a task it had merged, a question it had
  relayed) and each one started a turn in the person's place. `wakeOnVerdict` now defaults to false, in the manifest
  and in `hooks/register.ts`, which treats it as on only when it is set to true; with it on the behaviour is
  unchanged. With wakes off nothing calls `$.prompt.submit`; verdict rows, `ready:` lines and the debrief's post
  question are still appended as rows. The one reason for the wake was a hand-back that starts the brain's turn
  before the verifier finishes, so the new `verdict` tool (`task`, optional `subtask`, `waitSeconds` default 600,
  at most 900) keeps the waiting inside that turn: it returns the verdict row as posted, with any `ready:` lines,
  at once when the latest attempt is judged, else waits in 5 second clock waits on the mod's own records and
  returns when the verdict lands, or `<task>: still verifying after <n>s; call verdict again`. The brain is told: the
  dispatch text under the spawn block and one "Delegation state" posture line say to call it in the hand-back turn,
  and the dashboard's open item names it instead of "the verdict lands on its own".

## 0.9.4 — 2026-10-11

- **A wake held during the brain's open turn is dropped when a later step of that turn already read its row (MOD-62).**
  The row is appended at once and the wake is held to the turn's end (MOD-42); if the turn made another main-loop
  model step after that, the brain had already read the row and often acted on it, and the held wake then started a
  second turn that repeated it (a debrief's post question was relayed, then asked again four seconds after the turn).
  Each held wake now notes whether a main-loop `turn.step` (no agent id; a subagent's step never counts) began after
  it was held, and the turn's end drops every such entry, its verdict, its `ready:` lines and a wake with no task,
  with `wake skipped: <task or row> read in the turn`. The row stays in the conversation and the ledger. A row that
  landed in the turn's last step, with no step after it, is submitted as before, after the MOD-51, MOD-57 and MOD-60
  checks, and a wake raised while no turn is open is unchanged.

## 0.9.3 — 2026-10-11

- **A state check's red file gets a marker line; a red file with no marker is checked by hand (MOD-59).** A red test
  that is a query or a file check can have correct red output with no failure word in it, so the red claim came back
  unchecked and the verdict said to resume the worker, who could only write the same bytes. The brief now tells the
  worker to end such a red file with `expected: <the green condition>; got: <what the output shows>` (the red marker
  already matches `expected`), the no-marker detail names that line, and an unverified verdict whose only unchecked
  claim is that no-marker red, with gate=pass, is advised `check red by hand` (accept if the file shows the red state,
  else resume to prove red). Every other unverified case is advised as before.

- **A non-consistent verdict for a task already merged or accepted no longer wakes the brain on arrival (MOD-60).**
  The merged check before a worker's hand-back wake (MOD-35) asked only about a consistent verdict, so an
  unverified or refuted row for a task already on the default branch (or accepted by hand) still woke the brain with
  a stale `next=resume`. It now asks about any verdict, on arrival and, as MOD-51 does, at delivery. For a consistent
  verdict the rule is unchanged (sha ancestry of origin/main, the card there reading merged, or a retire already
  recorded). For any other verdict the wake is skipped only when the task is already retired (a merge command the mod
  saw, or `/delegation accept`) or its card on origin/main reads `status: merged`; sha ancestry is not asked and never
  retires the task for it, because a worker that committed nothing reports a base sha already on origin/main. The row
  is still posted and recorded, the debug line stays `wake skipped: <task> already merged`, and any ready lines still
  wake the brain. This also closes a gap in 0.9.2: MOD-51's delivery-time check counted sha ancestry for any verdict,
  so a refuted no-work hand-back held to the turn's end could be retired as merged and its wake dropped.

## 0.9.2 — 2026-10-11

- **A held wake is dropped when the brain already messaged its worker (MOD-57).** A resume after a consistent
  verdict is recorded only at the worker's next hand-back, so a held `next=accept` wake still reached the brain at
  the turn's end while the worker was busy on attempt 2. The `session.send` hook now notes, for every delivered
  message to an agent, the agent id and the time (with an ordering counter), whether or not it records an attempt;
  `flushWakes` drops a held verdict wake whose spawn's agent was messaged after the wake was held, with the debug
  line `wake skipped: <task> attempt N: the brain already messaged its worker`. Its ready lines are still
  delivered; the notes are cleared at each flush.

- **A gate failure that only a forbidden file can fix gets a next step that works (MOD-55).** The brief template
  tells a worker whose only fix lies in a forbid= path to leave it alone and hand back gate=fail with
  `[[amend v=1 forbid-=<entry> scope+=<path> reason=<fix>]]`. `advise` (`hooks/lib/verify.ts`) now answers a refuted
  gate or a confirmed gate=fail whose lines hold an `amend needs approval:` line carrying `forbid-=` with
  `approve the amend (append it to <brief>), then resume agent=<id> to make the fix; or refuse it` (no agent left:
  the same brief respawned at the same tier); the tier never escalates and an exhausted budget still stops.
  `/dispatch` warns once per path-like word of `red_test` that is outside the scope or inside a forbid
  (`redTestWarnings`); nothing is added to the scope.

- **The brain is told once a session to start a fresh one (MOD-53).** When the brain's own turn ends with its
  context at or above the new `/config` option `freshSessionTokens` (default 400000; `0` turns it off), the mod
  appends one row: `brain context 512K (freshSessionTokens 400K): start a fresh session at the next phase
  boundary; cards, the ledger and lessons carry over`. A marker keyed by the session id keeps it to once a
  session, across a hot reload. The decision is `freshSessionRow` in `hooks/lib/drive.ts`.

- **The dispatch dry run warns on a wide scope and hints at the economy tier (MOD-54).** `/dispatch` (dry run and
  real) prints `warning: scope names N files (and M globs); cost tracks the files a card touches: split it` when
  the scope holds more than 6 literal entries (`SCOPE_FILES_MAX`; globs are counted, never trigger it), and
  `hint: tier economy would do: N files in scope, K done-when lines, a red test` for a standard card whose scope
  (entries under `tests/` or `test/` left out) has at most 2 entries, none a glob, at most 3 done-when
  statements and a red_test that is not `none`. Both come from pure functions (`scopeSizeWarning`, `tierHint`);
  the card tool's dry-run summary carries them. Nothing is refused or changed on the card.

- **A worker stopped by a usage limit is recorded as rate limited, and the queue holds (MOD-56).** A hand-back with
  no `[[report]]` block that names `hit your weekly limit`, `usage limit`, `rate limit`, `too many requests` or an HTTP-sense `429` (beside http, status, error or api; a bare 429 in a sha, line number or count is not read; any case) is a
  usage-limit stop (`turn.complete` carries no error text, so the text is read). The attempt record and ledger row
  carry `stop: rate_limited` (and `resetsAt` when a reset time is named), the verdict row reads
  `no-report (rate limited[, resets <time>])`, and `next=` is unchanged (`verify sha=` when work is present). While
  the last worker stopped so, a freed slot says `held: <task> queued; the last worker stopped on a usage limit at
  HH:MM[, resets …]; dispatch it when the limit resets` instead of `ready:`, and the ready fallback starts nothing;
  the next spawn the brain makes clears the hold.

- **A held verdict wake is dropped at delivery when its task has moved on (MOD-51).** MOD-42 holds a wake while
  the brain's turn is open; at the turn's end it dropped only a consistent wake whose task was merged, so a refuted,
  no-report, unverified or over-spend wake for attempt 1 reached the brain after attempt 2 had passed. Now
  `flushWakes` drops a held verdict of any kind when the task's attempt records (same subtask and lane) hold a
  higher attempt than the wake's, with the debug line `wake skipped: <task> attempt N superseded by attempt M`, or
  when the task is merged or accepted by then (MOD-35's retire check). A `ready:` line held with a dropped verdict
  is still delivered, alone. A wake raised with no turn open, and a held wake still current, are unchanged.

- **A done-when path in markdown bold no longer raises forbid warnings (MOD-52).** `donePaths` strips trailing
  punctuation (`:` `.` `,` `;` `!` `?` `)`) from each word, and emphasis only in pairs (a run of `*` or `_` that
  opens and closes the word), so `**some/file.html:**` and `**some/file.html**:` both read as `some/file.html`,
  while a glob such as `**/*.md`, `a/b.*` or `.claude-plugin/**` comes through unchanged; a backticked word is
  cleaned the same way. `forbidCollisions` skips the done-when warning for a path a scope entry already names
  (equal, or matched by the scope glob under the repo or absolute rule), since the scope warning covers it.

## 0.9.1 — 2026-10-11

- **The legacy verdict reader is removed (MOD-49).** `hooks/lib/legacy.ts` is gone; the old verdict word
  `verified` is no longer read as a verdict. A stored attempt record or recent-verdict row written before
  0.8.0 that still carries it is read as `consistent` by one normaliser (`readRecord`, `readLine` in
  `hooks/lib/attempts.ts`) at the two read sites, and each one is logged once at debug level. A metrics
  object written before the rename still folds its counts into `consistent`. The ledger is not rewritten.
  `tests/node/consistent.node.mjs` no longer exempts a file: any `verified` in `hooks/` or `bin/` fails the build.

- **The brain sees what driving costs it (MOD-48).** `/delegation` and the dashboard's spend block show
  `brain calls: N run-or-poll · N read · N edit · N spawn · average context 562K per call`: the brain's
  main-loop tool calls this session by what they did (run or poll: Bash `run_in_background`, `until` and
  `sleep` loops, a command run again in the same turn; read: Read, grep/sed/cat/ls; edit: Edit, Write,
  MultiEdit, a Bash write into the root; spawn: Agent, SendMessage), with the input plus cache-read tokens
  of the turns that made calls over those calls. A warn row, on by default (option `driveWarn`, off with
  `false`; `driveWarnTokens`, default 200000): at or above that context, the third command sharing its
  first 60 characters in a turn, or a poll, raises one row a turn naming the command, the count, the
  context and the dollars a call costs on the brain's model, and saying a standard card (with
  `resources` for a one-client app) would drive it. README: What the brain keeps and what it hands off.

- **The money figures match what a session costs (MOD-47).** Three defects in `brain: … · workers … ·
  ad hoc …`, found on a session whose line read `brain: opus $325.56 over 15 turns` for a main loop
  that cost about $972 on the mod's own table. (1) *Prices.* `hooks/lib/cost.ts` read every cache read
  at 0.1x input and every cache write at 1.25x. Cache reads now use each model's list price: Opus 5.5
  $0.20/MTok, Sonnet 5.5 $0.20, Fable 5.1 and Mythos 5.1 $0.25 (Mythos 5.1 is now in the table), every
  other model 0.1x input as before; cache writes are priced by TTL from `usage.cache_creation`:
  `ephemeral_1h_input_tokens` at 2x input, the rest at 1.25x, and a usage without the split stays at
  1.25x. The comment in cost.ts names the claude-api skill's pricing table, cached 2026-10-06. (2)
  *Missing turns.* The brain record lived only in `$.state`, which the engine holds for one session:
  a resume gets a new session id and an empty state, and a session that loads a new copy of the mod
  (the dev-mods snapshot) starts empty too, so every turn before either was lost (two-thirds of that session's turns). It
  is now kept in the store under `delegation.brain.<conversation start>`, the start time that a resume
  keeps and `/clear` resets, with `$.state` as the view. A `turn.complete` that carries no usage cannot
  be priced and is still not counted; this card found no evidence that any were missing. (3) *Ad hoc
  agents.* An agent's cost is the sum of its `turn.complete` usages, and a turn delivered to the hook
  twice (the same turn id and counts, as a resumed agent's turn can be) was added twice. A turn already
  in the agent's record is now skipped. The rest of the gap to a per-message transcript price (+18% on
  the 61 agents in that session, and $889 against $453 if every transcript entry is counted) is the
  transcript: it repeats one message's usage on each of its content-block entries, so summing entries
  counts a message several times; the mod never reads transcript usage, only the hook's per-turn
  figure. I could not replay that session's turns here, so the double delivery is the only mod-side
  cause the code shows. README: The brain's spend.

## 0.9.0 — 2026-10-11

- **`init` and `setup` take a path, so the brain can scaffold a sibling repo before delegating into it
  (MOD-45, public issue 95).** `/delegation init <path>`, `/delegation setup <path>` and the `init` and
  `setup` tools (`path`) take the absolute path of a git checkout (`~` expanded). With one they run
  their checks and their scaffold (the card folder README, `.chassis-delegation.json` with the detected
  gate, the `.gitignore` line) against that repo, written by the mod itself, and write nothing in the
  session root; setup's handover ends with `Next: call the card tool with repo set to <path>`. A path
  that is relative, not a git checkout or not plain is refused in one line. With no path, unchanged.
  README: Delegating into another repo.
- **The brain can delegate into another local git repo (MOD-44, public issue 95).** `card` and
  `dispatch` (the tools and `/dispatch --repo <path>`) take `repo` as the absolute path of a git
  checkout (the folder holding `.git`; `~` expanded); a relative path, a folder with no `.git` and the
  session's own repo are refused in one line naming why, and `worktree`, `here` and `none` are
  unchanged. For such a task the card is written to that repo's card folder when it has a
  `.chassis-delegation.json`, else under the session's `.delegation/cards/<repo folder name>/`; the
  brief header carries `repo=<abs path>`; the base is that repo's `origin/main` (fetched there) and the
  worktree is `<repo>-<ID>` beside it; the verifier, the scope delta, the red file and the gate run in
  it; the attempt record's `root` is that repo; the ledger and verdict rows stay with the session. That
  repo's config supplies the gate map, domains, `cardDir` and spend; with none, the gate is its
  detected test command (setup's `detectGate`) and the card may name a one-off gate command. The dry
  run prints `repo: <path> (config: its own | none, gate: <cmd>)`. The allowlist accepts
  `git -C <path> worktree add` for the task that names that path and no other, and the merged check
  asks that repo's `origin/main`. The scheduler, the dashboard and `/delegation` show the repo folder
  name beside the task (`T-1 [notes-app]`). README: Delegating into another repo. `/delegation init`
  taking a path is MOD-45.

## 0.8.3 — 2026-10-11

- **A verdict wake re-checks whether the task is merged when it is about to be delivered, not
  when the verdict lands (MOD-42).** While the brain's turn is open, wakes are held in the mod's
  session state and submitted together at the turn's end; each consistent verdict's task goes
  through MOD-4's merged check again first, and a merged or accepted one is dropped with
  `wake skipped: <id> merged before delivery`. Refuted, over-spend, no-report and `ready:` wakes
  are never dropped. Fixes wakes arriving for tasks the brain had already merged.

- **The mod's own correction detector catches pushback and challenge questions, not only an
  opening "no" or "stop" (MOD-39, public issue 89).** `isCorrection` keeps its first-word markers
  and adds three more, anywhere in the message: first-person disagreement or an explicit verdict
  (`i don't agree`, `i disagree`, `that's not right`, `you're wrong`); a challenge question ending
  in `?` (`shouldn't it …?`, `isn't it supposed …?`, `wasn't it supposed …?`, `aren't we/you
  supposed …?`) or a message ending in `bug?`; and a false-report verdict (`reported on something
  false`, `seems wrong/off/silly`, `looks wrong`). A priority reversal with no marker is still not
  caught. Thirteen benign prompts are pinned as not caught. The mod's own submits remain ignored.

- **A worker the brain resumes after a consistent verdict is judged when it hands back again (MOD-41).**
  A hand-back from a worker whose last attempt was already judged, with a report at a different sha,
  is recorded as the next attempt (kind resume, same lineage, counted against `budget=`) and judged
  like an advised resume's: the verdict row posts and the ledger gains its row. A hand-back at the
  same sha stays the MOD-1 re-judge and changes nothing. Past `budget=` it is still judged; the row
  says the budget is spent. The brain's own `SendMessage` needs no new command.

- **A card's frontmatter value that holds a space and a hash is no longer cut there (MOD-40).**
  The card tool double-quotes a title or red_test that contains ` #` (or starts with `#`), with
  inner quotes and backslashes escaped, so it round-trips byte for byte. The card reader treats a
  hash as a comment only as ` # ` outside quotes: an unquoted `#89` or `#n` reads whole, so a card
  written before this change reads whole too. The brief header carries the whole red_test.

- **The session's brain and worker figures count only this session's own attempts; ad hoc
  spawns get their own figure; an unattributed remainder closes the sum (MOD-37, public
  issue #91).** Every attempt record now carries `sessionId` (the session whose brain made
  the spawn) and `root`. The live view, the dashboard tables, the brain line and the worker
  counts keep a record only when its `sessionId` is this session's; a record from before
  this change is kept only when its root is this session's and it began at or after the
  session's start, so an old store no longer leaks other repos' attempts. An Agent spawn with
  no brief header is counted from its `delegation.cost.<agentId>` record: the brain line
  reads `brain: <family> $x over n turns · workers $y (n attempts) · ad hoc $z (n agents) ·
  unattributed $u · brain share p%`, where unattributed is the session total less the other
  three (never negative, left out under a cent) and the share is brain over the session total.
  The ad hoc part shows once an ad hoc agent has run.

- **The debrief check accepts a correction the transcript holds at its time (MOD-38, issue
  #90).** A corrections entry whose `at` is inside the window is matched against the user
  messages of the session transcript file (`~/.claude/projects/<root as dashes>/<session
  id>.jsonl`, rows of type user with their ISO timestamps): its quote, compared after
  collapsing whitespace, case and apostrophes, at least 12 characters, within two minutes of
  `at`, marks it `source: transcript` and it stops counting toward the flag. If the file
  cannot be read, the engine's session messages (which carry no times) are matched on the
  quote alone, marked `source: transcript-untimed`, and the check line says so. A check
  whose only flag was such corrections prints `debrief check: clean (n corrections evidenced
  by the transcript, none in the breadcrumbs)`, moves the record and sends the watermark
  message. `tool_denials` are unchanged.

## 0.8.2 — 2026-10-11

- **A merged task is not woken for, an accept is on the ledger, each verdict row is written
  once (MOD-35, issue #84).** Before submitting a verdict wake the mod runs MOD-4's merged
  check on a consistent hand-back (sha an ancestor of origin/main, the card there reading
  merged, or an accept already recorded); when it is merged the row is posted, no wake is
  sent and the debug log says `wake skipped: <id> already merged`. Refuted, over-spend and
  `ready:` wakes are never skipped. An accept line (`kind: accept`, task, subtask, attempt,
  sha, at, `how: merged | accepted`) is appended to `.delegation/ledger.jsonl` when the retire
  check finds the task merged, on `/delegation accept <id>`, and when the git guard's
  Bash hook sees the brain run `gh pr merge` or `git merge` naming the task's branch or PR,
  one per task attempt. Every ledger append is now guarded by its key (task, subtask,
  attempt, sha, verdict), so the doubled rows an adopter saw cannot be written again.

- **Per-domain lessons reach every brief in the domain (MOD-34).** A file beside the
  cards, `<cardDir>/lessons/<domain>.md`, is appended to each brief for that domain under
  `## Lessons (<domain>)`, after the card, as the file stands and capped at 40 lines (a
  longer file is cut with `(n more lines not carried; prune <path>)` and the dispatch
  warns). A missing file adds nothing. `/delegation lesson <domain> <text>` appends
  `- <YYYY-MM-DD> <text>` (creating the file), refuses a domain not in `domains` naming the
  list, and prints the line count and the cap; `/delegation lesson <domain>` prints the
  file. The card tool's dry run and dispatch print `lessons: n lines from <path>` when a
  file exists. The brief template tells the worker the Lessons section binds like the
  Rules; the init scaffold's card README mentions the folder.

- **`/delegation debrief apply` turns the agent's proposals into actions you approve
  (MOD-33).** `apply` lists the latest debrief's proposals numbered with target, a one-line
  summary and a status (open, done, dismissed); `apply <n>` prints one in full with a single
  instruction for the brain by target (draft an edit and apply it only on your yes; write a
  card; or show it and ask); `apply <n> done [note]` and `apply <n> dismiss [reason]` record
  `proposals_status` in the `.findings.json`. The next debrief's prompt carries
  `already done:` / `dismissed:` lines so settled proposals are not proposed again, and the
  delegation-state section carries `n debrief proposals open — /delegation debrief apply`
  while any are open. The mod writes nothing but its own record.

- **After a clean debrief check the mod tells the debrief agent to mark its watermark, and
  a re-judged refute is one fact (MOD-32).** The check prints after the agent hands back, so
  the agent never saw `debrief check: clean` and left `.done` unmarked. A clean check now
  sends the agent `debrief check: clean. Mark your watermark now, as your instructions say,
  and stop.` (your skill and the built-in template alike); a flagged or stripped check sends
  nothing and says the watermark was left as is. The mod still never writes `.done`. A refute
  that `--verify` re-judged consistent at the same sha is one verdict fact naming both
  verdicts (`a false refute`), not a refute row with an unlinked consistent row after it, and
  both prompts say a false refute is a went_wrong for the verifier or gate, never a went_well.

- **After a debrief the mod asks whether to post its findings (MOD-31).** A new
  `/config` option, `postFindings` (`ask` | `auto` | `off`, default `ask`), declared in
  the manifest and never read from `.chassis-delegation.json`: posting runs `gh` as the
  person, so the setting is theirs. `/delegation` prints `post findings: <mode> →
  <issueRepo>` beside the issues line.
  - **ask.** A debrief that hands back with at least one new mod finding ends with
    `post n findings to <issueRepo>? say yes to post them all, scrubbed, or name some
    (/delegation debrief post 1,3); nothing is posted without a yes`. The delegation-state
    section tells the brain to ask once and never post without an explicit yes; with
    `wakeOnVerdict` on, the question is also the plugin's wake message. Host findings and
    the agent's proposals are never in it.
  - **auto.** Right after the scrub the mod posts each new mod finding through the path
    of `/delegation debrief post all`, at most 5 per debrief (the output says how many
    stay drafts), printing `#n <url>`. A covered finding is skipped, never commented on.
    With the redact list empty it posts nothing, prints the set-redact line and asks.
  - **off.** No question, no posting; the drafts are still written.

## 0.8.1 — 2026-10-11

- **The mod reads its templates once, at load, and says when the folder on disk is newer
  than the code running (MOD-28).** Every brief written after MOD-22 merged (MOD-23 to
  MOD-27) carried about twenty raw `{{#none}}`, `{{#repo}}` and `{{/repo}}` markers.
  MOD-22 added those sections to `hooks/templates/brief.md` and taught `renderSections`
  to drop them, but the session that dispatched those cards was still running the code
  it loaded hours earlier, and dispatch read the template from the folder on disk, which
  the brain had pulled to main. Old code, new template: the workers each guessed which
  sections applied. The same skew hits any session whose folder is pulled without a
  reload (a `CLAUDE_CODE_PLUGIN_DIRS` folder never hot-reloads), and `/delegation update`
  leaves a session in exactly that state until the window reloads.
  - **Templates are read once.** `hooks/templates/brief.md`, `review.md` and `debrief.md`
    (`TEMPLATE_FILES` in `hooks/lib/dispatch.ts`, held equal to the folder by a node test)
    are read the first time the mod gets a `$` (`session.start`; `register` is handed none,
    and a mod reloaded mid-session reads at first use) and kept in memory with the code
    that renders them. Dispatch, the reviewer spawn and the debrief use that copy and
    never read the folder again until a reload. A file that fails to load is named in one
    toast at load, and the feature that needs it says so when used (`/dispatch` says the
    brief template could not be read; a review is skipped with `next=accept` and the
    reason; `/delegation debrief` says `debrief not started` and claims no watermark). A
    `briefTemplate` the repo file names is the repo's own file, not the mod's, and is still
    read at each dispatch.
  - **The built-in debrief carries its instructions.** The debrief agent's prompt now holds
    the loaded `debrief.md` between two rules, in place of the line telling it to read
    that file in the folder. A `~/.claude/commands/debrief.md` skill still wins, as before.
  - **A brief with a marker left in it is refused.** After a brief is rendered, the
    template's own text is scanned for any `{{` that no value fills (`leftoverMarker`,
    `renderBriefChecked`). One that survives refuses the dispatch, naming the marker and the
    template, before the brief is written, so no worktree is made and no worker reads it.
    The scan is of the template, not of the card: a card body that quotes `{{#none}}` is
    the card's text and passes. `renderBrief` renders exactly as before.
  - **`/delegation` says when the folder is newer than the code.** It reads
    `hooks/lib/version.ts` on disk (as text, never imported) and, when it names a version
    other than the running `MOD_VERSION`, prints `code: running <old>, folder holds <new> —
    reload the window to run it` under the `mod:` line; for a folder under
    `~/.claude/dev-mods` it says the folder reloads when the turn ends. `/delegation update`
    prints the same line after a merge that moved the version (and when an earlier pull
    left the folder ahead), and then ends with the reload story rather than "nothing to
    reload". A folder with no readable `version.ts` prints no line. README's Upgrading
    says why a reload matters and what the line means.
  - `folderVersion`, `codeSkewLine`, `inDevMods` (`hooks/lib/update.ts`);
    `unrenderedRefusal`, `templatePath` (`hooks/lib/dispatch.ts`); `builtInDebriefPrompt`
    takes the loaded text as its last argument (`hooks/lib/cleanstop.ts`). No config key,
    no new tool.

- **The dry run warns when a forbid glob collides with the card, and the card tool says that `*` crosses folders (MOD-29).**
  Public issue #63: a card forbade `artifacts/*.html` to keep the worker off the existing
  pages while its done-when required `artifacts/kit/index.html`; the forbid matched the
  required file, attempt 1 was refuted on scope, and the work was merged by hand. The
  card tool's dry run and `/dispatch` now print one warning per collision,
  `warning: forbid <glob> matches scope <entry>` or `warning: forbid <glob> matches <path>
  named in done-when`, and still write the card. Each collision uses the verifier's rule
  for its entry: a repo glob's `*` crosses folders, an absolute glob's `*` stays in one
  folder. The scope and forbid tool descriptions say that a repo path has no one-folder
  wildcard, so list the files.

- **`files=` takes a folder glob, and the red claim quotes the line that failed (MOD-27).**
  Public issue #56. A hand-back that listed a new folder as `docs/new/**` in `files=` was
  refuted on files, though the six paths under it were exactly the delta: `filesClaim`
  expanded only an entry ending in `/`. `dir/**` now stands for every delta path under
  `dir/`, and `dir/*` for the ones exactly one level under it, as `dir/` does for the
  whole tree. A glob that covers no delta path still reads as invented. The existing
  literal and trailing-slash behaviour is unchanged.
  - **The red claim skips a passing line.** A held red claim quoted the first marker
    match, so a passing test whose name holds `Error` (`…NeverAnException Pass`) was
    quoted as the failure while the real one (`Fail  System.AssertException: …`) sat two
    lines below. A line whose outcome reads as passing (a whole-word `pass`, `passed`,
    `ok`, or a ✓/✔ mark) is skipped; a line with a failing word (`Fail`, `failed`,
    `not ok`, ✗, ✕) is preferred over an earlier marker line; with neither, the first
    marker match is quoted as before. The claim holds or fails exactly as it did; only
    the quoted line changes.

- **A breadcrumbs debrief's prompt carries only the facts inside its window, each
  dated, and a window of session boundaries alone spawns nothing (MOD-26).** Public
  issue #55: `/delegation debrief` on a two-line window (a `session_end` and a
  `session_start`, no friction) handed the agent three facts from hours earlier, so
  the MOD-10 check rightly flagged the debrief, the record never moved, and the next
  debrief read the same stale facts and could never come back clean; a false refute
  from earlier was once filed as a went_well finding. Friction events were sliced by
  the count of new breadcrumb lines (two separate streams), verdicts were kept by the
  previous debrief's time, and the fact lines dropped the time both carry.
  - **The window chooses the facts.** In breadcrumbs mode the prompt holds the
    friction events and recent verdicts whose time lies between the window's first and
    last breadcrumb timestamps, inclusive. The line-count slice and the previous-time
    filter are gone from that path; without a breadcrumb file the selection is as it
    was. New pure `windowFacts` (`hooks/lib/cleanstop.ts`).
  - **Every fact line is dated.** `denial 2026-10-10T16:27:14Z: …`, `correction …`,
    `refuted …` and `verdict 2026-10-10T18:01:07Z: …` (a denial used to read `tool
    denied:`), in both modes, and both prompts tell the agent to cite that time as
    `at`. A time with milliseconds keeps them, so the agent cites it exactly.
  - **A boundary-only window spawns nothing.** When the window's lines are only
    `session_start`, `session_end` and compaction breadcrumbs and no fact falls inside
    it, `/delegation debrief` prints `nothing to debrief in lines a-b (session
    boundaries only)`, the automatic path logs the same, and the debrief record moves
    past the window (`skippedTo`; the mod still never writes the `.done` mark), so the
    next debrief starts after it. New pure `boundaryOnly` and `nothingToDebrief`.

## 0.8.0 — 2026-10-11

- **A repo=here card that shares a resource with an in-flight card is queued, not
  refused (MOD-24).** Public issue #33 (one worker per app, enforced by the queue).
  MOD-23 made a shared resource part of the repo=here overlap check, which refuses at
  dispatch unless `--force-overlap` is given; the brain then had to retry by hand
  for something the mod can sequence. The two are different things. Overlapping
  scopes would corrupt each other's dirty-tree delta, so a scope overlap still
  refuses, exactly as before, and still needs `--force-overlap`. A shared resource
  only needs sequencing, so a repo=here dispatch whose only overlap with an in-flight
  repo=here card is a resource now goes on and is queued with the MOD-23 waiting line
  (`queued: OPS-9 — waiting for resource blender-live (held by OPS-8)`), ready when
  the holder hands back. A scope refusal no longer also lists the resource.
  - **The band's queued item names the resource.** A queued `BandItem` gains
    `waits: { resource, holder }`, set for a row held up by a resource, and the
    pane's open item reads `OPS-9: queued (position 1) — waits for blender-live (held
    by OPS-8)` in place of `starts when a worker slot frees`; a row waiting for a
    slot reads as before. README's repo=here overlap paragraph and the resource
    paragraph say which one queues and which one refuses.
  - `resourceOverlapRefusal`, `resourceOverlapWarning` (`hooks/lib/dispatch.ts`) and
    `sharedResource` (`hooks/lib/brief.ts`) are no longer called by the dispatch.

- **Exclusive resources and fan-out (MOD-23).** Public issues #33 (ask B) and #32
  (ask 3). Two research lanes could not run at once because there was one live
  Blender with one open file; the brain wrote that into every brief and hoped it
  was followed. And research fans out: two or three workers, each owning an output
  folder, all wanting the same shared notes file, which the brain coordinated by
  hand. The queue now understands a resource name, and the card tool writes N
  lanes from one sentence. See "Exclusive resources and fan-out" in the README.
  - **A card may carry `resources: [blender-live]`.** Free-form words (letters,
    digits, `.` `_` `:` `-`). The brief header carries `resources=blender-live`
    after `outdir=`/`scratch=` and before `spend=`; a card with none writes the
    header it always did. `resources` is a recognised header field, so the value
    before it keeps its end.
  - **The queue enforces it.** A dispatch, or the brain's own Agent call, for a card
    whose resource is held by a running (or starting) worker is queued, whether or
    not a slot is free: `queued: OPS-9 — waiting for resource blender-live (held by
    OPS-8)`. The dispatch prints no spawn block, the hook starts nothing, and a
    second ask keeps its place. The hand-back that frees the resource carries the
    `ready:` line for it, in the same wake as the verdict row. Of several queued
    cards that name one resource only the first is ready; a row waiting for a
    resource takes no slot, and a card with no resources is never held up. A worker
    that has handed back holds nothing, even while its verdict is out. New pure
    `planQueue`, `resourceBlock`, `resourceDeny` and `waitsText` in
    `hooks/lib/scheduler.ts`; `resourcesOf` and `sharedResource` in
    `hooks/lib/brief.ts`.
  - **The `card` tool takes `lanes: [{ title, scope, doneWhen? }]` and `resources`.**
    It writes one card per lane, all or none: sequential ids (N, N+1, …), the shared
    why, gate, tier, repo, budget, resources and forbid, and each lane its own scope
    (so its own output folder) and `doneWhen` (the shared one when a lane has none).
    Lanes whose scopes overlap are refused, naming both; a shared `scope` beside
    lanes is refused; the tool's `scope` is no longer in `required` (a single card
    without one is still refused). The dry run prints every lane's summary and
    header and says go for all of them; `dispatch: true` dispatches each lane in
    order under `--- <ID> ---`. New pure `cardsFromFields` in `hooks/lib/card.ts`;
    `cardFromFields` still renders one card.
  - **The repo=here overlap check treats a shared resource as overlap.** A card
    whose `resources` name one an in-flight repo=here card's brief names is refused
    like an overlapping scope (naming the resource and the card), and
    `--force-overlap` lets it through with a warning; the queue then holds it.
  - **The delegation-state posture line also covers a pending review spawn
    block** (MOD-21): an owed `T-4: review` row now carries the posture line, like a
    ready row or a respawn block, so the brain makes the reviewer's Agent call
    without asking. A row waiting on a resource is named with what it waits for
    (`- queued: T-9 (position 1) — waiting for resource blender-live (held by T-1)`)
    and calls for nothing.
  - **The dashboard shows the resource.** The worktree table (pane) and its text
    fallback gain a resource column while any worker holds one or any queued row
    waits for one (`blender-live`, `waits blender-live`); without one the table is
    unchanged.

- **Research cards (MOD-22).** Public issues #32 and #33 (two adopter repos,
  2026-10-09/10): research and extraction lanes write their outputs outside the
  repo (an exported model, renders, a sound file, notes), often need the live
  checkout and its running apps, and have no test to turn green and nothing to
  commit. They ran as ad hoc Agent spawns, and claims nobody could check passed:
  a report said a glTF validator passed when none was installed, and a hair lane
  claimed byte-identical output nobody ran and left scratch files inside the
  repo. A card with an output folder, artefact assertions and a gate run against
  that folder refutes both. See "Research cards" in the README.
  - **The card tool takes `repo`** (`worktree`, the default; `here`; `none`) and
    writes `repo: here|none` on the card; `/dispatch` reads it from the card as it
    reads `--here`. A `repo: none` card dispatches with no worktree, no fetch and
    no git (`3. no worktree (repo=none): …`). The tool's description gains the
    clause: research or extraction with outputs outside the repo: repo none or
    here, scope = the output folder. An explicit `repo` beats the old rule that a
    repo with no `origin/main` writes `repo: here`.
  - **`scope` and `forbid` take absolute paths and globs** (a leading `~` is the
    home folder, expanded at dispatch). The first absolute scope entry is the
    card's `outdir` unless the card names `outdir:`; the header gains
    `outdir=<abs>` and `scratch=<abs>` (default `<system temp>/chassis-delegation/<ID>`,
    or the card's `scratch:`) after `repo=` and before `spend=`, and the brief
    template tells the worker to put deliverables in the output folder and helper
    files in scratch, never in the repo. A plain worktree card's header does not
    change. The template gains `{{#none}}`, `{{#repo}}`, `{{#outdir}}`,
    `{{#scratch}}` and `{{reportExtra}}`; `renderSections` takes a mode
    (`'worktree' | 'here' | 'none'`) as well as the boolean it always took.
  - **The outside delta.** At `/dispatch` the mod lists (relative path, size,
    mtime) every absolute scope and forbid root and stores it as
    `delegation.outside.<ID>`; at hand-back it lists them again. The scope claim
    covers both deltas: every git path against the repo entries and every changed
    outside path (added, removed, changed) inside an absolute scope entry and outside
    every absolute forbid entry. A refute names the delta
    (`out-of-scope path: /out/notes/scratch.txt (outside delta)`, or `(repo delta)`
    on a card with outside roots). A root that cannot be listed leaves the claim
    unchecked, never held; a root that is not there yet lists as empty. A reused
    brief keeps its first listing, so the delta is cumulative across attempts. New
    pure `outsideClaim`, `outsideCheck`, `outsideRoots`, `outdirOf` and
    `expandTilde` in `hooks/lib/norepo.ts`.
  - **`{outdir}` in a gate-map command**, filled with the brief's `outdir=` at
    verify time. The allowlist accepts the command word for word with only
    `{outdir}`, `{worktree}` and `{files}` filled by absolute paths; a command that
    names `{outdir}` when the brief has none is "gate not re-run".
  - **The report gains `artefacts=` and `metrics="k=v,…"`.** The `artefacts` claim
    holds when each named path (relative to `outdir=`, or absolute) exists and is
    not empty, fails naming the first that is missing or empty, and is absent when
    the report names none. Metrics are recorded on the attempt (`metrics`) and shown
    as `metrics: tris=1200, len_s=2.4` in the verdict detail, and never judged.
  - **`repo=none` and `repo=here` cards go through the same new claims** (the outside
    delta, artefacts, metrics, `{outdir}`); a `none` verdict keeps its
    `(no repo)` check and adds them.

- **An optional reviewer stage: after a consistent verdict, a fresh read-only
  reviewer labels each claim of the hand-back confirmed, refuted or
  unverifiable before `next=accept` (MOD-21; public issue #1, second half).**
  `consistent` (MOD-19) says the report matches git; nothing reads the diff.
  Two adopters added their own second layer, a reviewer that checks the
  hand-back's claims against the diff and never fixes anything, and it changed
  the outcome on about one hand-back in three. The brain now makes every spawn
  (0.7.0), so the reviewer is one more Agent call the mod prints, and its tool
  calls run under the mod's hooks, so the mod keeps it read-only.
  - **A new option, `review`** (`off` | `on` | `on-frontier`; repo file and
    `/config`; default `off`). `on` reviews every consistent verdict;
    `on-frontier` only an attempt at the frontier or premium tier; `off`
    changes nothing anywhere: no row, record, ledger line or `/delegation`
    line differs. `reviewTier` (repo file and `/config`) pins the reviewer's
    tier; unset, it is one tier below the worker's (economy is the floor). Both
    are declared in the manifest.
  - **`next=review`.** With review on, a consistent verdict (not a refuted,
    unverified, `gate=fail`, no-report, `repo=none` or `--replay` one) says
    `next=review` where it said `next=accept`, and ends with a spawn block for
    the reviewer: `subagent_type` general-purpose, the model one tier below the
    worker's (a standard worker gets a haiku, a frontier worker a sonnet),
    description `<ID> review <tier> <alias>`, and a prompt built from the new
    `hooks/templates/review.md`: read the brief, the report and the diff at the
    sha; one row per factual claim of the hand-back, `confirmed`, `refuted` or
    `unverifiable`, each with the command or `file:line` that decides it; edit
    nothing; end with `[[review v=1 task=<ID> confirmed=N refuted=N
    unverifiable=N]]`. The owed list names the review until it is made.
    `/dispatch <ID> --verify <sha>` is reviewed the same way. A template the
    mod cannot read gives `next=accept` and a `note: review not run` line.
  - **The reviewer is an attempt of kind `review`.** The prompt opens with a
    marker line (`[[review-of v=1 task=… attempt=… worker=… sha=…]]`), which the
    `agent.spawn` hook reads before it looks for the brief the prompt names. The
    hook records the attempt (`source: review`, in the task's records), runs the
    reviewer in the worker's worktree, and keeps it off the ladder: it never
    counts against `budget=`, takes no worker slot, is not numbered among the
    worker's attempts, steps at the engine's default effort, gets no attempt
    identity in its Bash environment, and is left out of the dashboard's worker
    counts. While it runs its task shows as `pending verdict`.
  - **It never edits.** While it runs, the `tool.call` hook refuses its Edit,
    Write, MultiEdit and NotebookEdit calls and any Bash command the
    `delegateOnly` lexer counts as a write, against its worktree and against the
    session root, with one line: `a reviewer never edits (T-4 review): Write
    refused. …`.
  - **At its hand-back** the mod reads the last well-formed `[[review]]` block.
    `refuted=0` is `next=accept` with `review: 3 confirmed, 1 unverifiable`.
    `refuted>0` is `next=resume agent=<the worker>` with the refuted rows quoted
    under the row and as the resume message (`autoEscalate` sends it; otherwise
    the brain does, and that message is the worker's next attempt, spent from
    `budget=`; with the budget spent the advice is `check by hand`). A missing or
    malformed block is `next=accept` with `review: no review block`: the review
    never blocks on its own failure. The reviewer's attempt keeps the counts
    (`review`, verdict `reviewed`), the row says `reviewed · haiku · $0.05`, and
    the ledger line carries `kind: review` and the counts.
  - The README has a Review section (what it checks, what it never does, the
    option, the reviewer's tier, cost) and the verdict table gains `next=review`.

- **Gates that run in parallel do not false-refute (MOD-20).** On 2026-10-11 two
  workers ran their gates on one machine at once (load average about 40): one
  engine run had six timeouts and passed on a rerun with no change, and another
  worker was refuted on gate because the verifier's engine run timed out on two
  tests it never touched. The engine suite gives each test 5 seconds, so any
  wave of two workers carried the risk. Three changes:
  - **A gate red only on timeouts in untouched tests is run once more.** When
    the gate's failing tests all failed with nothing but the engine's
    `timed out after N ms` and none of them sits in a test file the delta
    changed, the verifier runs that gate again. The claim then reads
    `gate green on rerun (first run: 2 timeouts in untouched tests)`; a second
    red is refuted as before, with a `note:` that it was run twice. A failure
    that is not a timeout, a timeout in a touched test file, and output the mod
    cannot read as failing tests are never run again. New `gateFailures` and
    `timeoutRerun` in `hooks/lib/verify-native.ts` parse the `(fail)` lines of
    `claude plugin test` and decide.
  - **Engine gates take turns.** A gate-map command that runs
    `claude plugin test` takes `delegation.engineGate` in the store before it
    runs and clears it after; a verifier that finds another's live lock waits
    for it (looking again every 5 seconds), and the wait is one verdict detail
    line, `waited 40 s for MOD-x's engine gate`. The lock expires after the
    gate's own timeout (9 minutes), so a crashed holder never wedges the rest;
    a store that cannot be read runs the gate without a turn. The read, check
    and write of the lock are one step inside the process (the store has no
    compare-and-set), so two verifiers finishing together do not both take it.
    The rerun stays inside the turn. A `repo=none` brief's engine gate takes its
    turn too. The settings.json fallback reruns but takes no turns.
  - **The `delegateOnly` lexer reads substitutions inside double quotes.** The
    brain's own merge command was refused because a comment string inside
    `$( … )` carried `<task>-a<attempt>`, and the lexer read the `>` as a
    redirect to a file in the repo. A `$( )` or backtick substitution inside
    double quotes is now a command of its own with its own quotes, so
    `gh issue close 2 --comment "$(printf "id <task>-a<n>")"` counts no write.
    A real redirect inside one still counts, quoted or not
    (`echo "$(echo x > hooks/a.ts)"` writes `hooks/a.ts`; before this it was
    missed when quoted).
  New `tests/gaterun.test.ts` (the parser, the rerun decision, the turn and the
  verifier with the gate answered from a table), the lexer cases in
  `tests/brain.test.ts` and engine tests in `tests/hooks.test.ts`, including two
  verifiers whose engine gates must not overlap. `tests/harness.ts` lets a
  `run` answer return a promise.

- **The debrief shows the agent's own process proposals, mod findings post to
  the mod's tracker from any repo, and a post refuses while the redact list is
  empty (MOD-18).** Does `/delegation debrief` cover the agent's process
  improvements, improvements to the mod, and posting to the public repo? It half
  did: the agent's proposals sat in a file nobody opened, and a finding could be
  filed only where the repo file set `issueRepo`.
  - When a debrief hands back, after the findings lines, the mod prints the
    agent's own proposals from the debrief JSON: `proposals: n for you to
    review (never posted)`, one `target · proposed_diff_summary` line per
    `proposed_harness_changes` entry (cut to one line), and a count of
    `harness_gaps` and `stale_memory`. None prints nothing.
    `/delegation debrief post` shows the same block under the findings. The
    proposals stay in the debrief file; they are never written to the
    `.findings.json` and never posted.
  - `issueRepo` defaults to the mod's own repository, read from the `repository`
    (else `homepage`) field of `.claude-plugin/plugin.json`, which now carries
    `repository`. A repo file that leaves the key out gets it, so a finding can
    be posted from any repo the mod runs in (the first adopter's repo set none,
    so nothing could be filed there). An explicit `"issueRepo": ""` in the repo
    file still turns posting off. `/delegation` prints `issues: <owner/name>
    (the mod's own tracker)` for the default. `init` and `setup` no longer
    write `"issueRepo": ""` into a new repo file, which would now switch posting
    off; they leave the key out and say so in a `_issueRepo` note. A repo file
    written by an earlier init that already carries `"issueRepo": ""` keeps
    posting off until you remove the line.
  - `/delegation debrief post <n|all>` refuses to file anything while the
    `redact` option in `/config` is empty, saying: set redact in /config to the
    product, customer, employer and repo names this session must never publish,
    then post again. The automatic scrub knows only the repo's folder name,
    origin and git identity, so a product name that differs from the folder name
    would otherwise reach a public issue. The read-only `post` still shows the
    drafts, headed by the same warning.
  - The README's debrief section names what each list is for (`mod_findings`:
    the tracker after your go; `host_findings`: never; the agent's proposals:
    you, never posted), the default `issueRepo` and the empty-redact refusal.

- **The verdict says what it checked: `verified` becomes `consistent`
  (MOD-19; public issue #1).** Two adopters reported it independently: when
  every claim held, the row said `verified` and `next=accept`, which reads as
  review, yet nothing reads the diff, and a worker that cleanly builds the wrong
  thing got the same row. The word is now `consistent`: the report is consistent
  with git. It means every machine-checkable claim of the report matches git
  (branch, sha, files, scope, gate, red evidence); it is not a review, and the
  brain still reads the diff. The README says so in a verdict table and one
  plain paragraph. What changed in what the mod writes:
  - the verdict row (`attempt 1/2 consistent · sonnet · $0.19 · next=accept`),
    the long line (`verdict=consistent`), the `(no repo)` form and the
    `consistent (report gate=fail)` form;
  - attempt records and ledger lines, the dashboard (the tile reads
    `consistent 1st try`, spend by model `4 consistent`, the Verdicts block and
    its text fallback), the compaction and prompt state sections, the debrief
    prompts and the template's classification rubric, and the settings-hook
    fallback's row (`bin/chassis-hook.mjs`);
  - the TypeScript verdict types gain `consistent`; `verified` stays only as a
    legacy input, in `hooks/lib/legacy.ts`.

  **Deprecated: `verified` is read until 0.9.0.** The row text is a contract
  adopters parse, so the old word stays readable for one minor version. An
  attempt record, a recent-verdict row or a metrics count saying `verified` is
  read exactly as `consistent`: escalation, owed rows and their retire check,
  accept, the spend and success counts, the dashboard (a pre-rename verdict
  line is shown with the new word). A ledger line already written keeps its word
  and is never rewritten. A script that parses the row, `verdict=` or
  `.delegation/ledger.jsonl` should accept both words until 0.9.0, when
  `hooks/lib/legacy.ts` goes. An honestly declared `gate=fail` is still never
  accepted. New `tests/consistent.test.ts` holds the new word and the legacy
  reads; `tests/node/consistent.node.mjs` fails on any `verified` in `hooks/` or
  `bin/` outside the legacy reader; `tests/hooks.test.ts` proves a store and a
  ledger written before the rename still retire an owed row and count as a
  success. The optional reviewer stage is the next card, written against the new
  word.

- **A settings.json fallback for hosts that do not load the mod (MOD-17, #2).**
  The mod is a function-hook plugin: where the engine's rollout switch serves
  off, or a host cannot load a hooks module, none of it runs. New
  `bin/chassis-hook.mjs` carries the two parts that are pure functions through
  ordinary `settings.json` command hooks, under any node that strips types by
  itself (22.18 or newer; nothing installed or fetched):
  - `post-agent` (PostToolUse on Agent) takes the last `[[report …]]` of the
    result, finds the brief (the path the prompt names, or an inline
    `[[brief …]]` header) and the worker's tree, runs the native verifier there
    and prints the verdict row as the hook's additional context. No report
    prints nothing. The row reads `via=settings-hook` where the engine's has an
    attempt count: nothing is recorded, a `repo=here` or `repo=none` brief is
    said to be engine-only, and the hand-back's `[[amend …]]` blocks are not
    applied.
  - `pre-bash` (PreToolUse on Bash) runs the git guard over the command,
    against the repo it runs in, and prints a deny with the guard's own reason.
  Every command the wrapper runs (read-only git, the repo's gate) passes
  `hooks/lib/allow.ts` with the repo file's gate map first; it never pushes,
  installs or fetches. The README gains "Without the engine: two settings.json
  hooks" with the two entries to paste and a plain list of what exists only
  with the engine; `tests/selfcheck.sh` prints the entries when it finds the
  rollout switch off. New `tests/node/bin.node.mjs` pipes hook input into the
  wrapper against real repositories under `tests/.tmp/`.

- **Each worker gets its own identity in its Bash environment (MOD-16; public
  issue #24).** Workers inherited the brain's session id, and a vendored lock
  script keys a hold on role plus session id, so two sibling workers on one
  shared environment could release each other's live hold. Since 0.7.0 the mod
  sees every worker's Bash calls, so its `tool.call` hook now runs a recorded
  worker's command behind `export CHASSIS_SESSION_ID=<task>-a<attempt>
  CHASSIS_TASK=<task> CHASSIS_ATTEMPT=<n>; ` (values shell-quoted; a subtask
  other than `main` reads `BE-101.ui-a1`). The brain's own Bash, ad hoc agents
  with no attempt record, the debrief and eval runners, and a command that
  already sets `CHASSIS_SESSION_ID` are never rewritten. The git guard,
  `delegateOnly` and the spend check judge the command as typed (the rewrite hook
  is registered after them), so no refusal text or decision changes. The
  identity is a pure function in the new `hooks/lib/identity.ts`; the brief
  template gains one line telling the worker its identity and that it is already
  set in every Bash call. No new option. The README's new "A worker's identity"
  says what is set, for whom, and why; a `briefExtra` line asking workers to
  prefix lock calls by hand is no longer needed.

- **Work keeps moving without the person (MOD-15).** Since 0.7.0 dispatch prints
  an Agent call the brain makes, so the queue and the respawn ladder are advice,
  and a verdict row reached the brain only inside the person's next message.
  Three changes close the gap:
  - **A verdict wakes the brain.** After the mod posts the row for a background
    worker's hand-back it calls `$.prompt.submit` once with that row and its next
    action (`next=accept`, a resume, the `ready:` line the hand-back freed, or the
    respawn spawn block), never `asUser`: the model reads "The chassis-delegation
    plugin sent a message" and acts, once the session is idle (the engine queues it
    while the person is mid-prompt). One submit per verdict; none for a verdict the
    brain produced itself with `--verify` in its own turn, none for a foreground
    worker's (it rides the Agent result); an over-spend verdict wakes it too. The
    new boolean `wakeOnVerdict` (default `true`) turns it off; the row is posted
    all the same. The mod's own submit is not counted as a correction.
  - **The brain is told to act.** While any row is `ready:` or a respawn block is
    pending, the "Delegation state" section carries one posture line: make a ready
    row's spawn call or a respawn block's Agent call without asking the person; ask
    only when a verdict is refuted on a claim the brain cannot amend, a worker is
    over-spend, or an amend needs approval.
  - **A ready worktree row left unclaimed is started.** New option
    `readyFallbackMinutes` (default 10; `0` is off): a `ready:` row the brain has
    not spawned after that long is started through `spawnSelf`, as every queued row
    was before MOD-12, with the same tier, budget and slot decision, and recorded
    with `source: fallback`. The row the mod posts says the worker ran outside the
    mod's hooks (no git guard, no effort setting, cost known only at the end). Only
    a worktree brief is started this way: a `repo=here` worker shares the person's
    checkout and `repo=none` has no worktree, so those always wait for the brain,
    and past the timeout their ready line says how long they have waited. A row the
    brain spawns first, or one still behind a full house, is left alone. The node
    test that pins `spawnSelf`'s callers now names the fallback (`selfSpawnReady`)
    as the third, and still fails on any other.
  The README's Spawn contract and Known issues are brought in line, with a
  "Waking the brain" paragraph and the two options; the manifest declares both.

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
