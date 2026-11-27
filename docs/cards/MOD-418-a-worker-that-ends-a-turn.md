---
id: MOD-418
title: A worker that ends a turn saying its own run is still in the background, or that it waits for its monitors, is read as waiting, not as a hand-back with no report
domain: mod
tier: standard
status: merged
issue: 593
parent: 589
fixes: []
scope: [hooks/lib/waitstate.ts, tests/node/waitwords.node.mjs, tests/node/*.mjs, tests/*.test.ts, CHANGELOG.md]
forbid: [docs/cards/**, docs/spikes/**, docs/mockups/**, hooks/templates/**, hooks/register.ts, hooks/lib/review.ts, hooks/lib/brief.ts, hooks/lib/verify.ts, hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, docs/upgrading.md, bin/**]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/waitwords.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Issue #593. Three times in one day a background worker ended a turn with words such as "The engine suite is still running in the background" or "Waiting for the monitors to fire." and the wait detector did not match, so the lead was shown a no-report row with next=resume while the worker was only waiting on its own run. Nothing was charged, but the row invites a resume that interrupts the worker.

## Before you start

- `hooks/lib/waitstate.ts`: read it whole (86 lines). `WAIT_NOW` is the one pattern; `saysWaiting` applies the three guards, takes the last paragraph, cuts it to its last 400 characters and tests the pattern.
- `tests/waitstate.test.ts`: the existing engine tests of `saysWaiting` (search `saysWaiting(`). They stay as they are.
- `tests/node/reviewlabel.node.mjs`: the shape of a node test file (imports from `./kit.mjs`, a lazy import of the lib file).
- What a detected wait does (for context, not to change): the lead is woken once with a row that says the worker waits on its own background job, then hears nothing until the hand-back, or a stalled row after `waitStallMin` (20 minutes). So a false wait costs up to 20 minutes of silence, and a missed wait costs a misleading no-report row. Both matter; do not widen past this design.

## Design (decided by the brain; build it, do not redesign it)

`saysWaiting` keeps its guards and its last-paragraph rule. On the cut last paragraph it returns true when any of three tests holds. All three ignore case.

1. **The wait pattern, widened.** Call the existing start of `WAIT_NOW`, up to and including the `\s+(?:on|for)\s+` part, the wait phrase; reuse it unchanged (keep the two apostrophe forms). After the wait phrase add a negative lookahead `(?!you\b|your\b)`, then the existing optional article and the existing lazy group of up to three words, then the noun group with five more nouns: `background|job|task|process|render|build|lock|resource|agent|worker|monitor|suite|tests?\b|gate|notification`. Do not add `run`, `check` or `command`: they are also verbs for what the lead does (waiting for the lead to run it).
2. **Running now.** `\b(?:is|are)\s+(?:(?:still|now|currently)\s+)?running(?:\s+again)?\s+in\s+the\s+background\b`. Present tense only: `was running`, `ran in the background` and `is no longer running in the background` do not match, and need no extra code to exclude.
3. **Waiting for it.** The wait phrase followed by `(?:it|that|this|them|those)\b`, and the same cut paragraph also matches `\bbackground\b`.

Build the wait phrase once (a string the first and third patterns share) so the two cannot drift. The patterns stay private to the file; the only export that changes behaviour is `saysWaiting`. Update its doc comment to name the three forms. Change nothing else in the file (`waitText`, `waitStep`, the pause code).

CHANGELOG.md: one bold-led entry under `## Unreleased`, `### Changed`, ending `(MOD-418, #593)`.

## Tests

Node tests in the new file `tests/node/waitwords.node.mjs` (write them first; they are the red test). Import `saysWaiting` from `../../hooks/lib/waitstate.ts`.

Positives, each `true`. The first three are real worker texts; keep them word for word:
- `The engine suite is still running in the background (task bcx26ic5i). Its completion will re-invoke me, so I'll wait for that rather than poll the output file. Once it finishes I'll check the result, commit the change, and hand back the report.`
- `The engine suite is running again in the background (task bx1b24y43). I'll pick up the result when it completes.`
- `Waiting for the monitors to fire.`
- `I started the suite in the background. I'll wait for it to finish.`
- `Both runs are now running in the background.`
- `Waiting for the engine suite to finish.`
- `I'll wait for the task notification.`
- `Still waiting on the gate to finish.`
- `I will wait for the tests to complete.`
- A two-paragraph text whose first paragraph is `Tests started.` and whose last is the second real text above.

Negatives, each `false`:
- `The suite was running in the background and has finished: 2348 pass.`
- `The dev server is no longer running in the background.`
- `The suite ran in the background and passed.`
- `Waiting for you to test it.`
- `Waiting for your call on the build.`
- `I'll wait for it.` (no word background in the paragraph)
- `Waiting for the tester.`
- The first real text followed by an empty line and a paragraph `Summary: the change is done.` (the wait is not in the last paragraph)
- The first real text followed by an empty line and a report line (copy the report line's shape from `tests/waitstate.test.ts`, its `REPORT` constant)
- A usage-limit text that also holds `is still running in the background` (build it from the usage-limit sentence that `tests/waitstate.test.ts` uses)

I checked every positive and negative above against these three patterns in a scratch script before writing this card; if one of them does not come out as listed, the pattern was mistyped.

Engine tests: none. Do not edit `tests/waitstate.test.ts`; every expectation in it must still hold. If one fails, the code is wrong, not the test.

## Left to you

- The names of the private constants and the wording of the doc comment and the changelog entry.
- How the node file groups its cases.

## Done when

- saysWaiting in hooks/lib/waitstate.ts returns true when the last paragraph says, in the present tense, that something is or are running in the background (with an optional still, now or currently before running and an optional again after it); a past-tense or negated form (was running, ran, is no longer running) does not count
- saysWaiting returns true when the last paragraph has a wait phrase aimed at it, that, this, them or those (for example I'll wait for that) and the same paragraph also has the word background; the same phrase with no word background in the paragraph does not count
- The existing wait pattern also accepts the nouns monitor, suite, test, gate and notification (so Waiting for the monitors to fire. is a wait), and no longer counts a wait aimed at you or your (Waiting for you to test it. is not a wait)
- The three guards (a report block, a pause line, a usage-limit text) and the last-paragraph rule with its 400-character cut are unchanged, and every existing expectation in tests/waitstate.test.ts still holds without being edited
- The new node test file tests/node/waitwords.node.mjs holds the three real worker texts from the card as positives, word for word, and the card's negatives
- CHANGELOG.md has one bold-led entry under the existing Unreleased section, under Changed, ending (MOD-418, #593) with the card's real id

## Testing

- Planned: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/waitwords.node.mjs
- Red test: failed before the change (.delegation/MOD-418/red-1.txt)
- Gate validate: pass · ✔ Validation passed with warnings · 15 s · verify pass reused at merge
- Gate node: pass · 2199 pass, 0 fail, 1230 skipped (engine tests: claude plugin test runs them) · 19 s · verify pass reused at merge
- Gate test: pass · 2348 pass, 0 fail, Ran 2348 tests across 111 files. [274.68s] · 4.6 min · verify pass reused at merge
- Test files changed: 1 (tests/node/waitwords.node.mjs); tests added: 1
- Attempts: 2

## Review

Brain review (Fable 5.2): I read the whole diff at 0b41f72. It is the card's design and nothing more: the wait phrase built once and shared by two patterns, five more nouns and the you/your lookahead on the first, the present-tense running-in-the-background pattern, and the wait-for-it pattern that counts only with the word background in the paragraph. The guards, the last-paragraph rule and the rest of the file are untouched, and tests/waitstate.test.ts was not edited. The 18 node tests hold the three real worker texts word for word and the card's negatives. Limit I accept: the lists of nouns and forms are my judgment from four sightings, so another phrasing can still be missed, and a worker that is done but ends with one of these forms and no report will read as waiting until the 20-minute stall row. On this very card the worker stopped while its engine run was still going and the mod showed no-report with next=verify; I ran the verifier at the sha only after the worker's hand-back arrived, and the worker's hand-back was then delivered five more times as its background tasks ended. Not checked: the type-check (no tsc on PATH).
