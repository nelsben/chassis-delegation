---
id: GH-110
title: Setup's output reads right in VS Code and the desktop app: the first card in a code block, one set of next steps, a red_test line, and what it set in the config
domain: mod
tier: standard
status: merged
scope: [hooks/lib/setup.ts, hooks/lib/init.ts, hooks/register.ts, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/lib/allow.ts, hooks/lib/verify-native.ts, hooks/lib/scheduler.ts]
red_test: tests/setup.test.ts and the GH-109 engine test in tests/hooks.test.ts: the handover wraps the card in a ```markdown fence whose body starts with the card's opening --- line; the card carries a red_test: line; the setup output contains no "Next: write a card under" line and no "update is pending" line; it contains a line naming the gate it wrote; and when the scaffold leaves the tree dirty in worktree mode the next steps begin with committing it (red: none of these hold today)
gate: validate,node,test
budget: 2-attempts
---
## Why

First real run of `/delegation setup` (2026-10-08, a new Python repo, VS Code extension). Every required
check held and the config came out right (`gateMap.test` set from the detected unittest command), but the
output read badly where most people will see it:

- VS Code and the desktop app render command output as markdown. The first card was printed as plain text,
  so its frontmatter `---` lines became horizontal rules and its lines ran together into one paragraph:
  `id: OPS-1 title: REPLACE ME … domain: ops tier: standard …`. It could not be copied as a card.
- Init's own closing lines were printed inside setup's output: "Next: write a card under agents/tasks/
  (copy OPS-000-sample.md) …" and "If Claude Code says an update is pending, restart …", right above
  setup's own "First card: save this as …". Two different instructions, and a restart note that does not
  apply to a hot-loaded mod.
- The card skeleton has no `red_test:`. It dispatches, but the brief then says "Red test first:" with
  nothing after it and the red-evidence claim is skipped.
- The output never says that setup wrote `gateMap.test`, and the scaffold it wrote is left uncommitted with
  no word about it.

## Done when

- `handoverText` prints the card inside a fenced block (three backticks and `markdown`), so it renders
  verbatim and copies whole. The surrounding lines stay plain text.
- `runSetup` prints init's file lines but not init's "Next:" line or the restart note (add a parameter to
  `initText`, or have setup build its own lines from the plan; `/delegation init` keeps its current text).
- The first-card skeleton gains `red_test: REPLACE ME: the test that fails now and passes after, e.g.
  <stack example>`, the example taken from the detected gate (`python3 -m unittest tests.test_x`,
  `npm test -- x.test.js`, `pytest tests/test_x.py`, `cargo test x`, `go test ./... -run X`).
- After writing a fresh config, setup prints one line per key it set, e.g.
  `config: gateMap.test = python3 -m unittest discover -s tests`, plus `baseRef` and `cardDir` when set.
- When the scaffold leaves the tree dirty in worktree mode, the next steps start with
  `Commit the scaffold and the card (git add -A && git commit -m "chassis-delegation setup"), then …`;
  in repo=here mode they start with committing the card before dispatching (the card folder is otherwise in
  the worker's delta).
- README Setup section and CHANGELOG (GH-110). Save red output to `.delegation/GH-110/red-1.txt`, name it
  `red=`. The gate map runs the three gates.
