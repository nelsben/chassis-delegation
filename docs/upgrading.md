# Upgrading

`/delegation update`, and what to do at each version. The detail of every change is in [CHANGELOG.md](../CHANGELOG.md).

## Upgrading

1. **Update.** Between turns, with no worker running, type `/delegation update`. It runs `git fetch origin main` then `git merge --ff-only origin/main` in the loaded folder (the `loaded from` line of `/delegation`), prints the CHANGELOG sections newer than yours, and adds any missing default key to `.chassis-delegation.json`. A dirty tree, a non-fast-forward or a folder that is not a clone refuses and changes nothing.
2. **By hand, if that fails.** Run `git -C <folder> pull --ff-only origin main`. On "unrelated histories" (a clone made before 2026-10-05), delete the folder and run `git clone https://github.com/nelsben/chassis-delegation.git <folder>`.
3. **Reload.** This applies at every version. A folder under `~/.claude/dev-mods` reloads when the turn ends; run the pull from inside that session. Any other folder (`--plugin-dir`, `CLAUDE_CODE_PLUGIN_DIRS`) needs the window reloaded (VS Code: Developer: Reload Window; terminal: restart `claude`).
4. **Check the version.** `/delegation` prints `mod: chassis-delegation <version> loaded from <folder>`. A `code: running X, folder holds Y` line means a reload is still owed. Then run `/delegation setup` in the repo: in a set-up repo it changes no file.
5. **Read your step** below for what to do.

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
Optional: `dashboardBand` turns the band off, `classifierSecondOpinion` the second opinion, `delegateOnly` guards the brain; `/dispatch <ID> --verify <sha>` re-judges an attempt.
Detail: [CHANGELOG 0.6.0](../CHANGELOG.md).

### From 0.4.0 to 0.5.0

What to do: give cards with a prose scope glob scopes, or pass `--scope <globs>`. A brief already written has no spend ceiling: delete `<root>/.delegation/briefs/<ID>.brief.md` before the next dispatch of a task not yet started.
Optional: set `spend:` on a card or `spendByTier` in the repo file (`0` = no ceiling). Run `/dispatch <ID> --verify <sha>` for finished work found in a worktree.
Detail: [CHANGELOG 0.5.0](../CHANGELOG.md).

### From 0.3.0 or earlier

What to do: clone again (step 2 above: the history changed), then read [CHANGELOG.md](../CHANGELOG.md) from your version up.
