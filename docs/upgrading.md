# Upgrading

`/delegation update`, and what to do at each version. The detail of every change is in [CHANGELOG.md](../CHANGELOG.md).

## Upgrading

1. **Update.** Between turns, with no worker running, type `/delegation update`. It runs `git fetch origin main` then `git merge --ff-only origin/main` in the loaded folder (the `loaded from` line of `/delegation`), prints the CHANGELOG sections newer than yours, and adds any missing default key to `.chassis-delegation.json`. A dirty tree, a non-fast-forward or a folder that is not a clone refuses and changes nothing.
2. **By hand, if that fails.** Run `git -C <folder> pull --ff-only origin main`. On "unrelated histories" (a clone made before 2026-10-05), delete the folder and run `git clone https://github.com/nelsben/chassis-delegation.git <folder>`.
3. **Reload.** This applies at every version. A folder under `~/.claude/dev-mods` reloads when the turn ends; run the pull from inside that session. Any other folder (`--plugin-dir`, `CLAUDE_CODE_PLUGIN_DIRS`) needs the window reloaded (VS Code: Developer: Reload Window; terminal: restart `claude`).
4. **Check the version.** `/delegation` prints `mod: chassis-delegation <version> loaded from <folder>`. A `code: running X, folder holds Y` line means a reload is still owed. Then run `/delegation setup` in the repo: in a set-up repo it changes no file.
5. **Read your step** below for what to do.

### From 0.9.40 to 0.9.41

Nothing needs doing to upgrade. The first session start after it slims the stored spawn records (posted verdict text older than a day is dropped) and cuts old `merge-gates.txt` files to their tails, once.
Added: the `loadThrottle` option (off by default: on a loaded machine, half the worker slots, at least 1).
Changed: a smaller store and merge-gates.txt, merge skipping gates already green on the same tree, a worker's own engine-suite run taking the engine lock, fewer git, sleep and store calls, cached config, card, ledger and live-model reads, and a shorter brief.
Fixed: an Agent spawn that only names a closed task's brief runs ad hoc instead of counting as an attempt.
Detail: [CHANGELOG 0.9.41](../CHANGELOG.md).

### From 0.9.39 to 0.9.40

Nothing needs doing to upgrade, except that `gateTimeoutMinutes` now defaults to 30 and takes 1 to 120: a value already set in a repo file or in /config is kept.
Added: busy-machine words on a red or timed-out gate and at dispatch; the `[[pause v=1 …]]` line a worker prints instead of a report while its own background job runs.
Changed: the verifier's gate runs with no 10-minute host cap, up to `gateTimeoutMinutes`.
Fixed: merge takes a review that accepts; a review read after compaction; the polling row ignores heredocs and quoted text; a scope/forbid clash refuses the card.
Detail: [CHANGELOG 0.9.40](../CHANGELOG.md).

### From 0.9.38 to 0.9.39

Nothing needs doing to upgrade.
Fixed: tree import reuses a recorded issue that is closed (with or without `close`); the queue position for a lane held by the total `maxWorkers` cap; `/delegation config` shows the repo file's `project` (including `none`) as the value in effect.
Detail: [CHANGELOG 0.9.39](../CHANGELOG.md).

### From 0.9.37 to 0.9.38

Nothing needs doing to upgrade. A scope refute now charges only the paths the worker wrote.
Added: land_plan `parent` and pathless feature, epic and story items with zero tasks; `land --closed` and land_plan `close`; `/delegation tree import` with the `treeImportBatch` option; the repo-level `project` (including `none`) with `project: false` and `--no-project`; `issue:` and `parent:` accepting `#12` and an issue URL, with the `parked` status.
Fixed: scope charged only for the worker's writes, and `.delegation/**` out of every delta; redaction leaves dotfolder segments and the target repo name alone; the dispatch wording (no outside-scope warning for red_test paths, queue position for a tier-capped lane, `gate reused (recorded pass, not re-run)` in the verdict row).
Detail: [CHANGELOG 0.9.38](../CHANGELOG.md).

