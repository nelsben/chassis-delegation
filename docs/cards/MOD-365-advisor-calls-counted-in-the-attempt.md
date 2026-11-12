---
id: MOD-365
title: A worker's advisor calls are read from its transcript at the verdict, their dollars added to the attempt, and the count shown on the verdict row and the ledger
domain: mod
tier: standard
status: merged
issue: 499
scope: [hooks/lib/advisor.ts, hooks/lib/rows.ts, hooks/lib/debriefcheck.ts, hooks/register.ts, tests/node/advisor.node.mjs, tests/advisor.test.ts, tests/*.test.ts, tests/node/*.node.mjs, tests/harness.ts, docs/guide.md, docs/internals.md, CHANGELOG.md]
forbid: [bin/**, docs/cards/**, docs/mockups/**, hooks/lib/allow.ts, hooks/lib/version.ts, hooks/lib/cost.ts, hooks/lib/brain.ts, hooks/templates/**, .claude-plugin/plugin.json, README.md, docs/upgrading.md]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/advisor.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

A session may have an advisor model set, and every worker inherits it. An advisor call re-reads the worker's whole transcript at the advisor model's rate. The turn usage the host hands the mod (`TurnUsage`) carries the worker model's tokens only, so the attempt's dollars leave the advisor out: an economy attempt was recorded at $0.01 after one advisor call that read 52,430 input tokens on a model priced about eighty times higher. Nothing on the verdict row or in the ledger says a call was made, so attempts with and without the advisor cannot be compared.

## Before you start

- `hooks/lib/cost.ts`: `UsageLike`, `tokensOf`, `usdOf`, `priceFor`. Read only; it is forbidden to change.
- `hooks/lib/debriefcheck.ts`: `transcriptPath`.
- `hooks/register.ts`: `finalize` from the comment `GH-106: the worker's own cost from its turn usage` to the `appendLedger` call below it (how `usd` and `usdApprox` are made and where they go: the attempt record, the verdict line, the quiet line, the ledger row); `readText`; `transcriptHandbacks`.
- `hooks/lib/rows.ts`: `verdictLine` and the quiet verdict line (`quietLine`).

## The real shape (read from live worker transcripts on 2026-11-11; write fixtures in this shape)

A worker's transcript is the file `<home>/.claude/projects/<session root, every non-alphanumeric as '-'>/<session id>/subagents/agent-<agentId>.jsonl`. The folder is the session's own root even when the worker's working folder is a worktree or another repo. One JSON object a line. An assistant message is written as several rows, one per content block, and every row of the message repeats the same `message.id` and the same `message.usage`:

```json
{"type":"assistant","timestamp":"2026-11-11T04:32:21.704Z","message":{"id":"msg_01","model":"claude-opus-5-5","content":[{"type":"server_tool_use","id":"srvtoolu_01","name":"advisor","input":{}}],"usage":{"input_tokens":12,"output_tokens":900,"cache_read_input_tokens":80000,"cache_creation_input_tokens":4000,"iterations":[{"type":"message","input_tokens":12,"output_tokens":300},{"type":"advisor_message","model":"claude-fable-5-2","input_tokens":88102,"output_tokens":7654,"cache_read_input_tokens":0,"cache_creation_input_tokens":0},{"type":"message","input_tokens":0,"output_tokens":600}]}}}
```

One `advisor_message` entry is one advisor call. Entries of type `message` are the worker model's own and are already in the turn usage.

## Design (decided by the brain; build it, do not redesign it)

### 1. Pure, a new `hooks/lib/advisor.ts`

```ts
export type AdvisorUse = { calls: number; usd: number | null; in: number; out: number; models: string[] }
/** The advisor calls in a worker transcript, from rows stamped at or after sinceMs. */
export function advisorUse(jsonl: string, sinceMs?: number): AdvisorUse
/** The worker transcript file of an agent of a session. */
export const workerTranscriptPath = (home: string, root: string, sessionId: string, agentId: string): string
/** ` · advisor 2 calls $1.84`; '' when calls is 0. */
export const advisorPart = (u: Pick<AdvisorUse, 'calls' | 'usd'> | undefined): string
```

- `advisorUse`: split on newlines; a line that is not a JSON object is skipped. A row counts when `type === 'assistant'`, `message.id` is a non-empty string not seen before in this call, and (when `sinceMs` is given) `Date.parse(timestamp) >= sinceMs`; a row with no parsable timestamp counts only when `sinceMs` is undefined. For each entry of `message.usage.iterations` whose `type === 'advisor_message'`: `calls` + 1; its tokens are `tokensOf(entry)`; `in` adds input, cache-read and cache-write tokens; `out` adds output tokens; its dollars are `usdOf(tokens, priceFor(entry.model))`. `usd` is the sum rounded to 4 places, or `null` once any entry's model has no price. `models`: the distinct entry models, in first-seen order (`'unknown'` for a missing one, which has no price).
- `workerTranscriptPath`: `transcriptPath(home, root, sessionId)` with its trailing `.jsonl` removed, then `/subagents/agent-<agentId>.jsonl`.
- `advisorPart`: `` ` · advisor ${calls} call${calls === 1 ? '' : 's'}` `` then `` ` $${usd.toFixed(2)}` `` when `usd` is a number, or ` $?` when it is `null`. Empty for `undefined` or 0 calls.

### 2. Wiring, `hooks/register.ts`, in `finalize` (the worker verdict path only)

- Right after `own` is read: when `spawn.agentId` is set and the attempt is not adhoc, read the file at `workerTranscriptPath(home, await $.session.root(), sessionId, spawn.agentId)` with `readText`, taking `home` and the session id the way the debrief check does for `transcriptPath`. No file, no session id, or a throw: no advisor data, one `debug` line, and the verdict goes on as today.
- `const adv = advisorUse(text, <the attempt's start time>)`. The start time is the time the mod recorded for this attempt's spawn or resume (the `at` of its attempt record); this keeps a resume from counting the first attempt's calls again.
- When `adv.calls > 0`:
  - the attempt's `usd` becomes `round4(usd + adv.usd)` only when `usd` came from the worker's own turn usage (`own`) and both are numbers. Verified 2026-11-11 on real transcripts: a turn's usage is the sum of its `message` iterations and leaves the advisor's out, so this adds and does not double count. When `usd` is the session-usage fallback (`usdApprox`), it is left as it is: that total may already hold the advisor's dollars. When `adv.usd` is `null`, `usd` is left as it is. `usdApprox` is unchanged. The `advisor` field below is written in every one of these cases.
  - the transcript may lag the hand-back by a moment: read it once, at this point, and take what is there; a call that is missed is missed (no retry, no wait).
  - the attempt record patch and the ledger row gain `advisor: { calls, usd, in, out, models }`.
  - `verdictLine` and the quiet verdict line gain `advisorPart(adv)` directly after their dollars segment; a row with no dollars segment gets it at the end of the segment list. Both builders take it as one new optional field.
- When `adv.calls === 0` nothing changes anywhere: no field, no text.

### 3. Not in this card

- The review path (`reviewVerdictLine`), ad hoc agents, the brain's own advisor calls and `brainTurn`.
- The spend ceiling while a worker runs (`trackSpend`): it still sees the worker model's turn usage only.
- The scorecard, the history line and the adaptive picks: they read `usd`, which now includes the advisor.
- No price table change.

### 4. Tests

- `tests/node/advisor.node.mjs`, a `MOD-365` describe, `toEqual` on whole results:
  - the fixture above written as four rows with one `message.id`: 1 call, `in: 88102`, `out: 7654`, `usd` equal to `usdOf` of those tokens at `priceFor('claude-fable-5-2')`;
  - two messages with one call each: 2 calls, summed;
  - a message whose iterations are all `message`: 0 calls, `usd: 0`, `models: []`;
  - `sinceMs` between the two messages: only the later one; a row with no timestamp is dropped when `sinceMs` is given and kept when it is not;
  - an entry with a model the table does not price: `usd: null`, the call still counted;
  - a blank line, a line that is not JSON, a `user` row, an assistant row with no `usage`: skipped;
  - `workerTranscriptPath` for a root with dots and spaces and a trailing slash;
  - `advisorPart`: undefined, 0 calls, 1 call, 2 calls, `usd: null`.
- Engine, `tests/advisor.test.ts`, a `MOD-365` describe: a worker hands back a passing report with a transcript file holding one advisor call; the verdict row carries ` · advisor 1 call $`, the ledger row carries `advisor.calls === 1`, and its `usd` is the turn-usage dollars plus the advisor dollars. A second case with no transcript file: the row and the ledger row are as today.
- No existing test changes its expectation; name any that had to in the hand-back.

### 5. Docs

- `docs/guide.md`: in the part that explains the verdict row's dollars, two or three sentences: what the advisor segment is, that the attempt's dollars include it, that the spend ceiling does not see it while the worker runs.
- `docs/internals.md`: one short paragraph where worker cost is described: the transcript path, the `advisor_message` entry, the de-duplication by message id.
- `CHANGELOG.md`: under `## Unreleased` (add the heading above the newest version when absent), `### Fixed`: one bullet ending `(MOD-365)`.

## Left to you (list each as a `choice:` line)

- How the engine test seeds the transcript file and the home folder in the harness. If the harness cannot serve a file read at that path without a change to `tests/harness.ts`, make the smallest such change and say so.
- The names of the new optional fields on the two row builders.
- The wording of the docs sentences and the changelog bullet.

## Done when

- `advisorUse`, `workerTranscriptPath` and `advisorPart` behave as section 1 says and the node tests pass.
- A worker attempt that made advisor calls shows ` · advisor <n> call(s) $<x>` on its verdict row and quiet row, has `advisor` on its ledger row and attempt record, and its `usd` includes the advisor dollars.
- An attempt with no advisor call, or whose transcript cannot be read, produces exactly today's rows.
- A resumed attempt counts only the calls made since the resume.
- The docs and the changelog carry the lines of section 5.
- The gates `validate`, `node` and `test` pass.

## Review

Brain review (Opus 5.5): read the whole diff. The three amends (verify.ts, quiet.ts, attempts.ts) are where verdictLine, quietLine and AttemptRecord really live; the card named rows.ts by mistake, so they are the brain's error and sound. Advisor dollars are added only on the own-cost path, as amended; the field is written whenever calls > 0; a resume counts from its attempt record's at. Ran advisorUse on four real worker transcripts from 2026-11-11: 2 calls each, $2.10 to $3.99 per attempt, models claude-fable-5-2, matching the cross-session report. Choices are sound.
