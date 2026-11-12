---
id: MOD-366
title: The brief carries one advisor rule line, once before building on half the frontier cards and none on every other card, overridable by the card's advisor field and recorded on the spawn row; the worker says what the call changed and the verdict row flags calls over the rule
domain: mod
tier: standard
status: merged
issue: 500
scope: [hooks/lib/advisor.ts, hooks/lib/handback.ts, hooks/lib/rows.ts, hooks/lib/attempts.ts, hooks/lib/verify.ts, hooks/lib/quiet.ts, hooks/lib/dispatch.ts, hooks/lib/card.ts, hooks/templates/brief.md, hooks/register.ts, tests/node/advisor.node.mjs, tests/node/handback.node.mjs, tests/advisorrule.test.ts, tests/*.test.ts, tests/node/*.node.mjs, tests/harness.ts, docs/guide.md, CHANGELOG.md]
forbid: [bin/**, docs/cards/**, docs/mockups/**, hooks/lib/allow.ts, hooks/lib/version.ts, hooks/lib/cost.ts, hooks/lib/brain.ts, hooks/templates/review.md, .claude-plugin/plugin.json, README.md, docs/upgrading.md]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/advisor.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

An advisor model set for the session reaches every worker, and the host has no per-worker switch. Seen in the first evening of use: economy workers consulted a model about eighty times dearer than themselves, and of five calls made just before hand-back four changed nothing, since the verifier and the review check the work anyway. The owner wants the advisor only as a step up: a frontier worker may take one call before it builds, and no other worker calls it. The brief is the only place the mod can say so, and the ledger must record which rule an attempt ran under so the two can be compared.

## Before you start

- MOD-365 is merged before this card runs: `hooks/lib/advisor.ts` exists and `tests/node/advisor.node.mjs` has a `MOD-365` describe. Add to both; change nothing of MOD-365's.
- `hooks/templates/brief.md`: the `## Rules` list (the `{{#spend}}` block and the lines around it) and how a `{{name}}` value and a `{{#name}}` section are used.
- `hooks/register.ts`: the `renderBriefChecked(template, {…})` call that fills the template; where `card.fields.effort` is read at dispatch and how `effort` and `effortSource` reach the spawn record and the ledger's spawn row.
- Where things live (learned on MOD-365): the attempt record type `AttemptRecord` (with `effortSource`) is in `hooks/lib/attempts.ts`; `verdictLine` is in `hooks/lib/verify.ts`; `quietLine` is in `hooks/lib/quiet.ts`. The new fields go on `AttemptRecord` beside `effortSource` and `advisor`.
- `hooks/lib/card.ts`: the card tool's input schema (`effort`, `effortReason`) and the frontmatter it writes.

## Design (decided by the brain; build it, do not redesign it)

### 1. Pure, added to `hooks/lib/advisor.ts` (mark `MOD-366`)

```ts
export type AdvisorRule = 'none' | 'once'
export const ADVISOR_RULES: readonly AdvisorRule[] = ['none', 'once']
/** The card's own word when it is one of the two; else a frontier card is split in half by its task id, and every other tier is none. */
export function advisorRuleOf(tier: string, cardField: unknown, task: string): { rule: AdvisorRule; source: 'card' | 'tier' | 'split' }
export const advisorRuleLine = (rule: AdvisorRule): string
export const advisorFieldRefusal = (value: string): string
```

- `advisorRuleOf`: a `cardField` that is a string equal (trimmed, lower case) to `none` or `once` gives that rule with `source: 'card'`. Absent or empty, tier `frontier`: `once` when `fnv1a32('advisor:' + task) % 2 === 0`, else `none`, with `source: 'split'` either way (`fnv1a32` is imported from `hooks/lib/explore.ts`, read only; the `advisor:` prefix keeps this draw apart from the explore draw). The owner approved the split on 2026-11-11: half the frontier cards run without the call so the two halves can be compared, and a card always draws the same way. Absent or empty, any other tier (`economy`, `standard`, `premium`, another word): `none` with `source: 'tier'`. Premium is `none` because its worker already runs on the top model.
- `advisorRuleLine('none')`, exactly: `- Advisor: do not call the advisor tool, if you have one. The card is the plan: decide what it leaves open and list it as a choice, or hand back with the question.`
- `advisorRuleLine('once')`, exactly: `- Advisor: if you have an advisor tool you may call it once, after you have read the card and the files it names and before you change any file. Do not call it again, and not before you hand back: the verifier and the review check the work. If you called it, put one line in your hand-back: `advisor: changed <what you did differently>` or `advisor: no change`.`
- `advisorFieldRefusal(value)`, exactly: `` `refused: advisor: ${value} on the card; it takes none or once` ``.
- `export const advisorAllowed = (rule: AdvisorRule | undefined): number | undefined`: 0 for `none`, 1 for `once`, `undefined` for no rule (a brief written before this card).
- `export const advisorOverLine = (calls: number, allowed: number): string`, exactly: `` `advisor: ${calls} call${calls === 1 ? '' : 's'}, the brief allowed ${allowed}` ``.

### 2. The brief

- `hooks/templates/brief.md`: one new line `{{advisor}}` in `## Rules`, directly above the `{{#spend}}` block, outside every section, so all three brief modes carry it.
- The `renderBriefChecked` call passes `advisor: advisorRuleLine(rule)`.
- The review template is not changed.

### 3. Dispatch, `hooks/register.ts`

- At dispatch (dry run too), read `card.fields.advisor`. A value that is present, not empty and not one of the two words stops the dispatch with `advisorFieldRefusal`, at the place the other card field refusals are returned, before a brief or a worktree is written.
- The rule comes from the card's tier as the card states it, not from the tier an explore pick or an escalation runs the attempt on: an explored frontier card keeps `once`.
- The spawn record and the ledger's spawn row gain `advisorRule: 'none' | 'once'` and `advisorRuleSource: 'card' | 'split'`; the source is left out when it is `tier`. A resume row carries the same two fields as its spawn.
- The dispatch notes (the lines printed with the tier and effort line) gain one line only when the card set the field: `advisor rule <rule> (card)`.
- An existing brief file is reused as today; a brief written before this card has no advisor line and its attempt's row then carries no `advisorRule`.

### 3b. What the worker says the call changed (the hand-back `advisor:` line)

The advice itself is stored encrypted, so the worker's own word is the only record of what a call changed. It is self-report: counted, never judged, exactly as `choice:` lines are (MOD-338).

- `hooks/lib/handback.ts` gains, beside `handbackChoices`:

```ts
export type HandbackAdvisor = { said: 'changed' | 'no-change' | 'other'; what?: string }
/** MOD-366: the last `advisor:` line above the last `[[report`; undefined when there is none. */
export function handbackAdvisor(text: string): HandbackAdvisor | undefined
```

  - Same line shape as `CHOICE_LINE` with the word `advisor`: optional indent, optional `-` or `*`, optional backtick, `advisor:`, case-insensitive. Only text above the last `[[report` is read; with several lines the last one wins; an empty body is no line.
  - Body (trimmed, a trailing backtick dropped) starting with `no change` (any case): `{ said: 'no-change' }`. Starting with `changed`: `{ said: 'changed', what: <the rest, trimmed, at most 160 characters> }`, `what` left out when the rest is empty. Anything else: `{ said: 'other', what: <the body, at most 160 characters> }`.
- In `finalize` (the worker verdict path, where `handbackChoices` is read, same skip for adhoc and cardless attempts):
  - `const said = handbackAdvisor(text)`. When set: the verdict's lines gain `advisor: changed <what>`, `advisor: no change` or `advisor: <what>`; the attempt record patch and the ledger row gain `advisorSaid: 'changed' | 'no-change' | 'other'` and, when there is one, `advisorWhat: <what>`.
  - With MOD-365's `adv` (the calls counted from the transcript) and the spawn record's `advisorRule`: when `advisorAllowed(rule)` is a number and `adv.calls` is greater than it, the verdict's lines gain `advisorOverLine(adv.calls, allowed)` and the row gains `advisorOver: adv.calls - allowed`. Nothing is refused and the verdict does not change: it is a note for the brain's review and a number for the report.
  - Calls with no `advisor:` line, or a line with no calls, are left as they are: both show in the row (`advisor.calls` without `advisorSaid`, or the reverse) and are countable.

### 4. The card tool, `hooks/lib/card.ts`

- Input gains `advisor: { type: 'string', enum: ['none', 'once'], description: 'Whether the worker may call the session\'s advisor: none, or once before it changes any file. Absent: a frontier card is split in half by its id (once or none), every other card is none. Set it only to force one of the two.' }`.
- When given, the frontmatter gains `advisor: <value>` on the line after `effort_reason:` (or where that line would be). Another value is refused with `advisorFieldRefusal`.

### 5. Not in this card

- Nothing stops a call or changes a verdict: section 3b only notes calls over the rule.
- No option in the repo config or the plugin options; no change to tier picks, the scorecard or the history line.
- The brain's own use of the advisor.

### 6. Tests

- `tests/node/advisor.node.mjs`, a `MOD-366` describe: `advisorRuleOf` for economy, standard and premium with no field, an unknown tier, two frontier task ids chosen so one draws `once` and one `none` (both `source: 'split'`, and the same answer on a second call), of the ids `T-1` to `T-200` on a frontier card between 80 and 120 draw `once`, the field `once` on an economy card, `none` on a frontier card, ` Once ` (spaces and a capital), an empty string, a number, the word `twice` (falls to the tier; the refusal is dispatch's); the two lines and the refusal, each compared to its exact text.
- `tests/node/handback.node.mjs`, a `MOD-366` describe for `handbackAdvisor`: no line; `advisor: no change`; `- advisor: changed moved the gate output out of the worktree` (the `what`); `advisor: changed` alone; a backticked line; another wording (`other`); two lines (the last wins); a line below the last `[[report` (not read); a `what` longer than 160 characters (cut). `advisorAllowed` and `advisorOverLine` in the advisor file's `MOD-366` describe.
- Engine, `tests/advisorrule.test.ts`, a `MOD-366` describe:
  - a frontier attempt whose hand-back carries `advisor: no change` and whose transcript file holds one advisor call: the row has `advisorSaid: 'no-change'`, no `advisorOver`, and the verdict lines hold `advisor: no change`;
  - a standard attempt (rule `none`) whose transcript holds one advisor call: the row has `advisorOver: 1` and the verdict lines hold `advisor: 1 call, the brief allowed 0`;
  - a standard card: the brief holds the `none` line once, and the spawn row has `advisorRule: 'none'` and no `advisorRuleSource`;
  - two frontier cards (each with its `tier_reason`) whose ids draw differently: one brief holds the `once` line and its row `advisorRule: 'once'`, the other the `none` line and `advisorRule: 'none'`; both rows have `advisorRuleSource: 'split'`;
  - a standard card with `advisor: once`: the `once` line, `advisorRuleSource: 'card'`, and the dispatch note;
  - a card with `advisor: twice`: the dispatch stops with the refusal and writes no brief;
  - the card tool with `advisor: 'none'` on a frontier card writes the frontmatter line, and its dry run's brief holds the `none` line.
- Existing tests that compare a whole brief or count its rule lines are updated for the one new line; name each in the hand-back.

### 7. Docs

- `docs/guide.md`: where the card's frontmatter fields are listed, the `advisor:` field in one or two sentences (the two words, the half-and-half split of frontier cards and why, why premium is `none`); where the brief's rules are described, one sentence on the advisor line.
- `CHANGELOG.md`: under `## Unreleased`, `### Added`: one bullet ending `(MOD-366)`.

## Left to you (list each as a `choice:` line)

- Where exactly in `register.ts` the rule is computed once and carried to the brief, the record and the row.
- The fixtures of the engine tests.
- The wording of the docs sentences and the changelog bullet.

## Done when

- Every brief written from now on has exactly one advisor line in its Rules: the `once` or the `none` text for a frontier card by its split, the `none` text for every other tier, or the card's own `advisor:` word.
- A card with another `advisor:` word is refused at dispatch with the stated line, and no brief is written.
- The spawn and resume ledger rows carry `advisorRule`, with `advisorRuleSource` `card` or `split` when that is the source.
- A hand-back's `advisor:` line reaches the verdict lines and the row as `advisorSaid` (and `advisorWhat`); calls over the rule reach them as the stated line and `advisorOver`.
- The card tool takes `advisor` and writes it to the card.
- The docs and the changelog carry the lines of section 7.
- The gates `validate`, `node` and `test` pass.

## Review

Brain review (Opus 5.5): read the whole diff. advisorRuleOf splits frontier cards by fnv1a32('advisor:'+id) as designed; the dispatch refusal comes before any brief or worktree is written; the rule follows the card's stated tier. Reading the rule back from the brief's exact line at spawn is a sound choice: a reused or pre-rule brief honestly records no rule. spawnRow lives in storeloss.ts (out of scope), so spreading the fields onto its result in register.ts is right. handbackAdvisor mirrors handbackChoices; advisorOver is a note, never a refusal. Defaulting renderBrief to the none line keeps exactly one advisor line per brief.