### From 0.9.36 to 0.9.37

Land now shows the issue first and files only on confirm by default; `/delegation config landAuto on` restores filing at once.
Fixed: land_plan retry keyed to the plan, land_plan preview runs no gh, land confirm reuses its preview and resumes, gh repo clone and view are reads, the land nudge stays quiet on dispatch/verdict/merge turns, a malformed report is matched to its task and named malformed instead of fabrication.
Changed: `landAuto` now defaults to off.
Documentation: `Fields the GitHub sync reads` in docs/contracts.md.
Detail: [CHANGELOG 0.9.37](../CHANGELOG.md).

### From 0.9.35 to 0.9.36

Land still files at once by default; `/delegation config landAuto off` makes it show the issue first and file only on confirm.
Fixed: the gh guard reads the verb past `-R`/`--repo`, land titles redacted, bodies list only overlapping cards, land_plan retry matches by open issue, status comments not re-posted after a reload.
Added: `landAuto`, the option that holds a land until the person says yes.
Detail: [CHANGELOG 0.9.36](../CHANGELOG.md).

### From 0.9.34 to 0.9.35

Merge `--finish` now closes the task's issue itself (and the parent when it is the last open task), and dispatch and the verdict comment on the card's issue.
Added: status comments, finish closes, `land --supersedes`, the land nudge and its `landNudge` option.
See the guide's Planning on GitHub section.
Detail: [CHANGELOG 0.9.35](../CHANGELOG.md).

### From 0.9.33 to 0.9.34

`/delegation land` now files the issue itself (use `--dry-run` for the old print-only behaviour), and workers can no longer run gh writes.
Added: the `land` tool and filing, the `project` option, `land_plan`, `tree`, the parent close line at finish, `scopeAmends` within-parent, the gh guard, and the `land_plan` resume.
See the guide's Planning on GitHub section.
Detail: [CHANGELOG 0.9.34](../CHANGELOG.md).

### From 0.9.32 to 0.9.33

Nothing changes for a card that names no issue or parent.
Added: the card tool takes `issue`, `parent`, `parentScope` and `parentForbid`; a card with `issue:` gets `Refs #n` in its PR body and a printed `gh issue close` line at finish; `/delegation land` writes an issue body under `.delegation/landed/` without starting work.
See the guide's Planning on GitHub section.
Detail: [CHANGELOG 0.9.33](../CHANGELOG.md).

### From 0.9.31 to 0.9.32

Nothing changes for a repo that never uses `repo=none` cards. A research card dispatched before the update still verifies.
Fixed: a `repo=none` card's outside listing is kept in a file under `.delegation/outside/`, not in the store, so research cards in flight no longer fill the store's cap. The outside check also ignores the mod's and the lead's own writes in the session checkout.
Detail: [CHANGELOG 0.9.32](../CHANGELOG.md).

### From 0.9.30 to 0.9.31

Nothing to do.
Added: an engine test pins what fires when a `SendMessage` resume arrives, and the internals page states it.
Changed: a `tool.call` hook on `SendMessage` counts a resume once, whichever events the host fires.
Detail: [CHANGELOG 0.9.31](../CHANGELOG.md).

### From 0.9.29 to 0.9.30

Nothing to do, unless a repo wants the new `scopeAmends` option.
Added: `scopeAmends` decides whether a worker's `scope+=` amend applies on its word. The default, `apply`, keeps today's behaviour, so nothing changes on update unless a repo sets `new-files` or `ask`.
Changed: `/delegation merge` prints each amend the card carried, and the README and docs/alignment.md map the mod onto Anthropic's guidance.
Fixed: a budget raised on the card now reaches its rewritten brief, and the README's front-door section fits its limit again.
Detail: [CHANGELOG 0.9.30](../CHANGELOG.md).

### From 0.9.28 to 0.9.29

