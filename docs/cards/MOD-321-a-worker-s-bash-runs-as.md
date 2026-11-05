---
id: MOD-321
title: A worker's Bash runs as typed when the session is in auto mode now (read off the classic hook events), and a host refusal the tool.call chain never sees still latches the worker and reaches the verdict
domain: mod
tier: standard
status: merged
issue: 451
parent: 423
scope: [hooks/lib/identity.ts, hooks/register.ts, tests/node/livemode.node.mjs, tests/automode.test.ts, tests/harness.ts, CHANGELOG.md]
forbid: [hooks/lib/allow.ts, hooks/lib/scheduler.ts, hooks/lib/verify-native.ts, hooks/lib/card.ts, hooks/templates/**, docs/cards/**]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/livemode.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Another session reported two workers (spawned in default and acceptEdits mode, then run after the person switched the session to auto) whose commit call the host refused with "a hook changed this call's input after auto mode reviewed it": the identity hook (MOD-16) reads the mode from the spawn row, so a switch after the spawn is invisible, and the MOD-279 latch never engaged because that refusal does not come back through the tool.call chain (neither worker transcript carries LATCH_LINE). The verdict then read the uncommitted hand-back as fabrication. The classic hook events carry `permission_mode` on every tool call, so the mod can read the live mode there, and `classic.PostToolUseFailure` carries the error text the chain never returned.

## Done when

- hooks/lib/identity.ts exports `effectiveMode(live: string | undefined, spawn: string | undefined): string | undefined` (the live mode when it is a non-empty string, else the spawn row's) and `isHostRefusalError(error: unknown): boolean` (true for a string that saysInputChanged matches); saysInputChanged, hostRefusalText, LATCH_LINE and AUTO_NOTICE are unchanged.
- hooks/register.ts keeps one module-level `livePermissionMode: string | undefined` and sets it from `e.permission_mode` (when a non-empty string) in hooks on `classic.PostToolUse`, `classic.PostToolUseFailure` and `classic.UserPromptSubmit`, each returning next(e) otherwise untouched; the mode is the process's, so one value serves every worker.
- The MOD-16 identity hook decides with `isAutoMode(effectiveMode(livePermissionMode, worker.permissionMode)) || asTyped.has(e.agentId)`; when the live mode is auto and the spawn row's is not, it writes one debug line per worker (once, the agent id remembered in a bounded map like asTyped): `<task label>: the session is in auto mode now (spawned in <spawn mode or unknown>): Bash runs as typed`.
- The `classic.PostToolUseFailure` hook, for `tool_name` Bash with an `agent_id` the mod recorded as a worker (spawnByAgent, not adhoc, not review) and an `error` isHostRefusalError matches: sets lastRefusal for that agent to the error text, increments hostRefusals n (and first when unset) without touching attempted, and adds the agent to asTyped with the same debug line the latch writes today, so the next Bash runs as typed and a hand-back with no usable sha after only refused calls is judged `blocked by environment` as MOD-279/281 define it; any other failure passes through.
- tests/node/livemode.node.mjs (new) covers effectiveMode (live wins, spawn when live is undefined or empty, undefined when both are) and isHostRefusalError (the verbatim host text is true; an ordinary failed command and a non-string are false).
- tests/automode.test.ts gains three engine cases using `$.classic.<Event>(fields)` (the testing API raises a classic event over every loaded plugin; the envelope is stamped): (a) a worker spawned with permissionMode default whose Bash runs prefixed, then `$.classic.PostToolUse({ tool_name: 'Read', tool_input: {}, tool_response: '', tool_use_id: 't1', permission_mode: 'auto' })`, after which its Bash reaches the engine exactly as typed; (b) after (a), a `$.classic.UserPromptSubmit({ prompt: 'x', permission_mode: 'default' })` restores the prefix; (c) a worker spawned in default mode, a `$.classic.PostToolUseFailure({ tool_name: 'Bash', tool_input: { command: 'git commit' }, tool_use_id: 't2', agent_id: '<its agent id>', error: "The server-side auto mode classifier gave no verdict for Bash: a hook changed this call's input after auto mode reviewed it, so the review does not cover what would run." })`, after which its next Bash reaches the engine as typed while a second worker is still prefixed. If `$.classic` is not on the test `$` of this build, say so in the report with the error text and keep the node test as the red.
- CHANGELOG.md gains one bullet under `## Unreleased` / `### Fixed` naming MOD-321 (add the `## Unreleased` heading with a `### Fixed` list above `## 0.9.51 — 2026-11-05` since the file has none now).
- The validate, node and test gates are green.

## Review

Diff read in full. identity.ts: effectiveMode (live wins when a non-empty string) and isHostRefusalError over saysInputChanged; existing exports untouched. register.ts: module-level livePermissionMode set from permission_mode on classic.PostToolUse, classic.PostToolUseFailure and classic.UserPromptSubmit; the identity hook decides on effectiveMode and writes the once-per-worker debug line when the live mode is auto and the spawn row's is not; the PostToolUseFailure hook, for a recorded Bash worker with a host-refusal error, sets lastRefusal, bumps hostRefusals n and first, latches asTyped and writes the latch debug line. Three engine cases drive $.classic with a bottom handler per event; five node cases. Open nit the worker flagged and I confirm at the verdict site: blocked-by-environment needs n === attempted, and attempted is counted only after next(e) returns in the tool.call chain, so a refusal seen only by PostToolUseFailure leaves n above attempted and the verdict unblocked; follow-up card MOD-322 relaxes the comparison. Verdict consistent at 4e2ed2b.
