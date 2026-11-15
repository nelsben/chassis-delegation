---
id: MOD-379
title: a repo option maxConcurrentGates caps how many gate commands the verifier and merge run at once in a session; the rest wait in line, and the wait does not count against the ceiling
domain: mod
tier: standard
status: merged
issue: 513
scope: [hooks/lib/gaterun.ts, hooks/register.ts, hooks/lib/configtable.ts, hooks/lib/repoconfig.ts, .claude-plugin/plugin.json, docs/configuration.md, CHANGELOG.md, tests/node/gatequeue.node.mjs, tests/*.test.ts, tests/node/*.node.mjs, tests/harness.ts]
forbid: [bin/**, docs/cards/**, docs/mockups/**, .claude-plugin/types/**, hooks/lib/verify-native.ts, hooks/lib/verify.ts, hooks/lib/version.ts, README.md, docs/upgrading.md]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/gatequeue.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Issue #513, item 4, the last one open. A repo's full gate takes about 215 s alone, about 405 s with two at once and over 700 s with three. When several workers hand back together, the verifier starts one gate per hand-back, they slow each other down, and one is stopped at the ceiling. A cap lets the repo run them one or two at a time. MOD-377 shipped items 1 and 3; item 2 is not the mod's to choose.

## Before you start

- `hooks/lib/gaterun.ts`: `ceilingMs`, `gateDeadlineEnv`, `pastCeilingWith`.
- `hooks/register.ts`: `spawnGate` (search `async function spawnGate`). Every gate the verifier and merge spawn goes through it. `gateProgress` is set inside its `try`.
- The option `gateTimeoutMinutes`, as the model for a whole-number repo option. It has a row in `hooks/lib/configtable.ts`, a field, a `REPO_KEYS` entry, a `case` and a `pick` in `hooks/lib/repoconfig.ts`, an entry in `.claude-plugin/plugin.json` and a row in `docs/configuration.md`. `tests/options.test.ts` pins the option list.

## Design (decided by the brain; build it, do not redesign it)

### The option

- `maxConcurrentGates`, repo scope, a whole number 0 to 16, default 0. 0 means no cap, which is today's behaviour.
- A value that is not a whole number 0 to 16 is named in the config errors (`maxConcurrentGates<where>: needs a whole number, 0 to 16 (ignored; no cap is used)`) and 0 is used.
- It is declared in every place `gateTimeoutMinutes` is: the config table (group `Checking the work`, words `How many check commands the checker and a merge run at the same time; more wait in line (0 = no limit)`, unit `count`), `repoconfig.ts`, and `plugin.json` (type number, default 0, the description says the same and names the limit below).

### The queue, pure, in `hooks/lib/gaterun.ts` (mark it `MOD-379 (#513)`)

- `export function gateQueue(): { acquire(max: number): Promise<() => void>; running(): number; waiting(): number }`.
- `acquire(max)` resolves at once when `max <= 0` or `running() < max`, and counts the caller as running. Otherwise the caller waits, first in first out, with its own `max` kept.
- The function it resolves to is the release. It lowers the running count once (a second call does nothing), then starts waiters from the head while the head's `max` is 0 or above the running count.
- A caller let in with `max <= 0` still counts as running, so a later capped caller sees it.

### Wiring, in `hooks/register.ts`

- One module-level `const gates = gateQueue()`.
- In `spawnGate`, after the refusal check and before the `try`: `const release = await gates.acquire(cfg.maxConcurrentGates)`. In the `finally`: `release()`.
- The ceiling timer, `CHASSIS_GATE_DEADLINE` and `gateProgress` all start after the acquire, as the code already orders them. A gate that waited 5 minutes in line still gets its whole ceiling.
- Nothing else changes: no new verdict words, no change to worker slots or `maxWorkers`.

### Docs

- `docs/configuration.md`: a row for `maxConcurrentGates` under the `gateTimeoutMinutes` row. It says: the most gate commands the verifier and merge run at once in this session; the rest wait in line and the wait is not counted against `gateTimeoutMinutes`; 0 is no cap. It caps only gates the mod starts. A worker's own run of the gate in its worktree, and gates in other sessions, are not counted, so pair it with `maxWorkers`.
- `CHANGELOG.md`, `## Unreleased` (make it above `## 0.9.62` when absent), `### Added`: one bullet `(MOD-379, #513)`.

## Tests

- `tests/node/gatequeue.node.mjs` (new, the red test), on `gateQueue`:
  - With max 0, three acquires all resolve at once.
  - With max 1, the second acquire does not resolve until the first release, and the third not until the second release; they start in the order they asked.
  - A release called twice lowers the count once.
  - With max 2, two run and the third waits.
- Config: where `gateTimeoutMinutes` is tested (`tests/options.test.ts` and the repo-config tests), add `maxConcurrentGates`: 2 is kept, 17 and 1.5 are named as errors and 0 is used.
- An engine test in `tests/gatespawn.test.ts`: with `maxConcurrentGates: 1`, two gates started together run one after the other (the second spawn is made only after the first ends). If the harness cannot show the order of two spawns, write the node test only and say so in a `choice:` line.

## Left to you

- Fixture texts and test names.
- How the engine test observes the order of the two spawns.

## Done when

- `maxConcurrentGates` is a repo option, 0 to 16, default 0, shown by `/delegation config` and settable in the repo file and in `/config`.
- With it at n above 0, at most n gate commands the mod started run at once in the session; the rest wait first in first out, and each gets its whole ceiling once it starts.
- With it at 0, gates run as they do today.
- The config row and the changelog say so, and gate validate, node and test are green.

## Review

Brain review (Opus 5.5): Built as designed. gateQueue is first in first out. An uncapped caller still counts as running, a double release is a no-op, and the release starts waiters from the head while each one's own max allows. spawnGate acquires after the refusal check and before the ceiling timer, the deadline env and the progress row, so a gate that waited gets its whole ceiling, and finally releases on every path. The option is declared in the table, repoconfig, plugin.json and the config row. The summary was shortened to fit the 90-character cap, and repo 0 is valid: both choices are sound. Nit for later: the new `const gates` sits between spawnGate's doc comment and the function, so that comment now attaches to the constant.
