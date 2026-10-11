---
id: MOD-48
title: The brain sees what driving costs it: /delegation splits its calls by what they did with its context per call, and a warn row names a command it keeps re-running or polling at a large context as worker work
domain: mod
tier: standard
status: merged
scope: [hooks/lib/brain.ts, hooks/lib/drive.ts, hooks/lib/dashboard.ts, hooks/register.ts, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/templates/**, bin/**, hooks/lib/version.ts, hooks/lib/legacy.ts, hooks/lib/cost.ts]
red_test: pure tests in tests/node: the kind of a Bash call with run_in_background or an until/sleep loop is run-or-poll, of Read is read, of Edit is edit; the warn row fires on the third command sharing its first 60 characters at a 300K context and not at 100K, and once per turn; engine test in tests/hooks.test.ts: after a turn with three identical Bash runs, /delegation shows 3 run-or-poll calls and the average context; red first
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

The founder asked whether a Sonnet worker could have done most of the driving in a Game-Decompiler session (92e94d15, Oct 8-11), with Opus only reviewing the results. Yes, and the bigger saving is the worker's small context, not its cheaper model. The brain ran on Opus 5.5 with a median context of 490-650K tokens. It made 3,705 main-loop calls, and 1,653 of them drove the PS2 emulator lab: builds, boots, bench runs, `until grep` polls, filming and reading bench CSVs. Those calls cost $258 of the main loop's $605 at list prices, 43%, and 71% of that was cache reads of the whole context on every poll. The same calls priced with an 80K context cost $99 on Opus and $63 on Sonnet 5.5. So the small context cuts about 60%, and Sonnet's half price per token takes a further third. The mod already had the means: a standard card is a Sonnet worker, and `resources: ["pcsx2-lab"]` keeps one worker on a one-client app. The brain never filed a card, and nothing showed it what its own driving cost.

## Done when

- /delegation and the dashboard show the brain's main-loop tool calls this session by kind: run or poll (Bash run_in_background, until/sleep loops, a command run again in the same turn), read (Read, grep/sed/cat/ls), edit (Edit/Write/MultiEdit, a Bash write into the root), spawn (Agent/SendMessage), with the count of each and the brain's average context per call (input + cache-read tokens over calls, from the turn usage the mod already gets)
- a warn row, on by default and turned off with a config key: when the brain's context is at or above a threshold (config, default 200K tokens) and it runs a command whose first 60 characters match one it already ran twice this turn, or polls a background job, the row names the command, the count, the context and the dollars a call costs at that context on the brain's model, and says a standard card (with resources for a one-client app) would drive it; at most one such row a turn
- README gains a section on what the brain keeps and what it hands off: the brain writes the brief (goal, numbers, the check to pass, what to hand back: diff, measured results, images) and reviews the hand-back; a worker with a fresh context runs the build, run, poll and read-the-logs loop; this session's numbers are the worked example
- pure tests for the call kinds and for the warn row (it fires on the third matching command at or above the threshold, not below it, not twice in a turn); an engine test where /delegation shows the split; CHANGELOG

## Evidence

From the session's main transcript, priced once per message id at list prices (Opus 5.5 $4 / $20, cache reads $0.20,
1-hour cache writes at 2x; the claude-api skill's table of 2026-10-06), calls sorted by their first tool use:

| What the call did | Calls | List $ | Share | Mean context |
|---|---:|---:|---:|---:|
| Drove the lab: build, boot, bench, poll, film | 1,549 | 245.25 | 40.5% | 562K |
| Read code, misc shell | 1,088 | 173.35 | 28.6% | 484K |
| Edited | 394 | 73.06 | 12.1% | 552K |
| Read a file or image | 383 | 59.11 | 9.8% | 577K |
| Read bench CSVs | 104 | 13.22 | 2.2% | 506K |
| Spawned or steered agents | 33 | 11.33 | 1.9% | 425K |
| Replied to the user | 66 | 9.30 | 1.5% | 506K |
| Other tools, git, unit tests | 88 | 20.64 | 3.4% | — |
| **Main loop** | **3,705** | **605.26** | | |

The 61 ad hoc research agents the brain spawned cost $286 at list prices: 39 inherited Opus because no model was set
($241), and 22 ran on Sonnet ($45). Set the model on research spawns as well as on cards.

What should stay with the brain in a session like this one: choosing what to build and the numbers that make it right
(here, Majora's Mask's speeds and timings), writing the brief and the check that judges it, and reviewing the
hand-back (the diff, the bench lines, stills or a video). What a worker should do: the edit, hot-load, bench and
read-the-CSV loop, disc builds and boots, filming, and the docs that record the result. Some work keeps the hand-off
from being free. The lab serves one client, so lab workers run one at a time. The repo's gate is unit tests, which
can't tell whether a move works in the game, so the brain still has to read the bench results and look at the stills.
A worktree is cut from main, so the brief names the branch tip.
