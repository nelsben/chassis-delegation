---
id: GH-111
title: Say the task, get the dry run: a card tool the brain calls from a sentence, which writes the card, shows the brief and dispatches on "go"; setup ends by asking for the first task instead of printing a file to edit
domain: mod
tier: standard
status: merged
scope: [hooks/lib/card.ts, hooks/lib/setup.ts, hooks/lib/init.ts, hooks/lib/dispatch.ts, hooks/lib/repoconfig.ts, hooks/register.ts, hooks/types/**, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/types/**, .chassis-delegation.json, docs/**, hooks/lib/allow.ts, hooks/lib/verify-native.ts, hooks/lib/scheduler.ts, hooks/lib/gitguard.ts]
red_test: pure tests in a new tests/card.test.ts for cardFromFields() (the next free id per prefix, the slug from the title, scope given as prose refused with the fix, a gate id missing from gateMap refused naming the ids that exist, red_test required unless "none") and an engine test in tests/hooks.test.ts where a call to the card tool writes agents/tasks/OPS-1-<slug>.md, returns the dry-run brief header and the one-line summary, and spawns nothing; the same with dispatch:true spawns once; and /delegation setup's green output ends with the first-task prompt and carries no "First card: save this as" line (red: no card tool exists)
gate: validate,node,test
budget: 2-attempts
spend: 10
---
## Why

Ben, 2026-10-08, after the first real `/delegation setup` on a new repo: "I don't love this setup experience,
I don't understand why we are saving the test card … I'd like it to feel a little more automatic than
manually editing files." Setup ends by printing a card skeleton full of REPLACE ME lines to save and edit
by hand, init also drops a sample card in the folder, and only then can the person dry-run and dispatch.
In Claude Code the person talks to Claude: the first task should be a sentence they say, and Claude (the
brain, which can read the repo) should turn it into the card.

## What to build

**1. A model-callable tool `card`** (`mcp__chassis-delegation__card`), one function `runCard`, pure logic in a
new `hooks/lib/card.ts`. Input (JSON schema, `additionalProperties: false`):
- `title` (required): one line that says what done looks like;
- `why` (required): two or three sentences;
- `doneWhen` (required): array of checkable statements;
- `scope` (required): array of globs; `forbid`: array of globs (default `[]`);
- `redTest` (required): the command or test that fails now and passes after, or `none` for docs-only work;
- `tier` (default `standard`), `domain` (default the first configured domain), `gate` (default the first
  gateMap id), `budget` (default `2`), `spend` (default the tier's `spendByTier`);
- `dispatch` (boolean, default false): dispatch right after writing.

The tool description tells the brain how to use it: "When the person describes work to delegate, look at
the repo to choose scope globs, then call this with the task. It writes the card, runs the dry run and
returns the brief; show the person the summary and dispatch when they say go (call dispatch, or call this
with dispatch: true when they already said to go ahead). Never ask the person to edit a card file."

`runCard`:
- validates: every `scope`/`forbid` entry is a glob or path, not prose (reuse `scopeLooksProse`; refuse with
  "scope must be globs, e.g. game_decompiler/**, tests/test_rom.py"); `tier` via `tierOf`; `gate` ids exist
  in the effective `gateMap` (refuse naming the ids that do); `redTest` non-empty; `domain` in the configured
  domains. A refusal writes nothing and says exactly what to change.
- assigns the id: the domain's prefix (frontend FE, backend BE, ops OPS, else the domain's first three
  letters upper-cased) and the next free number among the cards in `cardDir` (`OPS-1`, `OPS-2` …); the file
  is `<cardDir>/<ID>-<slug>.md`, slug from the title (lower case, words joined by `-`, at most 6 words).
  Never overwrites.
- writes the card in the format the README documents (frontmatter, then `## Why` and `## Done when`).
- runs the existing dry-run path for that id (the same code `/dispatch <ID> --dry-run` runs) and returns:
  `wrote <path>`, a one-line summary
  `OPS-1 · standard → sonnet · scope game_decompiler/**, tests/** · gate test · red: python3 -m unittest tests.test_rom · 2 attempts · $6 ceiling`,
  the brief header in a code block, and the closing line `Say go and Claude dispatches OPS-1.`
- with `dispatch: true`, dispatches instead of the dry run and returns the dispatch output.

**2. Setup ends by asking for the task.** In `hooks/lib/setup.ts`, the green handover becomes:
`Set up. Tell Claude your first task in a sentence, for example: "<a stack example>". Claude writes the card,
shows you the brief, and dispatches when you say go.` The stack example comes from the detected gate (Python:
"add a function that reads a file header and returns its size, with a unittest"; Node: "… with a node --test
test"; and so on). Remove the "First card: save this as" block and the commit-the-card step. When setup is run
through its tool (the brain), the result adds: `Ask the person for the first task, then call the card tool.`

**3. Less scaffold.** Setup no longer writes the sample card `OPS-000-sample.md` (plain `/delegation init`
still does). The card folder's README stays.

**4. No commit needed before a dispatch, in either mode.** Worktree mode already reads the card from the main
checkout, so an uncommitted card is fine; say nothing about committing. In repo=here mode, add the card
folder (`cardDir`) to the ignore set the mod always applies (beside `.delegation/**`), so a new card is never
in the worker's delta; remove the "commit the card first" advice from the README and from setup.

**5. Docs.** README: the Setup section and "Sixty seconds" describe the conversation (setup, say the task, see
the brief, say go), the commands table gains the card tool, and the card-format section says cards are
written by the card tool and may still be written by hand. CHANGELOG (GH-111).

Save red output to `.delegation/GH-111/red-1.txt`, name it `red=`. The gate map runs the three gates.
