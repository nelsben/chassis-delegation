---
id: MOD-338
title: A worker lists the choices the card left open in its hand-back, and the mod counts them on the attempt, the ledger row and the verdict
domain: mod
tier: standard
status: merged
scope: [hooks/templates/brief.md, hooks/lib/handback.ts, hooks/lib/attempts.ts, hooks/lib/card.ts, hooks/register.ts, tests/node/handback.node.mjs, tests/handback.test.ts, tests/card.test.ts, tests/node/templates.node.mjs, tests/dispatch.test.ts, tests/init.test.ts, tests/research.test.ts, tests/harness.ts, tests/hooks4.test.ts, docs/contracts.md, docs/internals.md, docs/configuration.md, CHANGELOG.md]
forbid: [hooks/lib/allow.ts, hooks/lib/verify.ts, hooks/lib/verify-native.ts, hooks/lib/norepo.ts, hooks/lib/brief.ts, hooks/lib/version.ts, .claude-plugin/**, docs/cards/**]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/handback.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

The verifier checks a hand-back's scope, gate and red test. Nothing records how many design decisions the worker had to make because the card was silent, so nobody can tell an under-specified card from a complete one. A review of 330 cards found that card length does not predict a first-try pass, and that the only evidence of silent decisions is what a worker happens to mention in prose. This card makes the worker list those decisions in a fixed form and makes the mod count them, so the number sits on every attempt and can be compared across cards, tiers and models.

## Before you start

Read these, in this order. They are the whole mechanism this card touches.

- `hooks/templates/brief.md`: the brief every worker reads. The `## Rules` list is where the new rule goes; the `## Report` section is where the hand-back's last lines are described.
- `hooks/lib/handback.ts`: pure helpers over a worker's final words. `workerSaid` joins the turn's answer and the hand-back messages into one text.
- `hooks/register.ts`, function `finalizeOnce($, given, text, measured)`: `text` is that joined text. It extracts the report (`extractReport(text)`), runs the verifier, patches the attempt record (find the comment `MOD-22: the report's metrics=, recorded on the attempt and never judged`) and appends the judged ledger row (the `appendLedger` call that carries `noRepo: noRepo || undefined`). That ledger row spreads the attempt record, so a field on the record reaches the ledger without more code.
- `hooks/lib/attempts.ts`, type `AttemptRecord`: the record's fields, each with a doc comment.
- `hooks/lib/card.ts`, `CARD_TOOL.description`: the text the brain reads when it cuts a card. `tests/card.test.ts` pins parts of it with `toContain`.
- `tests/node/choice.node.mjs`: the shape of a pure node test (it imports `test, expect, describe` from `./kit.mjs` and the lib file by dynamic import).

## Design (decided by the brain; build it, do not redesign it)

### 1. The worker's side: one rule in the brief template

Add this bullet to `hooks/templates/brief.md`, in `## Rules`, straight after the bullet that starts `- Stay inside the brief's scope=`, outside every mode section so all three modes get it. Word for word:

```
- Choices: where the card leaves a decision to you (a name, a wording, a default, a layout, what an edge case does) and another worker could fairly have decided it differently, decide it and list it in your hand-back, one per line: `choice: <what was open> -> <what you picked>`. With none, write one line: `choice: none`. The mod counts them and never judges them. What the card, the Lessons or the code around your change already settles is not a choice.
```

In `## Report`, change the line `Amend blocks go on their own lines just above it.` to `Amend blocks go on their own lines just above it; choice lines go above those.`

The report line itself is unchanged: no new report field, and `REPORT_FIELDS` in `hooks/lib/brief.ts` is not touched (that file is forbidden).

### 2. The parser: `handbackChoices` in `hooks/lib/handback.ts`

```ts
export type HandbackChoices = { stated: boolean; count: number; lines: string[] }
export function handbackChoices(text: string): HandbackChoices
```

Pure. Rules:

- Only the text before the last `[[report` is read (`text.lastIndexOf('[[report')`; with no report, the whole text).
- A choice line is a line that, after optional leading spaces, an optional list marker (`-` or `*` and spaces) and an optional backtick, starts with `choice:` (any letter case) and has text after it. A trailing backtick and surrounding spaces are removed from that text.
- Text equal to `none` (any case, an optional final full stop) is the none line: it sets `stated` and is not a choice.
- The same choice text met twice is counted once (the joined text can hold the answer and the hand-back).
- `count` is the number of distinct choices. `lines` holds the first 12, each cut to its first 160 characters.
- `stated` is true when there is at least one choice or a none line.

The cases the node test must hold (`R` stands for a report line, `[[report v=1 task=T-1 subtask=main branch=none pr=none sha=none gate=pass red=none files=none]]`):

| Text | Result |
|---|---|
| `choice: helper name -> rollUp` / `choice: bar width -> 8 cells` / `R` | stated true, count 2, lines `['helper name -> rollUp', 'bar width -> 8 cells']` |
| `choice: none` / `R` | stated true, count 0, lines `[]` |
| `Choice: None.` / `R` | stated true, count 0 |
| `Done.` / `R` | stated false, count 0, lines `[]` |
| `- choice: a -> b` / ``* `choice: c -> d` `` / `  choice: e -> f` / `R` | count 3, lines `['a -> b', 'c -> d', 'e -> f']` |
| `R` / `choice: late -> x` | stated false (after the last report) |
| `choice: a -> b` / `choice: a -> b` / `R` | count 1 |
| `choice: none` / `choice: a -> b` / `R` | stated true, count 1, lines `['a -> b']` |
| 14 distinct choice lines / `R` | count 14, lines has 12 entries |
| one choice line whose text is 300 characters / `R` | count 1, the entry is its first 160 characters |
| `My choice: x -> y` / `R` | stated false (the line does not start with `choice:`) |
| `choice:` with nothing after it / `R` | stated false |
| `choice: a -> b` and no report at all | stated true, count 1 |

### 3. The record, the ledger row and the verdict line

- `AttemptRecord` in `hooks/lib/attempts.ts` gains `choices?: number`, with a doc comment: `MOD-338: how many decisions the worker listed as left open by the card; 0 when it wrote 'choice: none'; absent when it stated nothing.`
- In `finalizeOnce`, call `handbackChoices(text)` once. Skip it for an ad hoc spawn (`spawn.adhoc`) and for a cardless hand-back: they have no card to be silent.
- When `stated` is true, the record patch that carries `metrics` also carries `choices: <count>`.
- When `count` is above 0, the judged ledger row (the `appendLedger` call named above) also carries `choiceLines: <lines>`. The lines go to the ledger only, never to the store: the store is near its size limit.
- When `stated` is true, one line is pushed onto the end of `lines` before the record is patched, so the verdict output shows it: `choices: <count> the card left open` for a count above 0 (the same words for 1), or `choices: none stated` for 0. When `stated` is false no line is added.
- The count never changes the verdict, the next step, the tier or the budget.
- A later re-verify of the same attempt (`dispatch verify=<sha>`) does not read the worker's words again; the record keeps the `choices` it has. Do not add code that clears it.

### 4. The brain's side: one sentence in the card tool

Append to the end of `CARD_TOOL.description` in `hooks/lib/card.ts`, word for word, with one space before it:

```
Make every decision in the card or name it there as left to the worker: the worker lists the choices it had to make, and the verdict shows the count.
```

### 5. Left to you (list each as a choice line in your hand-back)

- Local names inside `handbackChoices` and `finalizeOnce`.
- The wording of the docs sentences and the CHANGELOG bullet, beyond the facts this card states.
- How the engine test builds its briefed spawn (follow the nearest existing test in `tests/handback.test.ts` or `tests/hooks4.test.ts`).

Your own brief may predate this rule. Follow it anyway: end your hand-back with choice lines, or `choice: none`, above the report.

## Done when

- `tests/node/handback.node.mjs` is new, holds every row of the table in Design 2 as a test, fails before the change and passes after.
- `handbackChoices` is exported from `hooks/lib/handback.ts` with the signature in Design 2 and has no `$` call.
- `hooks/templates/brief.md` holds the Choices bullet word for word, after the scope bullet and outside every mode section, and the Report section's amend sentence reads as Design 1 gives it; `tests/node/templates.node.mjs` asserts that a brief rendered in each of the three modes contains `choice: none`.
- An engine test in `tests/handback.test.ts` shows: a briefed worker's hand-back with two choice lines above a passing report gives a verdict output containing `choices: 2 the card left open`, an attempt record with `choices` 2, and a ledger row with `choices` 2 and a `choiceLines` array of 2; a hand-back with `choice: none` gives `choices: none stated`, `choices` 0 and no `choiceLines`; a hand-back with neither gives no `choices` key and no `choices:` line.
- The verdict of each of those three hand-backs is the same as without the choice lines.
- `CARD_TOOL.description` ends with the sentence in Design 4, and `tests/card.test.ts` asserts it contains `name it there as left to the worker`.
- `docs/contracts.md` describes the choice lines where it describes the hand-back and the report line: the form, `choice: none`, that they are counted and never judged.
- `docs/internals.md`, in Store and ledger, names the two ledger fields `choices` and `choiceLines` and says the lines are not in the store.
- `CHANGELOG.md` has one bullet for this under a `## Unreleased` heading at the top (add the heading if it is absent), in the style of the bullets below it, ending `(MOD-338).`
- Any existing test that pins the template's text or line count is updated to the new text, with no assertion removed.
- All three gates pass: validate, node, test.

## Review

Brain review: source diff read whole. Parser, record field, ledger field, verdict line, template bullet and card tool sentence are as Designs 1-4 give them; the count is never judged. Worker choices (6 listed): local names, docs wording, where the verdict line sits, how the engine and template tests are built.
