---
id: GH-21
title: The README tells a stranger how to install, restart, and run init, which commands exist, and what shadows them
domain: mod
tier: standard
status: merged
scope: [README.md, CHANGELOG.md, hooks/lib/init.ts, hooks/register.ts, tests/**]
forbid: [.claude-plugin/**, .chassis-delegation.json, agents/**, hooks/lib/verify-native.ts, hooks/lib/handback.ts]
red_test: a pure test in tests/init.test.ts asserting initText() ends with the restart note when a pending-update flag is passed (red because the parameter does not exist yet)
gate: node
budget: 2-attempts
---
## Why

Report GH-21, from a second adopter. They
cloned the repo and typed `/delegation` in a running Claude Code session. Claude Code answered with its
own "no command with that name" fallback, the main model then created a user skill named `delegation`
that would have shadowed the mod's command, and after install plus restart `init` printed its summary
alongside an engine note that an update was pending, so they did not know whether to restart again.

## Done when

- README.md's "Install on a new machine" section is the first thing after the one-paragraph intro and
  reads as numbered steps for a stranger: clone; load the plugin (`claude --plugin-dir <folder>` for one
  session, `CLAUDE_CODE_PLUGIN_DIRS` for every process, settings.json `env` for the desktop app); START
  OR RESTART the Claude Code session, because a running session does not see a plugin added after it
  started; then `/delegation init` in the repo you work on. Keep the existing facts; fix the order and
  say the restart out loud.
- A short "Commands and tools" table right after it: `/delegation` (state), `/delegation init`,
  `/dispatch <ID> [--dry-run|--scope|--forbid|--replay|--base]`, the model-callable tools
  `mcp__chassis-delegation__dispatch` and `mcp__chassis-delegation__init`, and which of these the
  model may call on its own (the two tools) versus which the person types (the slash commands; the
  model can also run `/dispatch` through the tool).
- One sentence in that section: a user skill or command named `delegation` or `dispatch` under
  `~/.claude/skills` or `~/.claude/commands` shadows the mod's commands; remove it.
- `init`'s closing text (`initText` in hooks/lib/init.ts) ends with one line: "If Claude Code says an
  update is pending, restart the session once before dispatching; init itself needs no re-run." Pure
  function, pure test in tests/init.test.ts; the engine test in tests/hooks.test.ts that checks init's
  output keeps passing.
- CHANGELOG.md gets an Unreleased entry naming GH-21.
- The red test goes red then green; `claude plugin validate .`, the node suite and `claude plugin test .`
  are green in your worktree (quote their last lines in your hand-back; only `node` is in the gate map).
