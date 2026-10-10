---
id: GH-113
title: The brain's own spend is priced and shown apart from the workers', Fable is priced, and a delegate-only mode keeps a frontier brain from doing worker work itself
domain: mod
tier: standard
status: merged
scope: [hooks/lib/cost.ts, hooks/lib/live.ts, hooks/lib/brain.ts, hooks/lib/repoconfig.ts, hooks/lib/dashboard.ts, hooks/lib/pane.tsx, hooks/lib/band.tsx, hooks/register.ts, hooks/types/**, .claude-plugin/plugin.json, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/types/**, .chassis-delegation.json, docs/**, hooks/lib/allow.ts, hooks/lib/verify-native.ts, hooks/lib/gitguard.ts, hooks/lib/card.ts, hooks/lib/setup.ts]
red_test: pure tests in a new tests/brain.ts-backed tests/brain.test.ts (brainTurn accumulation by model from a main-loop turn.complete usage, priceFor('claude-fable-5-1') = 10/50, the delegate-only decision table) and engine tests in tests/hooks.test.ts: a main-loop turn.complete with usage on claude-fable-5-1 adds to the brain's spend and /delegation prints "brain (fable) $x · workers $y"; with delegateOnly on and the session model fable, an Edit of a source file on the main loop is denied naming the card tool, an Edit under the card folder is allowed, and a worker's tool.call is untouched; red first
gate: validate,node,test
budget: 2-attempts
spend: 12
---
## Why

Ben, 2026-10-10: he wants Fable sitting at the top of every chat session, with certainty that Fable is not
taking on work itself and is delegating to the right subagent tier, so he never has to switch the brain
between Fable and Opus by hand to control spend. Today the mod prices workers (GH-106) but never the brain:
the session total includes the brain's turns, and nothing says how much of the bill was the brain reading
files, editing and running tests itself. Fable 5.1 is not in the price table at all.

## What to build

**1. Price Fable.** `hooks/lib/cost.ts` gains `fable-5-1` and `fable-5` at $10 / $50 per million tokens
(cache read 10%, write 125%, as the table already does). Longest prefix first still.

**2. The brain's own spend (pure, new `hooks/lib/brain.ts`).** Every main-loop `turn.complete` (no
`agentId`) with `usage` adds to a per-session brain record kept in `$.state` (declare it in
`hooks/types/index.d.ts`): tokens in/out/cache, dollars by `usage.model`, turn count, and the count of
the brain's own source edits (below). `brainSplit(sessionUsd, brainUsd, workersUsd)` returns the three
numbers and the brain's share; where the session total is unknown, brain + workers.

**3. Show it.** `/delegation` adds one line: `brain: <model family> $<x> over <n> turns · workers $<y> (<n> attempts) · brain share <p>%`.
The dashboard's KPI row (pane, hover card and the text fallback) gains a tile "brain $x / workers $y", and
the spend-by-model block gains a row for the brain's model, labeled `brain`, so Fable's spend is never
mistaken for a worker's.

**4. Delegate-only mode.** A `/config` and repo-file key `delegateOnly` (`off` | `warn` | `deny`; default
`off`; declare it in the manifest). It applies to the MAIN loop only (tool.call events with no `agentId`),
and only while `$.session.model()` is a frontier or premium family (opus, fable), so a Sonnet brain is never
restricted. Under it, the brain's `Edit`, `Write`, `MultiEdit`, `NotebookEdit`, and a `Bash` command whose
words include a write to a tracked file (`>`/`>>` redirection into a path under the root, `sed -i`, `tee`,
`cp`/`mv` into the root, `git commit`) are:
- allowed when the path is under the card folder (`cardDir`), `.delegation/`, `.chassis-delegation.json`,
  `CHANGELOG.md`, or a `docs/` folder;
- otherwise, `warn`: the call runs and the mod posts one row per turn
  `chassis-delegation: the brain edited <path> itself; a card would have delegated it (delegateOnly=warn)`;
  `deny`: `{ deny: "chassis-delegation: delegateOnly is on: the brain does not edit source. Describe the task and call the card tool, or set delegateOnly off." }`.
Each brain edit, allowed or not, counts in the brain record ("brain edits: n").
A pure decision function `delegateDecision({ mode, brainFamily, tool, paths, root, cardDir })` holds the table.

**5. Posture.** When the brain's model is a premium family (fable) and `delegateOnly` is not `off`, the
`prompt.compose` "Delegation state" section gains two lines at the top: "You are the brain on a premium
model. Build work goes to workers through the card tool; you read the repo to write cards, verify
hand-backs, and read diffs. Do not edit source or run the test suite yourself." Keep the section under its
40-line cap.

**6. Docs.** README: a "The brain's spend" section (the split, where it shows, `delegateOnly`, what counts as
a brain edit, the allowlist) and the config table rows. CHANGELOG (GH-113).

Save red output to `.delegation/GH-113/red-1.txt`, name it `red=`. The gate map runs the three gates.