Changed: `review` now defaults to `on-frontier` and `delegateOnly` to `warn`, so frontier and premium cards get a fresh-context review and the brain guard shows one warning per turn. To turn either off, write `"review": "off"` or `"delegateOnly": "off"` in `.chassis-delegation.json`.
Changed: the README's Why section cites Anthropic's delegation guidance and corrects three stale figures.
Fixed: the price table matches the live pricing page (Sonnet 5 at $2/$10; Sonnet 5.5 cache reads at $0.10 per million tokens).
Fixed: with `lanes`, a lane's own `doneWhen` is added to the shared one instead of replacing it.
Fixed: a `repo=none` hand-back's gate runs in the checkout the worker ran in, not the output folder.
Detail: [CHANGELOG 0.9.29](../CHANGELOG.md).

### From 0.9.27 to 0.9.28

Nothing to do.
Changed: while the verifier judges a hand-back the worker's worktree is locked, so `git worktree remove --force` refuses it; land after the verdict (`git worktree unlock <path>` frees one left behind).
Optional: a repo can set `gateTimeoutMinutes` (whole minutes; 1 to 120, default 30 since MOD-229) for a long gate.
Detail: [CHANGELOG 0.9.28](../CHANGELOG.md).

### From 0.9.26 to 0.9.27

Nothing to do.
Changed: `/delegation merge --finish` stops when the worktree holds untracked or ignored files the merge does not carry; copy what you need, or pass `--discard`. Dispatch now rewrites a brief the card or `--scope`/`--forbid` changed, so a stale brief no longer needs deleting by hand.
Optional: a card can name a `merge_check:` command (or a repo `mergeCheckMap` entry per gate id) that merge runs before it rebases.
Detail: [CHANGELOG 0.9.27](../CHANGELOG.md).

### From 0.9.25 to 0.9.26

Nothing to do.
Optional: the clean-stop debrief now defaults to `debriefMode notes` (a one-line prompt to write a review note, then `/delegation debrief ingest <note.md>`); `/delegation config debriefMode transcript` keeps the background transcript pass.
Detail: [CHANGELOG 0.9.26](../CHANGELOG.md).

### From 0.9.24 to 0.9.25

Nothing to do.
Optional: the ration bar now sits in the band above the prompt whenever the window has a reading; `/delegation config ration off` hides it, `dashboardBand on` adds the worker line under it.
Detail: [CHANGELOG 0.9.25](../CHANGELOG.md).

### From 0.9.23 to 0.9.24

Nothing to do.
Optional: `maxWorkersByTier` caps each tier under the `maxWorkers` total, e.g. `{"frontier": 2}` with `maxWorkers` 6 runs up to six workers of which at most two are frontier; unset, nothing changes.
Detail: [CHANGELOG 0.9.24](../CHANGELOG.md).

### From 0.9.22 to 0.9.23

Nothing to do.
Optional: the footer meter reads the seven-day window by default; `/delegation config ration off` hides it, `ration five_hour` reads the five-hour window, `rationDaily <points>` fixes the daily share. The status line above the prompt is gone and the band is off; `/delegation config dashboardBand on` brings the band back.
Detail: [CHANGELOG 0.9.23](../CHANGELOG.md).

### From 0.9.21 to 0.9.22

Nothing to do.
Detail: [CHANGELOG 0.9.22](../CHANGELOG.md).

### From 0.9.20 to 0.9.21

Nothing to do.
Optional: rules a worker needs but the repo must not hold go in a gitignored file named by `briefLocal`; a card's `allow: [id]` pulls that file's `### allow: <id>` block in as an exception, shown on the verdict row.
Detail: [CHANGELOG 0.9.21](../CHANGELOG.md).

### From 0.9.19 to 0.9.20

Nothing to do, unless two repos on this machine reuse card ids: the store splits per-task keys by repo on the first session start; check that `/delegation` shows attempt 1/N on a fresh card.
Optional: the effort nudge now reads your card folder by default, so an `effortNudge.cards` set only to match `cardDir` can go.
Optional: `gateMap._empty` names a gate id to run when a hand-back changes no files.
Detail: [CHANGELOG 0.9.20](../CHANGELOG.md).

