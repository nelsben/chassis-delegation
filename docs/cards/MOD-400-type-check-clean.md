---
id: MOD-400
title: "Type-check clean: `claude plugin validate` reports no type error in the hooks or the tests, with no behaviour change"
domain: mod
tier: standard
status: merged
issue: 561
scope: [hooks/register.ts, hooks/lib/*.ts, hooks/lib/*.tsx, tests/*.test.ts, tests/harness.ts, CHANGELOG.md]
forbid: [bin/**, docs/**, hooks/templates/**, hooks/lib/version.ts, .claude-plugin/**, README.md, tests/node/**]
red_test: "! claude plugin validate . 2>&1 | grep -q 'error TS'"
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Issue #561. From engine 2.1.323, `claude plugin validate` type-checks the TypeScript hooks modules and the tests. On main it passes, but with 57 type warnings across 22 files. Every one is type-only, and the noise would hide a real one.

## Before you start

- Run `claude plugin validate .` in your worktree. Every `error TS` line names its file, line and column. That list is the work.
- The counts on main: hooks/register.ts 10, hooks/lib/gaterun.ts 3, hooks/lib/handback.ts 3, hooks/lib/drive.ts 2, hooks/lib/setup.ts 1, hooks/lib/workpane.tsx 1, and 36 across 15 test files plus tests/harness.ts.

## Design (decided by the brain; build it, do not redesign it)

- **No behaviour change.** Every test that passes today passes unchanged, and no runtime branch is added, removed or reordered.
- **A missing field in a local type:** add it, optional. Two are known:
  - `SpawnEvent` in hooks/register.ts gains `permissionMode?: string`. The engine sends it, and `isAutoMode(e.permissionMode)` reads it.
  - `SpawnRecord` gains `prompt?: string` where the record literal sets it.
- **A possibly-undefined read:** narrow it with a guard or a local `const` checked on the line before. Use the non-null `!` only where the line before proves the value is there (an index inside a loop over the same array, or a match already tested).
- **The `explore` spread in register.ts (about line 8213):** build the row's fields so `explore` is a string where `startedRow` expects one, for example by destructuring `explore` out of `i` before the spread. The row written stays identical.
- **`Svg` in hooks/lib/workpane.tsx:** the terminal's element table has no `Svg`, and only remote surfaces draw it. Read `Svg` where `remote` is true, with a narrowing that type-checks. The terminal draws exactly as today.
- **The test harness's readonly prompt sections (tests/harness.ts and the tests that pass the engine to it):** widen the harness's parameter types to `readonly` arrays. Do not cast the engine.
- **`TestBody | undefined` in `Parameters<…>` (the TS2344 lines in the tests):** wrap with `NonNullable<…>`.
- **Forbidden everywhere:** `any`, `as unknown as`, `// @ts-ignore`, `// @ts-expect-error`, and `// @ts-nocheck`.
- `CHANGELOG.md`, `## Unreleased` (create it above `## 0.9.66` when absent), `### Changed`: one bullet `(MOD-400, #561)` saying the hooks and the tests now type-check clean under the engine's validate.

## Tests

- None new. The red test is the validate run itself. The node and engine tests must stay green unchanged.

## Left to you

- How each remaining line is narrowed, within the rules above.

## Done when

- `claude plugin validate .` prints no `error TS` line, and still ends `Validation passed`.
- Gate validate, node and test are green.

## Review

Brain review (Opus 5.5): Type-only, as designed. Under 2.1.328, validate prints no `error TS` line (57 on main), and node and engine tests are unchanged and green. The local SpawnEvent gains permissionMode and SpawnRecord gains prompt. explore is destructured out before the spread, Svg is read only on remote surfaces, and NonNullable is used on the Parameters lines; there is no any, double cast or ts comment. Each `!` follows a guard on the same line or the line before. The one runtime difference is a missing context percent: it now gives 0 tokens instead of NaN, which is an improvement.
