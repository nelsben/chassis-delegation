---
id: MOD-367
title: The delegation state tells the brain when to call the advisor, a cue line is raised on a second refute and on a review that refutes, and each cue is a ledger row
domain: mod
tier: standard
status: merged
issue: 502
scope: [hooks/lib/advisor.ts, hooks/lib/rows.ts, hooks/register.ts, tests/node/advisor.node.mjs, tests/advisorcue.test.ts, tests/*.test.ts, tests/node/*.node.mjs, tests/harness.ts, docs/guide.md, CHANGELOG.md]
forbid: [bin/**, docs/cards/**, docs/mockups/**, hooks/lib/allow.ts, hooks/lib/version.ts, hooks/lib/cost.ts, hooks/lib/attempts.ts, hooks/lib/review.ts, hooks/templates/**, .claude-plugin/plugin.json, README.md, docs/upgrading.md]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/advisor.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

The owner runs the brain on the second model and wants it to reach up to the top model when the work is not converging, and wants a brain already on the top model not to consult itself. The host's own advisor text invites a call before and after any piece of work, and every call re-reads the whole session uncached (seen: 52,000 to 216,000 input tokens a call). The brain cannot be forced to call or stopped from calling, so the mod does the two things it can: it states one rule in the delegation state, and it raises a cue at the moments it can see for itself. Each cue is a ledger row, so cue, call and outcome can be compared later (MOD-368 reads them).

## Before you start

- MOD-365 and MOD-366 are merged: `hooks/lib/advisor.ts` and `tests/node/advisor.node.mjs` exist with their describes. Add to both; change nothing of theirs.
- `hooks/register.ts`: the `prompt.compose` hook (the `PREMIUM_POSTURE` lines, `brainSeat`, `composeSection(snapshot, posture, …)`); `finalize`, where a worker verdict's lines are built and its ledger row appended; the review path, where `reviewVerdictLine` is built and `counts.refuted` is known; `appendLedger`; `sessionIdOf`.
- `hooks/lib/brain.ts`: `BrainFamily`, `brainFamily`. Read only; it is not in scope.
- Where things live (learned on MOD-365 and MOD-366): `verdictLine` is in `hooks/lib/verify.ts`, `quietLine` in `hooks/lib/quiet.ts`, `spawnRow` in `hooks/lib/storeloss.ts`; the cue line goes into the verdict's `lines` in `register.ts`, as MOD-366's `advisor:` line does, so none of those files needs a change.
- Every reader of the ledger in `hooks/` that walks rows by `kind` or by `verdict`: a row of the new kind must be skipped by each. Name the readers you checked in the hand-back.

## Design (decided by the brain; build it, do not redesign it)

### 1. Pure, added to `hooks/lib/advisor.ts` (mark `MOD-367`)

```ts
export type AdvisorCue = 'refute2' | 'review'
/** The one advisor line of the delegation state, by the brain's model family. */
export const brainAdvisorLine = (family: string): string
/** The cue line added to what the brain reads, or '' when the brain is on the top model. */
export const advisorCueLine = (cue: AdvisorCue, family: string): string
export const advisorCueRow = (v: { cue: AdvisorCue; task: string; subtask: string; attempt: number; at: number; brain: string; sessionId?: string }): Record<string, unknown>
```

- `brainAdvisorLine('fable')`, exactly: `Advisor: do not call the advisor tool. You are on the top model; a call would consult your own model.`
- `brainAdvisorLine(<any other family>)`, exactly: `Advisor: call it only when the mod prints an advisor cue, when the person asks for it, or when the person has corrected the same thing twice; not for routine dispatch, verdict or merge steps. Each call re-reads the whole session. When you call it, say in your reply what it changed.`
- `advisorCueLine('refute2', family)`, exactly: `advisor cue: this card's second attempt was refuted. If your advisor is a model above yours, call it once before you choose the next step.`
- `advisorCueLine('review', family)`, exactly: `advisor cue: the review refuted a claim. If your advisor is a model above yours, call it once before you resume the worker.`
- Both cue lines are `''` for family `fable`.
- `advisorCueRow` returns `{ kind: 'advisor-cue', cue, task, subtask, attempt, at, brain, sessionId }`, with `sessionId` left out when it is not given.

### 2. The delegation state, `hooks/register.ts`

- In the `prompt.compose` hook the posture passed to `composeSection` gains `brainAdvisorLine(family)` as its last line, for every brain family and whatever `delegateOnly` is; `family` is the one `brainSeat` call's answer, made once and used for both the premium posture and this line. The section is therefore always present for a brain prompt. The premium posture lines keep their place above it.
- No option turns the line off in this card.

### 3. The two cues, `hooks/register.ts`

- `refute2`: in `finalize`, when the worker verdict is `refuted` and the attempt number is 2 or more.
- `review`: on the review path, when the review's `counts.refuted` is greater than 0.
- At each: `const line = advisorCueLine(cue, await brainSeat($))`. When it is not empty, it is added as the last of the lines the brain reads for that verdict (the verdict tool's answer and the wake text alike), and `appendLedger($, advisorCueRow({ … at: now, brain: family, sessionId }))` is called once. When the line is empty (a brain on the top model), no line and no row.
- A cue never changes a verdict, a `next=`, an escalation or a budget.
- The ledger row types in `hooks/lib/rows.ts` gain the new kind where row kinds are listed.

### 4. Not in this card

- Counting the brain's advisor calls: the host hands the mod no advisor usage, and a session transcript is too large to read each turn. MOD-368's script counts them from the transcripts and joins them to these rows.
- A cue before a frontier card is dispatched: the frontier worker's own call (MOD-366) already covers the design once.
- Reading the advisor setting: the mod does not know whether an advisor is set, or which model it is. The lines say "if your advisor is a model above yours".

### 5. Tests

- `tests/node/advisor.node.mjs`, a `MOD-367` describe: the two state lines and the two cue lines compared to their exact text; both cue lines empty for `fable`; `advisorCueRow` with and without a session id, `toEqual` on the whole row.
- Engine, `tests/advisorcue.test.ts`, a `MOD-367` describe:
  - the composed prompt of a brain on the second model holds the "call it only when" line once, and that of a brain on the top model holds the "do not call" line once;
  - a card refuted on attempt 1: no cue line, no `advisor-cue` row; refuted again on attempt 2: the cue line is in what the brain reads and one `advisor-cue` row with `cue: 'refute2'` is in the ledger;
  - the same second refute with the brain on the top model: no line, no row;
  - a review that refutes a claim: the `review` cue line and row;
  - the scorecard and history readers give the same answer for a ledger with and without an `advisor-cue` row.
- Existing tests that compare the whole delegation state section are updated for the one new line; name each in the hand-back.

### 6. Docs

- `docs/guide.md`: where the delegation state is described, the advisor line in two sentences; where the ledger's row kinds are listed, the `advisor-cue` row and its fields.
- `CHANGELOG.md`: under `## Unreleased`, `### Added`: one bullet ending `(MOD-367)`.

## Left to you (list each as a `choice:` line)

- How the cue line is carried to both the verdict tool's answer and the wake text without building it twice.
- The fixtures of the engine tests.
- The wording of the docs sentences and the changelog bullet.

## Done when

- Every brain prompt carries exactly one advisor line, by the brain's model family, with the stated text.
- A second refuted attempt and a review that refutes each add the stated cue line and one `advisor-cue` ledger row, and add neither for a brain on the top model.
- No verdict, next step or budget changes because of a cue.
- The readers of the ledger skip the new row kind.
- The gates `validate`, `node` and `test` pass.

## Review

Brain review (Opus 5.5): read the whole diff. One brainSeat answer serves the premium posture and the advisor line; the refute2 cue fires only on a carded refuted attempt 2 or later, and the review cue on counts.refuted > 0; neither touches verdict, next, escalation or budget; a top-model brain gets no line and no row. The ledger-reader sweep in the hand-back is thorough, and the three existing-test edits follow from the section now always being present for a brain prompt, which the card intended. rows.ts correctly left alone.