### From 0.9.18 to 0.9.19

Nothing to do.
Optional: the effort nudge reads `cards/**` by default; if your cards live elsewhere (the default `cardDir` is `agents/tasks`), set `effortNudge` in `.chassis-delegation.json`, e.g. `{"effortNudge": {"cards": "agents/tasks/**"}}`; `"cards": ""` turns it off.
Detail: [CHANGELOG 0.9.19](../CHANGELOG.md).

### From 0.9.17 to 0.9.18

Nothing to do.
Optional: chart your own ledgers with `node bin/evidence.mjs <ledger.jsonl>... > summary.json`, then `node bin/evidence-charts.mjs summary.json <outdir>`.
Detail: [CHANGELOG 0.9.18](../CHANGELOG.md).

### From 0.9.16 to 0.9.17

Nothing to do.
Use `/dispatch <ID> --verify <sha>` for a gate that hit the verifier's time limit, and `/delegation accept <ids>` or `--owed` for owed rows.
Optional: set `waitStallMin` (default 20, 0 = off).
Detail: [CHANGELOG 0.9.17](../CHANGELOG.md).

### From 0.9.15 to 0.9.16

What to do: if the debrief stops, run `/delegation debrief` by hand.
Detail: [CHANGELOG 0.9.16](../CHANGELOG.md).

### From 0.9.14 to 0.9.15

Nothing to do.
Detail: [CHANGELOG 0.9.15](../CHANGELOG.md).

### From 0.9.13 to 0.9.14

What to do: for an outside scope root, forbid the narrowest folder that matters.
Detail: [CHANGELOG 0.9.14](../CHANGELOG.md).

### From 0.9.12 to 0.9.13

What to do: move any bookmark to an old README anchor to the docs page of the same heading.
Detail: [CHANGELOG 0.9.13](../CHANGELOG.md).

### From 0.9.11 to 0.9.12

Nothing to do.
Detail: [CHANGELOG 0.9.12](../CHANGELOG.md).

### From 0.9.10 to 0.9.11

What to do: `/delegation config modelGlyphs off` turns the glyphs off; `alias=glyph` pairs such as `sonnet=🟦` change them.
Detail: [CHANGELOG 0.9.11](../CHANGELOG.md).

### From 0.9.9 to 0.9.10

