---
id: MOD-377
title: a spawned gate gets CHASSIS_GATE_DEADLINE (seconds until the mod's ceiling) in its environment, and a gate stopped at the ceiling keeps its last output lines in the verdict and the review brief
domain: mod
tier: standard
status: merged
issue: 513
scope: [hooks/lib/gaterun.ts, hooks/register.ts, docs/configuration.md, CHANGELOG.md, tests/node/gatedeadline.node.mjs, tests/gatespawn.test.ts, tests/*.test.ts, tests/node/*.node.mjs, tests/harness.ts]
forbid: [bin/**, docs/cards/**, docs/mockups/**, hooks/lib/verify-native.ts, hooks/lib/verify.ts, hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, docs/upgrading.md]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/gatedeadline.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Issue #513: a repo whose gate runs long under load is stopped at the ceiling, and the verdict names nothing that was running. This card does two of the four things asked.

- Item 1: the gate is told its deadline, so it can stop itself cleanly.
- Item 3: a gate stopped at the ceiling keeps the last lines it printed.

Item 2, TERM and then KILL, is not the mod's to choose. `spawnGate` ends the child with `stream.return()`, and the engine picks the signal. A gate that reads the deadline can stop its own children first. Item 4, a cap on concurrent gates, is left for later.

## Before you start

- `hooks/lib/gaterun.ts`: `ceilingMs`, `pastCeiling`, `gateOutput`, `GATE_TAIL_LINES`.
- `hooks/register.ts`:
  - `spawnGate` (search `async function spawnGate`) and `RunOut`.
  - The verifier's `gate:` wrapper that fills `gateTails` (search `setBounded(gateTails`) and its local `GATE_TAIL_LINES` (8).
- `hooks/lib/verify.ts` `gateTimedOut`: read it only. The claim detail it parses (`gate <id> did not run: … timed out after <n> ms`) must still parse, and the first `<n> ms` in it must still be the ceiling.
- `$.process.spawn` takes `env`, set over the host's own environment (the engine's types, `ProcessRunInit.env`).
- `docs/configuration.md`, the `gateTimeoutMinutes` row.

## Design (decided by the brain; build it, do not redesign it)

### Pure parts, in `hooks/lib/gaterun.ts` (mark them `MOD-377 (#513)`)

- `export const GATE_DEADLINE_ENV = 'CHASSIS_GATE_DEADLINE'`.
- `export const gateDeadlineEnv = (minutes: number): Record<string, string>` returns `{ [GATE_DEADLINE_ENV]: String(Math.floor(ceilingMs(minutes) / 1000)) }`.
- `export function outputTail(stdout: string, stderr: string, n: number): string[]`: the non-blank lines of stdout and then stderr, each trimmed at the end, last `n`.
- `export function pastCeilingWith(minutes: number, tail: readonly string[]): string`:
  - Returns `pastCeiling(minutes)` unchanged when `tail` is empty.
  - Otherwise it appends `; last output: ` and the last 3 lines, each trimmed and joined with ` | `, cut to 240 characters with a trailing `…` when cut.

### Wiring, in `hooks/register.ts`

- `spawnGate` passes `env: gateDeadlineEnv(minutes)` to `$.process.spawn`.
- At the ceiling, `spawnGate` returns `{ ok: false, why: pastCeilingWith(minutes, tail), tail }`, where `tail` is `outputTail(out.stdout(), out.stderr(), GATE_TAIL_LINES)` from gaterun (40).
  - `RunOut`'s failure arm gains `tail?: string[]`.
  - Every other failure is unchanged.
- In the verifier's `gate:` wrapper, a result with `!r.ok && r.tail` adds to `gateTails` the line `  [${init.id}] stopped at the ceiling`, then the last 8 lines of `r.tail` as `  | <line>`. That is the same shape and the same 8 as the ok path.

### Docs

- `docs/configuration.md`, the `gateTimeoutMinutes` row gains two sentences:
  - Every gate command runs with `CHASSIS_GATE_DEADLINE` set to the whole seconds until the ceiling. A gate can stop its own children before that and exit non-zero with a message.
  - A gate stopped at the ceiling adds `; last output: …` (its last lines) to the verdict line.
- `CHANGELOG.md`, `## Unreleased` (make it above `## 0.9.61` when absent), `### Added`: one bullet `(MOD-377, #513)`.

## Tests

- `tests/node/gatedeadline.node.mjs` (new, the red test). It covers:
  - `gateDeadlineEnv(30)` gives `{ CHASSIS_GATE_DEADLINE: '1800' }`.
  - `outputTail` drops blank lines, puts stdout before stderr and keeps the last `n`.
  - `pastCeilingWith` with no tail equals `pastCeiling`. With a long tail it is cut, ends in `…`, and `gateTimedOut` (from hooks/lib/verify.ts) still reads `minutes` from a claim line `claim gate: unchecked — gate node did not run: <that text>`.
- `tests/gatespawn.test.ts`, engine tests:
  - A gate that prints `$CHASSIS_GATE_DEADLINE` shows the number.
  - A gate past a short ceiling leaves its last printed line in the verdict's gate claim.
  - Use the file's existing way of shortening the ceiling.

## Left to you

- Fixture texts and test names.

## Done when

- Every spawned gate sees `CHASSIS_GATE_DEADLINE`.
- A gate stopped at the ceiling names its last output in the verdict and the review brief's gate lines, and the advice for a timed-out gate is unchanged.
- The config row and changelog say so, and gate validate, node and test are green.

## Review

Brain review (Opus 5.5): Built as designed. spawnGate passes CHASSIS_GATE_DEADLINE through env, which the engine sets over the host environment, so PATH is kept. At the ceiling it returns pastCeilingWith plus the tail. pastCeiling's text stays first, so gateTimedOut still reads the ceiling from the first ms figure, and the node test covers that. The review-brief half writes '[id] stopped at the ceiling' plus the last 8 lines, the same shape as a passing gate. The choices are sound: the import alias avoids the name clash, and the engine test asserts the env given to the spawn because the mock spawn does not echo it. The worker's first stop was judged no-report while its background test run was still going, and the real report came after. I re-judged with dispatch verify=d46852b (counted 0/2): consistent.
