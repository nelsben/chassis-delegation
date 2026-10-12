---
id: MOD-66
title: /delegation config lists, shows and sets the mod's own options, so a screen where /config is taken or missing (the VS Code extension) can still change them
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/configcmd.ts, hooks/lib/findings.ts, hooks/lib/setup.ts, hooks/lib/init.ts, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/templates/**, bin/**, hooks/lib/verify.ts, hooks/lib/verify-native.ts, hooks/lib/allow.ts, hooks/lib/gitguard.ts]
red_test: a new engine test that `/delegation config wakeOnVerdict true` sets chassis-delegation.wakeOnVerdict to true fails on main, where the command answers with the usage line; red first
gate: validate, node, test
budget: 2-attempts
spend: 6
---
## Why

The mod tells the person to set its options "in /config", which is Claude Code's settings menu. In the VS Code extension /config is taken by another extension or not available, so the person has no way to change wakeOnVerdict, redact or any other option. The host gives a plugin $.config.list() and $.config.set({ key, value }) over the same rows, so the mod can offer its own command.

## Done when

- `/delegation config` lists every option of this mod: the rows of `$.config.list()` whose key is `chassis-delegation.<field>`, one line each, `<field> = <value>`. A row whose value equals its manifest default says `(default)`, and a locked row says `(locked)`. A last line says how to show or set one.
- `/delegation config <field>` shows that row: its value, its kind, its choices for a choice row, and its description.
- `/delegation config <field> <value>` sets it with `$.config.set({ key: 'chassis-delegation.<field>', value })`. The value is parsed by the row's kind: - boolean takes true/false/on/off/yes/no. - number takes a finite number. - choice takes one of its options. - text takes the rest of the line as typed, and `""` is the empty string. It answers `<field> set to <value>; the mod reloads with it`, or the deny reason `$.config.set` gave. A bad value or an unknown field says why, sets nothing, and points to `/delegation config`.
- The /delegation usage line and the command's argumentHint name `config [<field> [<value>]]`.
- Every user-facing text that tells the person to set an option in /config names `/delegation config <field> <value>` instead. That covers `REDACT_EMPTY` in hooks/lib/findings.ts, the autoDebrief advice in hooks/lib/setup.ts, the briefDir error and the `config:` status line in hooks/register.ts, and the scaffold comments in hooks/lib/init.ts. Code comments may stay as they are.
- Engine tests: - The list, with the default and locked marks. - Showing one row. - Setting a boolean, a number and a text row, seen through an inline plugin's `config.set` hook or a later `$.config.list()`. - A deny passed through. - An unknown field. - A bad boolean that sets nothing. - REDACT_EMPTY naming `/delegation config redact`.
- README.md documents `/delegation config` beside the other /delegation commands. Every instruction to the person to set an option in /config names `/delegation config <field> <value>`, and may add "or the /config menu in a terminal".
- CHANGELOG.md has an entry under a new `## Unreleased` heading above `## 0.9.5 — 2026-10-11`. The three gates pass.

## Review (attempt 1)

Attempt 1 met the card. Its verdict was refuted on the gate: the verifier's engine run went red while the machine was under heavy load, with tests timing out (the worker saw three timeout-only failures in one earlier run, one of them a new config test). The three gates passed when re-run by hand at 4d2e0bf, and `dispatch verify 4d2e0bf` re-judged attempt 1 consistent. The README's earlier "What to do" lines now name `/delegation config` too, which is right for anyone reading the current README.
