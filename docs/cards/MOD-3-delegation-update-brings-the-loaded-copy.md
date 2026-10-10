---
id: MOD-3
title: /delegation update brings the loaded copy of the mod to origin/main, migrates the repo config, says whether the session reloaded or needs a restart and prints what the brain will see; /delegation says when an update is available
domain: mod
tier: standard
status: merged
scope: [hooks/lib/update.ts, hooks/lib/allow.ts, hooks/lib/repoconfig.ts, hooks/lib/setup.ts, hooks/register.ts, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/lib/verify-native.ts, hooks/lib/gitguard.ts, hooks/lib/card.ts, hooks/lib/scheduler.ts, hooks/lib/dispatch.ts, hooks/lib/attempts.ts, hooks/lib/brief.ts, hooks/lib/live.ts, hooks/lib/pane.tsx, hooks/lib/band.tsx, hooks/lib/version.ts]
red_test: pure tests in tests/update.test.ts: classifying a clone under ~/.claude/dev-mods/<id>/chassis-delegation says reloads at turn end, a clone elsewhere says restart (or engine reload), a non-clone says replace with the clone command; the CHANGELOG slice of a fixture between 0.4.0 and 0.5.0 is exactly its 0.5.0 section capped at 40 lines; migrating a fixture config that lacks delegateOnly adds _delegateOnly and delegateOnly: "off" and leaves every other byte; allow tests in the existing allow suite: git -C <root> merge --ff-only origin/main is allowed only for the loaded root and the four refused forms stay refused; engine test in tests/hooks.test.ts: /delegation update in the harness with a clone root behind origin/main runs fetch then merge --ff-only, prints the update line and the changelog slice, and /delegation afterwards has no update: line; red first
gate: validate, node, test
budget: 2-attempts
spend: 12
---
## Why

The founder iterates on the mod several times a day across five or more sessions, and today every upgrade is five README steps done by hand inside each session. The folder a session loads from is easy to get wrong: this session loads the clone named by CLAUDE_CODE_PLUGIN_DIRS, which sat at 7e2020e while the brain refreshed its ~/.claude/dev-mods copy for two days, so nothing it merged was running. One command per session must do the whole upgrade and say exactly what it did and what is left (a restart, a setup). Posture: never automatic, only on the command; fast-forward only, from origin main, scoped to the loaded folder; the allowlist grows by exactly one form.

## Done when

- /delegation update classifies $.plugin.root and says which it found: a git clone with an origin (it updates it); a folder under ~/.claude/dev-mods that is not a clone, or any plain folder (it changes nothing and prints the clone command that replaces it, with the folder's own path)
- for a clone: git -C <root> fetch origin main, then git -C <root> merge --ff-only origin/main; a dirty tree or a non-fast-forward refuses with git's reason and changes nothing; the allowlist (hooks/lib/allow.ts) gains exactly one new form, git -C <dir> merge --ff-only origin/main with <dir> equal to the loaded plugin root, and the allow tests show merge on any other dir, merge without --ff-only, merge of any other ref, and pull all still refused
- after the merge the output prints update: <old version> (<old sha>) → <new version> (<new sha>), n commits, then the CHANGELOG sections newer than the old version, capped at 40 lines with a pointer to the README's From <old> to <new> section when one exists, so the brain learns what changed without opening the README; nothing to pull prints up to date at <version> (<sha>)
- repo config migration: every REPO_KEYS key that has a built-in default and is missing from .chassis-delegation.json is added with that default and a _<key> note; present keys, notes, key order and formatting stay byte-identical; the output names the keys added; a repo with no config file is told to run /delegation setup
- reload: a root under ~/.claude/dev-mods reloads when the turn ends and the output says so; for any other root, when the engine's plugin API exposes a reload for the loaded plugin the command calls it and says so, otherwise the last line says the window must be reloaded (in the VS Code extension: Developer: Reload Window; in a terminal: restart claude), that the session can be reopened with its transcript, and names the env var or flag that points at the folder (CLAUDE_CODE_PLUGIN_DIRS or --plugin-dir); the engine exposes no reload for a loaded plugin today and the VS Code extension registers no reload command, so the command never claims to have reloaded a folder outside ~/.claude/dev-mods; the classification root → { kind, reloadStory } is a pure function in a new hooks/lib/update.ts
- /delegation (status) adds update: n commits behind origin/main · run /delegation update when the loaded clone is behind, fetching at most once per 10 minutes (cached in $.state); silent when current; a failed fetch is one line, never an error
- the command refuses while a worker is running and names it; README's Upgrading section leads with the command and keeps the hand steps as the fallback
