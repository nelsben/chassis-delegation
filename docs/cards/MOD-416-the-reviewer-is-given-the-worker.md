---
id: MOD-416
title: The reviewer is given the worker's own hand-back when the verifier passed only the report line, and is told what it may not refute
domain: mod
tier: standard
status: merged
issue: 591
parent: 589
fixes: []
spike: MOD-414
scope: [hooks/templates/review.md, hooks/lib/review.ts, hooks/lib/handback.ts, hooks/register.ts, tests/node/reviewhandback.node.mjs, tests/node/*.mjs, tests/*.test.ts, docs/review-and-merge.md, CHANGELOG.md]
forbid: [docs/cards/**, docs/spikes/**, docs/mockups/**, hooks/lib/version.ts, hooks/lib/waitstate.ts, hooks/lib/attempts.ts, hooks/lib/quiet.ts, hooks/lib/brief.ts, .claude-plugin/plugin.json, README.md, docs/upgrading.md, bin/**]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/reviewhandback.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Issue #591. On the verify path the reviewer's prompt holds only the synthetic report line under its hand-back heading, so the reviewer rebuilds claims from the card and refutes that the hand-back made them: the MOD-414 audit traced 3 of its 4 wrong refutes to a hand-back that was not the one the worker wrote, and the fourth to a file judged as it stood after the hand-back. The mod already has a reader for the worker's transcript hand-back; the reviewer is not given what it returns.

## Before you start

- `hooks/register.ts`: search `async function prepareReview` (it fills the template; `handback:` is `input.text` cut at `HANDBACK_CAP`), `async function transcriptHandbacks` and `async function workerText` just below it (the two sources of a worker's hand-back: the `handbacks` map a tool.call hook fills, and the transcript), and `const report = syntheticReport(` (the verify path: it calls `finalize($, spawn, report)` with the report line as the whole hand-back, and its `spawn.agentId` is the worker's when the attempt record has one).
- `hooks/lib/review.ts`: `sameShaWord` (private, the sha match the review block uses), `ReviewVars`, `renderReview`. The file is pure (no `$`).
- `hooks/lib/brief.ts`: `extractReport` (the last report block of a text) and `parseReport` (its fields). Import them; do not change that file.
- `hooks/lib/handback.ts`: `handbackMessages` (what the transcript reader returns: the hand-backs of the run the transcript ends on, in order).
- `hooks/templates/review.md`: read it whole (43 lines since MOD-415).
- Tests to read first: `tests/node/reviewlabel.node.mjs`, `tests/node/templates.node.mjs`, `tests/review.test.ts`, and `tests/handback.test.ts` (an engine harness that gives a subagent a transcript with a SubagentHandback call).

## Design (decided by the brain; build it, do not redesign it)

1. **Words of its own.** A text has words of its own when, after every report block is removed (each `[[report` up to its closing `]]`) and whitespace is collapsed, at least 40 characters remain. The synthetic report of the verify path has none. Export it from hooks/lib/review.ts as `handbackHasWords(text)`.
2. **`reviewHandback(given, transcript, sha)`** in hooks/lib/review.ts, pure, returning `{ text: string; source: 'given' | 'transcript' | 'report-only' }`:
   - `given` has words of its own: `{ text: given, source: 'given' }`.
   - Else walk `transcript` from its last entry to its first and take the first entry that has words of its own and whose last report block (`extractReport`, then `parseReport`) has a `sha` that matches `sha` by `sameShaWord`: `{ text: <that entry>, source: 'transcript' }`. An entry with no report block, or with another sha, is passed over. When `sha` is empty or is the word HEAD (any case), nothing matches.
   - Else `{ text: given, source: 'report-only' }`.
3. **`handbackSection(result, cap)`** in hooks/lib/review.ts, pure: the text cut at `cap` the way `prepareReview` cuts it today (longer than the cap: the first `cap - 1` characters and `…`). For source `given` that is the whole section. For the other two it is a note line, an empty line, then the cut text. The notes, exactly:
   - transcript: `(The verifier judged this sha with no fresh hand-back. What follows is the worker's own hand-back for the same sha, read from its transcript.)`
   - report-only: `(Only the report line is available: the worker's own words for this sha could not be read. Take each Done-when statement of the card as one claim and check it against the diff. Write no row about what the hand-back says or leaves out.)`
4. **`prepareReview`.** Replace the `handback:` value with `handbackSection(reviewHandback(input.text, heard, input.sha), HANDBACK_CAP)`. `heard` is an empty list when `handbackHasWords(input.text)` is true or the spawn has no `agentId`; else the hand-back the `handbacks` map holds for that agent (when it has one) followed by `await transcriptHandbacks($, spawn.agentId)`. So the normal path reads no transcript and its prompt is the same as before, character for character.
5. **The template.** Three additions, no line removed:
   - At the end of the numbered line 3 (the one about the diff and `sha=HEAD`), add: `With sha=HEAD a file may have been written after the hand-back: where the tree differs from the hand-back in a way a later write would explain, the row is unverifiable, not refuted.`
   - Under "What you do", after the bullet that starts "A refuted row sends the work back", add two bullets: `Label only what you can read. A statement about something outside the tree, the brief and this prompt (a run you did not see, a file elsewhere) is unverifiable.` and `What the hand-back does not say is not a claim: write no row for something it leaves out, and remember the copy below may be cut short. A Done-when statement of the card that the diff does not meet is a refuted row, whether or not the hand-back mentions it.`
6. **Left as it is.** The review marker, `decideReview`, `finalizeReview`, the ledger row and the attempt record are not changed here (the next card records where the hand-back came from). `hooks/lib/handback.ts` is in scope only in case a helper there needs an export; the expected diff leaves it alone.
7. **Docs.** docs/review-and-merge.md: in the paragraph that starts "The prompt is", say that after a `--verify` the reviewer's copy of the hand-back is the worker's own, read from its transcript when its report names the same sha, and that otherwise the prompt says only the report line was available and tells the reviewer to check the card's Done-when statements against the diff; name the new template rules in one sentence. CHANGELOG.md: one bold-led entry under `## Unreleased`, `### Changed`, ending `(MOD-416, #591)`.

## Tests

Node tests in the new file `tests/node/reviewhandback.node.mjs` (write them first; they are the red test):
- `handbackHasWords`: a lone report line is false; a report line plus a 10-character word is false; a paragraph and a report line is true; two report blocks and nothing else is false.
- `reviewHandback`: a given text with words of its own is returned as `given` whatever the transcript holds; a lone report line with a transcript whose last entry names the same sha (also when one sha is the 7-character prefix of the other) gives `transcript` and that entry; with two matching entries the later one wins; an entry for another sha, an entry with no report block and an entry that is a lone report line are passed over; no match gives `report-only` and the given text; `sha` empty or `HEAD` gives `report-only` even when an entry says `sha=HEAD`.
- `handbackSection`: for `given`, a text under the cap comes back unchanged and one over it is cut to `cap` characters ending in `…`; for `transcript` and `report-only`, the first line is the exact note, the second is empty, and the rest is the cut text.
- The template read from disk holds the three new sentences (assert a distinctive phrase of each).

One engine test, in `tests/review.test.ts` or `tests/handback.test.ts`, whichever needs less new harness: with review on, a worker whose transcript holds a SubagentHandback message with a paragraph and a report at sha S, then a verify at S judged consistent: the reviewer's spawn block holds the paragraph and the transcript note. If no harness can drive the verify path with a transcript in under about 40 lines of new set-up, write no engine test and say so in your hand-back; the node tests carry the logic.

Change no existing expectation. If an existing test fails, the code is wrong, not the test.

## Left to you

- The names of private helpers, and the exact wording of the doc sentences and the changelog entry.
- Which of the two engine test files the engine test sits in, or the call that it is not worth its set-up (rule above).

## Done when

- A new pure export reviewHandback(given, transcript, sha) returns { text, source }: source given with the given text when it has words of its own beyond its report blocks; else source transcript with the newest transcript hand-back that has words of its own and whose last report names the sha under review; else source report-only with the given text
- A sha matches as the review block's sha does today (both at least 7 characters, one a prefix of the other, case ignored); an empty sha or the word HEAD never matches, so a sha=HEAD review never takes a transcript hand-back
- A new pure export renders the hand-back section from that result and a cap: for source given the text cut at the cap exactly as today; for transcript and report-only one fixed note line, an empty line, then the text cut at the cap (the note is not counted against the cap)
- prepareReview in hooks/register.ts fills the template's handback key from those two helpers; it reads the worker's hand-backs (the one a tool.call hook saw for that agent, then the transcript's, as workerText does) only when the given text has no words of its own and the spawn has an agentId; a hand-back with words of its own gives the same prompt, character for character, as before this card
- hooks/templates/review.md says: label only what you can read, and a statement about something outside the tree, the brief and the prompt is unverifiable; what the hand-back does not say is not a claim and the copy may be cut short; a Done-when statement of the card that the diff does not meet is a refuted row whether or not the hand-back mentions it; and with sha=HEAD a difference a later write would explain is unverifiable, not refuted
- The new node test file tests/node/reviewhandback.node.mjs covers both helpers and the template's new sentences; the engine suite proves the verify path's reviewer prompt holds the worker's own words when the transcript has a hand-back for the same sha, if a harness there can already give a subagent transcript
- docs/review-and-merge.md says where the reviewer's copy of the hand-back comes from on the verify path and what the reviewer is told when only the report line is available; CHANGELOG.md has one bold-led entry under the existing Unreleased section

## Review

Brain review (Fable 5.2): I read the whole diff at c03779b. The attempt ran on Haiku through the explore pick and built the card's design as written: the three pure helpers in hooks/lib/review.ts, the two notes word for word, and six lines in prepareReview that read the worker's hand-backs only when the given text is a lone report line and the spawn names an agent. A hand-back with words of its own takes the old path and gives the same prompt. The sha match reuses the review block's own rule, and an empty sha or HEAD takes no transcript hand-back. The template gains the three sentences and loses none. Limit I accept: there is no engine test of the verify path with a transcript. The worker tried one on the worker path, found that path already carries the full hand-back, and removed it as the card allowed, so the wiring in prepareReview rests on my reading of the diff and the logic rests on 19 node tests. Not checked: the type-check (no tsc on PATH). The worker stopped twice to wait on its own engine run and the mod recorded both as waits, not as failed attempts.
