---
id: MOD-410
title: "The scorecard splits the brain block by repo with --by-repo, and --all <folder> reads every ledger under a folder in one command"
domain: mod
tier: standard
status: merged
issue: 575
scope: [bin/evidence.mjs, CHANGELOG.md, docs/guide.md, tests/node/evidencerepo.node.mjs, tests/node/*.node.mjs]
forbid: [hooks/**, docs/cards/**, docs/mockups/**, docs/spikes/**, .claude-plugin/plugin.json, README.md, docs/upgrading.md, docs/internals.md, tests/*.test.ts]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/evidencerepo.node.mjs
gate: validate, node
budget: 2-attempts
spend: 10
---
## Why

The scorecard's brain block compares brain setups (`opus-5.5/high` against `fable-5.2/high`) summed over every ledger given. The setups were used in different repos, so the comparison mixes the setup with the repo. And reading ten repos means typing ten ledger paths.

## Before you start

- `bin/evidence.mjs`: the argument parsing at the top, `label(i)` (the letter a ledger gets), the `scorecard` function's brain part (search `brainOut`) and `scorecardText`'s brain block (search `const setups`).
- `tests/node/evidence.node.mjs`: how the script is run in a test and how a ledger fixture is built.
- docs/guide.md, the paragraph that starts `Run \`node bin/evidence.mjs --scorecard`.

## Design (decided by the brain; build it, do not redesign it)

1. **`--by-repo`** (only with `--scorecard`). After the brain block the text gains a blank line and a block headed `brain by repo`: one row per repo label and setup that has at least one card, sorted by label then by cards descending. Columns: `repo`, `brain`, `cards`, `1st try` (as `n/cards pct`), `rework`, `repaired`, `brain $/card`, `share` (the brain's share of that row's spend). The figures are computed exactly as the brain block computes them, restricted to that repo's rows. The repo is shown by the label the script already gives each ledger (its letter); a ledger's path or folder name is never printed.
2. **`--all <folder>`.** The ledgers are every `<folder>/<name>/.delegation/ledger.jsonl` that exists, one level deep, in the order of `<name>` sorted by code unit. It replaces the list of ledger files: giving both is the usage error. With no ledger found the script prints `error: no ledgers under the folder given` to stderr and exits 1. In scorecard mode the first line of output is `ledgers: <n>`.
3. **The usage line** becomes `usage: node bin/evidence.mjs [--scorecard [--by-repo]] (<ledger.jsonl>... | --all <folder>)`. Any other `--` argument is still the usage error. Output without the new flags is byte for byte what it is today.

## Tests

Node tests in the new file `tests/node/evidencerepo.node.mjs` (write them first; they are the red test), run the way tests/node/evidence.node.mjs runs the script:
- Two ledger fixtures with brain stamps on different setups: `--scorecard --by-repo` prints the `brain by repo` block with a row for `A` and a row for `B`, each with its own cards count; neither fixture's path appears in the output.
- `--scorecard` alone on the same fixtures prints no `brain by repo` line.
- `--scorecard --all <folder>` over a temp folder holding two repo folders with ledgers and one folder without: the first line is `ledgers: 2` and the rest equals the output for the two files given by path in sorted order.
- `--all <folder>` with a ledger path as well exits 1 with the usage line; `--all` over an empty folder exits 1 with the no-ledgers line.

## Left to you

- How the per-repo figures share code with the summed ones.

## Done when

- `--by-repo` and `--all <folder>` behave as the Design says, and output without them is unchanged.
- The tests listed above exist in tests/node/evidencerepo.node.mjs and pass.
- docs/guide.md, in the scorecard paragraph's section, names both flags in two or three sentences, with `node bin/evidence.mjs --scorecard --by-repo --all <folder>` as the example.
- CHANGELOG.md gains one bullet under `## Unreleased`.
- The gates validate and node are green.

## Review

Brain review (Fable 5.2): Built as designed. The per-repo rows come from the same scorecard function run on one repo at a time, so they match the summed block; only the letter is printed. Run on ten real ledgers it printed `ledgers: 10` and a 22-row block with no path or folder name. The usage error exits 2, as every usage error in the script does; my card's test line said 1, which was my slip. Output without the new flags is unchanged.
