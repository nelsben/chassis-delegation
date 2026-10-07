---
id: GH-100
title: The repo root holds ten entries: types, templates, eval, the selfcheck script and the cards move under hooks, tests and docs
domain: mod
tier: standard
status: merged
scope: [hooks/**, tests/**, templates/**, types/**, eval/**, scripts/**, delegation/**, docs/**, .claude-plugin/plugin.json, .chassis-delegation.json, README.md, CHANGELOG.md, tsconfig.json]
forbid: [.claude-plugin/types/**, LICENSE, .gitignore]
red_test: tests/node/templates.node.mjs reads hooks/templates/brief.md and hooks/templates/debrief.md (red before the move, the files are not there), and a pure test in tests/init.test.ts or tests/repoconfig.test.ts that the default brief template path the mod names is hooks/templates/brief.md
gate: validate,node,test
budget: 2-attempts
---
## Why

GitHub shows the file list above the README, so a visitor scrolls past fifteen root entries before
the README and its image. Five of them exist only because features were laid out one at a time. They
fold into their owners with no change in behaviour.

## The moves (git mv, so history follows)

| From | To | What references it |
| --- | --- | --- |
| `types/index.d.ts` | `hooks/types/index.d.ts` | `.claude-plugin/plugin.json` `"types"`; `hooks/register.ts` `import … from '../types'` → `'./types'`; README's store section |
| `templates/brief.md`, `templates/debrief.md` | `hooks/templates/` | `hooks/register.ts` (`${$.plugin.root}/templates/brief.md`), `hooks/lib/cleanstop.ts` (debrief path and its doc comment), `hooks/lib/init.ts` (the `_briefTemplate` comment), README (three mentions), `tests/node/templates.node.mjs` |
| `eval/classifier-cases.jsonl` | `tests/eval/classifier-cases.jsonl` | nothing |
| `scripts/selfcheck.sh` | `tests/selfcheck.sh` | README (two mentions); fix any relative path inside the script |
| `delegation/tasks/*` | `docs/cards/*` | `.chassis-delegation.json`: `cardDir` becomes `docs/cards` and the `_cardDir` comment says why; README's install note about plugin repos; `hooks/lib/init.ts` `PLUGIN_CARD_DIR` becomes `docs/cards` (the folder init picks in a plugin repo) with its tests |

After the moves the root holds exactly: `.chassis-delegation.json`, `.claude-plugin`, `.gitignore`,
`CHANGELOG.md`, `LICENSE`, `README.md`, `docs`, `hooks`, `tests`, `tsconfig.json`. Remove the emptied
folders. `--replay` keeps reading `agents/tasks/` at the base commit (the allowlist's exact shapes are
not yours to change); say so in the README row if it is not already said.

## Done when

- `git ls-files` shows no path under `types/`, `templates/`, `eval/`, `scripts/` or `delegation/`.
- `claude plugin validate .` passes with no warnings (it holds the `$.state` keys to the contract at the
  new manifest path), the node suite and `claude plugin test .` are green in your worktree, and
  `claude plugin validate` still reports the same state reads and writes as before the move.
- The README reads right after the move: every path it names exists.
- CHANGELOG Unreleased entry (GH-100).
- Save your red output to `.delegation/GH-100/red-1.txt` and name it `red=` in your report. The gate map
  runs the three gates with {worktree}.
