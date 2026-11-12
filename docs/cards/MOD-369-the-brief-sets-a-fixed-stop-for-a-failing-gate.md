---
id: MOD-369
title: Every brief carries a stop rule, two rounds of fixes on a failing gate then hand back gate=fail with a tried line per round, and the verdict row counts the tried lines
domain: mod
tier: standard
status: merged
issue: 503
scope: [hooks/templates/brief.md, hooks/lib/handback.ts, hooks/lib/attempts.ts, hooks/lib/dispatch.ts, hooks/register.ts, tests/node/handback.node.mjs, tests/node/templates.node.mjs, tests/stoprule.test.ts, tests/*.test.ts, tests/node/*.node.mjs, tests/harness.ts, docs/guide.md, CHANGELOG.md]
forbid: [bin/**, docs/cards/**, docs/mockups/**, hooks/lib/allow.ts, hooks/lib/version.ts, hooks/lib/cost.ts, hooks/lib/brain.ts, hooks/lib/advisor.ts, hooks/lib/verify.ts, hooks/lib/quiet.ts, hooks/templates/review.md, .claude-plugin/plugin.json, README.md, docs/upgrading.md]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/handback.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

A worker on a lower tier is not a good judge of when it is out of its depth, and the owner does not want it to consult a model above it to find out. The step up already exists and is measured: a hand-back with `gate=fail` moves the card to the next tier (`escalatesOn` in `hooks/lib/attempts.ts`). What is missing is the point at which the worker stops trying: the brief only covers a gate that fails on timeouts. One fixed rule gives that point, and one counted line per round shows what the next tier inherits.

## Before you start

- MOD-366 is merged: `hooks/templates/brief.md` has the `{{advisor}}` line in `## Rules`, and `hooks/lib/handback.ts` has `handbackAdvisor` beside `handbackChoices`. Add beside them; change nothing of theirs.
- `hooks/templates/brief.md`: the three `- Gate:` lines (one per brief mode) and their timeout sentence. They stay as they are.
- `hooks/register.ts`, `finalize`: where `handbackChoices` and `handbackAdvisor` are read and where their lines and row fields are added.
- `tests/node/templates.node.mjs`: the tests that read the gate line's text.
- Where things live (learned on MOD-365 to MOD-367): the attempt record type `AttemptRecord` is in `hooks/lib/attempts.ts` (the new `tried?: number` goes beside `advisorSaid`); the verdict's `lines` are built in `register.ts` and reach `verdictLine` (`hooks/lib/verify.ts`) and `quietLine` (`hooks/lib/quiet.ts`) without a change to either; the engine tests use the stand-in template `TEMPLATE` in `tests/harness.ts`, which needs the stop rule line too; `renderBrief`'s values are typed in `hooks/lib/dispatch.ts` (`BriefVars`) and need no change for fixed template text.

## Design (decided by the brain; build it, do not redesign it)

### 1. The brief, `hooks/templates/brief.md`

One new line in `## Rules`, directly above the `{{advisor}}` line, outside every section so all three brief modes carry it, exactly:

`- Stop rule: if the gate or the red test still fails after two rounds of fixes (a round is one change you made to turn it green, then one run), stop. Do not try a third. Hand back with gate=fail and one line per round: `tried: <what you changed> -> <what still fails>`. A gate=fail hand-back moves the card to a stronger model; it is the right outcome, not a failure of yours. A gate that fails only on timeouts is not a round: the gate rule above covers it.`

It is fixed text in the template: no value is passed for it and no option turns it off.

### 2. Pure, `hooks/lib/handback.ts` (mark `MOD-369`)

```ts
/** MOD-369: the `tried:` lines above the last `[[report`: how many, and the first few. */
export function handbackTried(text: string): { count: number; lines: string[] }
```

Same line shape as `CHOICE_LINE` with the word `tried`. Only text above the last `[[report`; an empty body is not a line; a repeated body counts once; `lines` holds at most 6, each cut to 160 characters.

### 3. Wiring, `hooks/register.ts`, in `finalize`

Where `handbackChoices` is read, with the same skip for adhoc and cardless attempts: when `handbackTried(text).count > 0`, the verdict's lines gain `` `tried: ${count} round${count === 1 ? '' : 's'} before handing back` `` and the attempt record patch and the ledger row gain `tried: <count>`. With no line, nothing changes. The count never changes a verdict, a `next=` or an escalation: `gate=fail` already does that.

### 4. Not in this card

- Counting the worker's real rounds from its transcript: the worker's own lines are the record, counted and not judged.
- Any change to `escalatesOn` (in `hooks/lib/attempts.ts`, in scope only for the `tried` field), the budget, or the tier an escalation picks.
- A different number of rounds per tier.

### 5. Tests

- `tests/node/handback.node.mjs`, a `MOD-369` describe: no line; one line; two lines; a bulleted and a backticked line; a repeated line (once); a line below the last `[[report` (not read); eight lines (count 8, six kept); a long line (cut).
- `tests/node/templates.node.mjs`, a `MOD-369` describe: each of the three brief modes holds the stop rule line exactly once, directly above the advisor line, and still holds its gate line's timeout sentence.
- Engine, `tests/stoprule.test.ts`, a `MOD-369` describe: a worker hands back `gate=fail` with two `tried:` lines: the row has `tried: 2`, the verdict lines hold `tried: 2 rounds before handing back`, and the card's next step is what it is today for a `gate=fail` hand-back; a passing hand-back with no `tried:` line has no `tried` field.
- Existing tests that compare a whole brief or count its rule lines are updated for the one new line; name each in the hand-back.

### 6. Docs

- `docs/guide.md`: where the brief's rules are described, the stop rule in two sentences and that `gate=fail` is what steps a card up a tier; where the ledger row's fields are listed, `tried`.
- `CHANGELOG.md`: under `## Unreleased`, `### Added`: one bullet ending `(MOD-369)`.

## Left to you (list each as a `choice:` line)

- The fixtures of the engine test.
- The wording of the docs sentences and the changelog bullet.

## Done when

- Every brief written from now on has the stop rule line once, with the stated text, in all three modes.
- `tried:` lines in a hand-back reach the verdict lines and the row as a count.
- No verdict, next step or budget changes because of them.
- The gates `validate`, `node` and `test` pass.

## Review

Brain review (Opus 5.5): read the whole diff. The stop rule line is the card's exact text, placed above the advisor line outside every gate section; handbackTried mirrors handbackChoices; tried reaches the verdict lines, the attempt record and the ledger row only when a worker listed rounds, and nothing reads it for a verdict, next step or budget. The claim in the line that gate=fail moves the card to a stronger model matches escalatesOn (consistent with reportGate fail). Done on haiku for $0.05.
