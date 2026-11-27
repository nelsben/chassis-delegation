---
id: MOD-415
title: A reviewer labels report-only errors misreported; only refuted rows send the work back, and misreported rows are counted and shown under the verdict
domain: mod
tier: standard
status: merged
issue: 590
parent: 589
fixes: []
spike: MOD-414
scope: [hooks/templates/review.md, hooks/lib/review.ts, hooks/lib/attempts.ts, hooks/lib/quiet.ts, hooks/register.ts, tests/node/reviewlabel.node.mjs, tests/node/*.mjs, tests/*.test.ts, docs/review-and-merge.md, docs/guide.md, docs/internals.md, CHANGELOG.md]
forbid: [docs/cards/**, docs/spikes/**, docs/mockups/**, hooks/lib/version.ts, hooks/lib/waitstate.ts, .claude-plugin/plugin.json, README.md, docs/upgrading.md, bin/**]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/reviewlabel.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Issue #590. The MOD-414 audit found that 16 of 43 reviewer refutes were only an error in the worker's report (a count, a line number, an all-cases word) while the work at the sha was right, and 9 of 31 sampled reviews held nothing else; each still cost a resume or a hand check. The review template has one label for any false claim and the mod resumes the worker on any refuted row. A fourth label keeps report-only errors visible without sending the work back.

## Before you start

- `hooks/templates/review.md` (40 lines): the three label lines under "What you do", the Rules line that starts "Edit nothing", the "Rows" section, and the "End" line.
- `hooks/lib/review.ts`: `ReviewCounts`, `ReviewTally`, `parseReviewBlock`, `ReviewLabel`, the `ROW` pattern, `reviewRows`, `refutedRows`, `shownRefuted`, `reviewClause`, `reviewKeys`, `reviewAdvice`, `reviewResumeText`, `reviewVerdictLine`. The file is pure (no `$`).
- `hooks/lib/attempts.ts`: `ReviewResult` (the type the attempt record and the ledger row store under `review`).
- `hooks/lib/quiet.ts`: `reviewLine` builds the quiet row from `reviewClause`, so it needs no change of its own unless a type does.
- `hooks/register.ts`: search `async function finalizeReview` (the one place a review hand-back is judged; `orphanReview` below it calls it, so it needs no change).
- Tests to read first: `tests/node/mergereview.node.mjs`, `tests/node/templates.node.mjs`, `tests/review.test.ts`.
- Docs: `docs/review-and-merge.md` (the paragraph that starts "The prompt is", the table under "How it runs", the `verdictVerbosity: full` sentence) and the line in `docs/internals.md` that starts "- A reviewer's line has".

## Design (decided by the brain; build it, do not redesign it)

1. **The template's labels.** Replace the three label lines with these four, in this order:
   - confirmed: the diff or a read-only command shows it is true;
   - refuted: the work is wrong: the diff or a read-only command shows the code, tests, docs or files at the sha are not what the hand-back says, and something has to change before merge (name what);
   - misreported: the work at the sha is right, and a statement in the hand-back about it is wrong (a count, a line number, a file name, an "all" or "every" that says too much);
   - unverifiable: nothing you can read here decides it (say what would).

   Add one bullet after "Name what decides each row": a refuted row sends the work back to the worker, so use it only when something in the work has to change before merge; when nothing has to change, the row is confirmed or misreported, never refuted. In the Rules line that starts "Edit nothing", after its last sentence add: a misreported row is shown to the lead and sends nothing back.
2. **The template's rows and end.** The Rows section gains, between the refuted and the unverifiable line: `misreported: <the statement> — <the command or file:line that decides it, and what is true instead>`. The End line becomes `[[review v=1 task={{id}} confirmed=N refuted=N unverifiable=N misreported=N]]`. `reviewKeys` ends its line the same way.
3. **Types.** `ReviewResult` gains `misreported?: number`. Optional, so a record or ledger row stored before this card reads as it is and every place that builds a `ReviewResult` today still type-checks. `ReviewLabel` gains `'misreported'`.
4. **The parser.** `parseReviewBlock` still needs only the three old keys to call a block well-formed. When the block has `misreported=` with a whole number, the result has `misreported` as a number (0 included). Absent, or not a whole number: no `misreported` key on the result, and the block still parses.
5. **The rows.** The `ROW` pattern accepts `misreported` as a fourth label. `reviewRows` returns it with label `misreported` and line `misreported: <text>`. New export `misreportedRows(text)`: those rows' lines, in order. `refutedRows` and `shownRefuted` are unchanged.
6. **The advice.** `reviewAdvice` is not changed: it reads `refuted` only, so a review with `refuted=0` and any `misreported` is `next=accept`. Prove it with a test, change no code.
7. **The clause and the long line.** `reviewClause` appends `, N misreported` after the unverifiable count when `misreported` is above 0, in both of its forms: `review: 3 confirmed, 1 unverifiable, 2 misreported` and `review: 3 confirmed, 1 refuted, 0 unverifiable, 2 misreported`. `reviewVerdictLine` appends ` misreported=N` after `unverifiable=N` when it is above 0. With `misreported` absent or 0 both give today's text.
8. **`finalizeReview`.** When there is a well-formed block, read `misreportedRows(text)` whatever the block's count says. The number stored is the block's `misreported` when the block has the key, else the number of misreported rows read; store it in the `review` object passed to `patchReview` only when it is above 0 (the ledger row is written from that record, so it follows). Pass the same number to `reviewVerdictLine` and `reviewLine` through the counts, so the row and the stored record agree. The lines under the verdict row are: the refuted rows as today, then every misreported row, then the advisor cue line when there is one. They are shown on `next=accept` too. `raiseAdvisorCue` and `noteFriction` keep their `refuted > 0` conditions.
9. **The resume text.** `reviewResumeText` takes an optional `misreported: readonly string[]`. When it is not empty, after the refuted rows and before the closing "Fix what is wrong" line it adds the line `These statements in your hand-back were wrong though the work there is right; change nothing in the work for them and state them correctly in your next hand-back:` followed by the rows. The autoEscalate send in `finalizeReview` passes the misreported rows.
10. **Left as it is.** `reviewerDeny` keeps its sentence (it names three labels; it is a refusal line, not the label list). `matchReview`, `reviewDue`, `reviewPlan`, the merge command and `bin/evidence.mjs` are not changed.
11. **Docs.** docs/review-and-merge.md: name the fourth label where the labels are listed, show the new End line, add a row or sentence to the "How it runs" table that a `misreported` count never changes `next=`, and add `misreported` (present only when above 0) where the ledger's `review` object is described. docs/internals.md: the same on its "A reviewer's line has" line. docs/guide.md: change it only if a sentence there lists the three labels. CHANGELOG.md: one bold-led entry under the existing `## Unreleased` section, in the style of the entry already there (add a `### Added` heading if you judge it an addition, else under `### Changed`).

## Tests

Node tests in the new file `tests/node/reviewlabel.node.mjs` (write them first; they are the red test):
- `parseReviewBlock`: a block with `misreported=2` gives `misreported` 2; a block with only the three old keys parses and has no `misreported` key; `misreported=two` parses and has no `misreported` key.
- `reviewRows` on a hand-back with one row of each of the four labels gives four rows in order; `misreportedRows` gives the one line, starting `misreported: `; `refutedRows` gives only the refuted line; a bulleted and a bold `misreported` row are read as the other labels' are.
- `reviewAdvice` with `refuted` 0 and `misreported` 3 is `accept`; with `refuted` 1 and `misreported` 3 and a worker with budget left it is `resume`.
- `reviewClause` and `reviewVerdictLine`: the two new forms above, and for `misreported` absent and 0 the exact text they give today.
- `reviewResumeText` with misreported rows holds the new line and the rows after the refuted rows; with none it equals today's text.
- The template file read from disk holds the misreported label line, the misreported row line and the new End line; `parseReviewBlock` of the template's own End line is still undefined.

Engine tests in `tests/review.test.ts`, two, built on the harness the file already has for a reviewer hand-back: (1) a reviewer hand-back with one `misreported:` row and a block `refuted=0 misreported=1` gives a verdict with `next=accept`, the misreported row on a line under it, and a ledger row whose `review.misreported` is 1; (2) a hand-back with one refuted and one misreported row and `refuted=1 misreported=1` still advises a resume and shows both rows, the refuted one first. Keep every other case in the node file: an engine test costs about 600 ms and a node test 1 ms.

An existing test that asserts the exact End line of the template or the exact text of `reviewKeys` may change its expected text to the new line. Change no other existing expectation; if another existing test fails, the code is wrong, not the test. Say in your hand-back which expectations you changed.

## Left to you

- The names of any private helpers, and the exact wording of the doc sentences and the changelog entry.
- Whether the misreported count reaches `reviewLine` by widening the counts object or by another small change in `hooks/lib/quiet.ts`.
- Where in `tests/review.test.ts` the two engine tests sit.

## Done when

- hooks/templates/review.md has four labels: confirmed, refuted (the work is wrong; something must change before merge), misreported (the work at the sha is right and a statement in the hand-back about it is wrong) and unverifiable; it says a refuted row must name what has to change and that a row with nothing to change is never refuted; its Rows section has a misreported line; its End line reads confirmed=N refuted=N unverifiable=N misreported=N
- The closing line the mod appends for a hand-back with a sha (reviewKeys in hooks/lib/review.ts) also ends with misreported=N
- parseReviewBlock reads an optional misreported=N: a whole number gives counts.misreported; a block without the key, or with a value that is not a whole number, is still a well-formed block and has no misreported key
- reviewRows reads a row that opens with misreported as label misreported; a new exported misreportedRows(text) returns those rows as lines the way refutedRows does; refutedRows never returns one
- reviewAdvice is decided by refuted alone: a review with refuted 0 and any misreported count is next=accept; a review with refuted above 0 advises as it does today
- reviewClause and reviewVerdictLine add the misreported count only when it is above 0; with none, their output is the same as before this card, so existing tests pass untouched
- finalizeReview in hooks/register.ts stores misreported in the review result on the attempt record and the ledger row when the block carries it, and shows every misreported row on its own line under the verdict row after any refuted rows, also when the verdict is next=accept; the advisor cue and the friction note still fire on refuted above 0 only
- reviewResumeText takes an optional list of misreported rows and, when it is not empty, adds them after the refuted rows under one line saying the work is right there and the statement should be corrected in the next hand-back; with none its text is the same as before this card; the autoEscalate send passes them
- The new node test file tests/node/reviewlabel.node.mjs covers the parser, the rows, the advice, the clause, the verdict line, the resume text and the template's two new lines; one engine test in tests/review.test.ts proves a reviewer hand-back with refuted=0 misreported=1 is next=accept with the misreported row shown and review.misreported 1 on the ledger row, and one proves refuted=1 misreported=1 still advises a resume
- docs/review-and-merge.md describes the fourth label, the new End line and that misreported rows never send the work back; CHANGELOG.md has one bold-led entry under the existing Unreleased section

## Review

Brain review (Fable 5.2): I read the whole diff at a821f6a. It builds the card's design and nothing beyond it. The template has the four labels and the rule that a refuted row is only for work that has to change; the parser takes an optional misreported count and still accepts a block without it; reviewAdvice is untouched, so refuted alone decides the next step. In finalizeReview the misreported rows are read whenever there is a block, the stored number is the block's count or else the rows read, and the rows are shown after the refuted rows and before the advisor cue, on accept as well. The cue and the friction note keep their refuted conditions. One thing the worker added that the card did not name: when a review has no attempt record (the path after a compaction), the ledger row now carries the review counts, where before it carried none. That closes a gap, and the engine tests depend on it, so I keep it. Two existing expectations changed, both the template's exact End line, as the card allowed. Not checked: the type-check, which the worker could not run (no tsc on PATH); the types in the diff read correct.