What to do: merge a consistent card with `/delegation merge <ID>`, then run the printed block and `/delegation merge <ID> --finish`.
Detail: [CHANGELOG 0.9.10](../CHANGELOG.md), [Merging a card](review-and-merge.md#merging-a-card).

### From 0.9.8 to 0.9.9

What to do: to set a personal option on the VS Code extension, run `/delegation config <field> <value>`; `modelGlyphs` changes the glyphs.
Detail: [CHANGELOG 0.9.9](../CHANGELOG.md).

### From 0.9.7 to 0.9.8

Nothing to do.
Detail: [CHANGELOG 0.9.8](../CHANGELOG.md).

### From 0.9.6 to 0.9.7

Nothing to do.
Detail: [CHANGELOG 0.9.7](../CHANGELOG.md).

### From 0.9.5 to 0.9.6

What to do: set options with `/delegation config <field> <value>`.
Detail: [CHANGELOG 0.9.6](../CHANGELOG.md).

### From 0.9.4 to 0.9.5

What to do: to keep the old wakes, run `/delegation config wakeOnVerdict true` (or the `/config` menu in a terminal).
Detail: [CHANGELOG 0.9.5](../CHANGELOG.md).

### From 0.9.3 to 0.9.4

Nothing to do.
Detail: [CHANGELOG 0.9.4](../CHANGELOG.md).

### From 0.9.2 to 0.9.3

Nothing to do.
Detail: [CHANGELOG 0.9.3](../CHANGELOG.md).

### From 0.9.1 to 0.9.2

What to do: nothing is required; run `/delegation config freshSessionTokens 0` (or the `/config` menu in a terminal) to turn the fresh-session row off.
Detail: [CHANGELOG 0.9.2](../CHANGELOG.md).

### From 0.9.0 to 0.9.1

What to do: nothing is required; run `/delegation config driveWarn false` (or the `/config` menu in a terminal) to silence the warn row (`driveWarnTokens` sets its threshold).
Detail: [CHANGELOG 0.9.1](../CHANGELOG.md).

### From 0.8.3 to 0.9.0

What to do: to delegate into another local repo, run `setup` with its absolute path first when it has no `.chassis-delegation.json`.
Detail: [CHANGELOG 0.9.0](../CHANGELOG.md).

### From 0.8.2 to 0.8.3

Nothing to do.
Detail: [CHANGELOG 0.8.3](../CHANGELOG.md).

### From 0.8.1 to 0.8.2

What to do: run `/delegation config redact <words>` (or the `/config` menu in a terminal) before any session posts, and set `postFindings` to `auto` only after that.
Detail: [CHANGELOG 0.8.2](../CHANGELOG.md).

### From 0.8.0 to 0.8.1

What to do: reload the window after `/delegation update`; `/delegation` says so itself when the folder is ahead of the code running.
Detail: [CHANGELOG 0.8.1](../CHANGELOG.md).

### From 0.7.0 to 0.8.0

What to do: a script that parses an old row should accept both `verified` and `consistent`. Optional: set `"review": "on"` in the repo file (`/config` wins) for a reviewer; `readyFallbackMinutes` turns the fallback off.
Before posting any debrief finding, run `/delegation config redact <words>` or `post` refuses. Set `issueRepo` only to post elsewhere than the mod's tracker; remove `"issueRepo": ""` from the repo file to allow posting.
Nothing else in `.chassis-delegation.json` has to change. See [Review](review-and-merge.md#review) and [Research cards](contracts.md#research-cards).
Detail: [CHANGELOG 0.8.0](../CHANGELOG.md).

### From 0.6.1 to 0.7.0

What to do: make the Agent call that `/dispatch` prints (verbatim `subagent_type`, `model`, `prompt`); `/dispatch <id>` prints it again. Optionally set `effortByTier`.
Nothing else in `.chassis-delegation.json` has to change.
Detail: [CHANGELOG 0.7.0](../CHANGELOG.md).

### From 0.6.0 to 0.6.1

What to do: optionally set `issueRepo` (`owner/name`) to post debrief findings; it is off until set. Nothing else in `.chassis-delegation.json` has to change.
Detail: [CHANGELOG 0.6.1](../CHANGELOG.md).

### From 0.5.0 to 0.6.0

What to do: a session on 0.5.0 has no `/delegation update`: follow the by-hand steps above once. Nothing in `.chassis-delegation.json` has to change.
Optional: `dashboardBand` turns the band on (off by default since 0.9.23), `classifierSecondOpinion` the second opinion, `delegateOnly` guards the brain; `/dispatch <ID> --verify <sha>` re-judges an attempt.
Detail: [CHANGELOG 0.6.0](../CHANGELOG.md).

### From 0.4.0 to 0.5.0

What to do: give cards with a prose scope glob scopes, or pass `--scope <globs>`. A brief already written has no spend ceiling: delete `<root>/.delegation/briefs/<ID>.brief.md` before the next dispatch of a task not yet started.
Optional: set `spend:` on a card or `spendByTier` in the repo file (`0` = no ceiling). Run `/dispatch <ID> --verify <sha>` for finished work found in a worktree.
Detail: [CHANGELOG 0.5.0](../CHANGELOG.md).

### From 0.3.0 or earlier

What to do: clone again (step 2 above: the history changed), then read [CHANGELOG.md](../CHANGELOG.md) from your version up.
