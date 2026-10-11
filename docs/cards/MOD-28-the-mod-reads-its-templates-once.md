---
id: MOD-28
title: The mod reads its templates once at load, so a pull under a running session can never mix old code with new templates, and /delegation says when the folder on disk is newer than the code running
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/dispatch.ts, hooks/lib/update.ts, hooks/lib/review.ts, hooks/lib/cleanstop.ts, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/templates/**, hooks/lib/allow.ts, hooks/lib/verify-native.ts, hooks/lib/gitguard.ts, hooks/lib/brain.ts, hooks/lib/version.ts, hooks/lib/legacy.ts, bin/**]
red_test: engine tests in tests/hooks.test.ts: after register, changing the brief template file in the harness and dispatching renders the template as loaded, not the changed file; a template containing an unknown {{#mystery}} section makes dispatch refuse naming {{#mystery}} and write no worktree; with hooks/lib/version.ts on disk naming 9.9.9, /delegation prints the running-vs-folder line; pure test for the leftover-marker scan; red first
gate: validate, node, test
budget: 2-attempts
spend: 6
---
## Why

Found on 2026-10-11 in this repo: every brief written after MOD-22 merged (MOD-23 to MOD-27) carried about twenty raw {{#none}}, {{#repo}} and {{/repo}} markers. MOD-22 added those sections to hooks/templates/brief.md and taught renderSections to drop them, but the session that dispatched those cards was still running the code it loaded hours earlier, while dispatch reads the template from the folder on disk, which the brain had pulled to main. Old code, new template: the workers each guessed which sections applied. All five guessed right, but a repo=none worker reading worktree instructions, or the reverse, is one guess away. The same skew hits any session whose folder is pulled without a reload (a CLAUDE_CODE_PLUGIN_DIRS folder never hot-reloads), and /delegation update leaves a session in exactly that state until the window reloads.

## Done when

- every template the mod renders (brief.md, review.md, debrief.md, and any other file under hooks/templates/) is read once at register time and kept in memory with the code that renders it; dispatch, the reviewer spawn and the debrief use the loaded copy, never a fresh read of the folder; a template that fails to load is reported once at load and the feature that needs it says so when used
- after rendering a brief, the mod checks the result for any leftover {{ marker and, if one survives, refuses the dispatch naming the marker and the template (a brief with unrendered markers never reaches a worker)
- /delegation (status) reads hooks/lib/version.ts on disk (a read, not an import) and, when it names a version other than the running MOD_VERSION, prints `code: running <old>, folder holds <new> — reload the window to run it` (the hot-reload folder under ~/.claude/dev-mods says it reloads at turn end instead); /delegation update prints the same line after a merge that moved the version
- README (Upgrading: why a reload matters, what the line means) and CHANGELOG
