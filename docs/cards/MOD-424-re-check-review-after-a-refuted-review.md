---
id: MOD-424
title: "After a refuted review, the review of a by-hand verify is a re-check: it reads the rows refuted before and the change since, not the whole card again"
domain: mod
tier: standard
status: merged
issue: 533
scope: [hooks/lib/review.ts, hooks/lib/attempts.ts, hooks/lib/quiet.ts, hooks/register.ts, docs/review-and-merge.md, CHANGELOG.md, tests/node/*.mjs, tests/*.test.ts]
forbid: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, docs/upgrading.md, hooks/templates/**, bin/**, docs/cards/**]
red_test: "node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/recheck.node.mjs"
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Issue #533. When a review refutes a row and the lead fixes it with a commit, the lead runs the dispatch tool with verify. The review that follows has only the report line, so the prompt tells the reviewer to check every Done-when statement of the card against the diff. On a long card each such review finds a new spot, and the loop does not end: the reporter paid for five reviews of one docs card. The review after a refuted review should check the rows refuted before and the change since, and nothing else.

## Before you start

- hooks/lib/review.ts: reviewHandback, handbackSection, HANDBACK_NOTE_REPORT_ONLY, ReviewMarker, reviewMarker, parseReviewMarker, ledgerLines, reviewClause.
- hooks/register.ts: prepareReview (builds the reviewer prompt), decideReview (reads the marker into the spawn record's review field), finalizeReview (reads the reviewer's hand-back, patches the review attempt record with patchReview, appends the ledger row with refutedLines).
- hooks/lib/attempts.ts: AttemptRecord, reviewsFor (a subtask's review records, oldest first).
- hooks/lib/quiet.ts: reviewLine, which ends on reviewClause.
- tests/node/reviewhandback.node.mjs and tests/node/reviewledger.node.mjs show how the pure functions are tested; tests/hooks4.test.ts has the engine test of a report-only review (search for handback=report-only).

## Design

Every decision here is made. Follow it as written.

1. **The review record keeps what it refuted.** AttemptRecord gains two optional fields: refutedLines (string array) and reviewedSha (string). In finalizeReview, the patchReview patch adds refutedLines: ledgerLines(rows) when rows is not empty (rows, the refuted rows read from the hand-back, not shown), and reviewedSha: spawn.review.sha when that is set. Do not write the record's existing sha field.

2. **recheckOf (new, pure, hooks/lib/review.ts).** Signature: recheckOf(reviews, sha), where reviews is a list of records with optional reviewedSha and refutedLines, oldest first, and sha is the sha now under review. It looks at the last record only. It returns { sha: that record's reviewedSha, lines: a copy of its refutedLines } when all of these hold, else undefined: the record has at least one refuted line; it has a reviewedSha; the sha now under review is not empty and is not the word HEAD in any case; the two shas are different by sameShaWord. An empty list gives undefined.

3. **recheckNote (new, pure, hooks/lib/review.ts).** recheckNote(recheck, worktree, sha) returns this text, with the three values put in and the refuted lines one per line at the end:

~~~
(Only the report line is available, and this is a re-check. An earlier review of this task, at <recheck.sha>, refuted the rows listed under "Refuted before", and the work has changed since. Do not audit the whole card again. Write rows for two things only. One: each row under "Refuted before". Read the work at this sha and write it as confirmed when the fault is gone, or as refuted when it is still there. Two: the change since that review, which `git -C <worktree> diff <recheck.sha> <sha>` shows. Write a refuted row only where that change itself breaks a Done-when statement of the card. Write no row about a part of the work that change does not touch, and no row about what the hand-back says or leaves out.)

Refuted before:
<line 1>
<line 2>
~~~

4. **handbackSection takes the note.** It gains an optional third parameter, note (a string). When the source is report-only and a note is given, that note stands where HANDBACK_NOTE_REPORT_ONLY stands today (note, an empty line, the text). In every other case the output is what it is today.

5. **prepareReview uses it.** After handed is computed: when handed.source is report-only, call recheckOf(reviewsFor(await loadAttempts($, spawn), spawn.subtask, laneOf(spawn)), input.sha). When it returns a value, pass recheckNote(value, worktree, input.sha) to handbackSection, and put recheck: value.lines.length on the marker. A hand-back with words of its own (source given or transcript) is reviewed as today.

6. **The marker says so.** ReviewMarker gains recheck (optional number). reviewMarker writes it last, after handback, as one word: recheck=<n>. parseReviewMarker reads it when it is a whole number of 1 or more, and ignores any other value. decideReview copies it to the spawn record's review field (add recheck there, optional number).

7. **The row says which kind of review ran.** reviewClause gains an optional second parameter, recheck (boolean). When true, the clause starts with the word re-check where it starts with the word review today (so "re-check: 1 confirmed, 0 unverifiable" and "re-check: no review block"). finalizeReview passes it for both the long text and the quiet row (reviewLine's input gains recheck, optional boolean, passed on to reviewClause), and the ledger review row gains recheck: <n> when the spawn record has it.

8. **Not in this card.** No option to force a whole-card review after a refuted one, and no change to what the merge tool accepts. Once a re-check ends with nothing refuted, the next review of the task is a whole review again, because the last record then has no refuted lines.

9. **Docs and changelog.**
   - docs/review-and-merge.md: in the paragraph that starts "The prompt is", after the sentence about the report line only, add one sentence saying that when the review before it refuted rows and the sha has changed, that review is a re-check: the prompt lists the rows refuted before and tells the reviewer to check those and the change since, and the row says re-check.
   - CHANGELOG.md: add a section at the top, above the 0.9.72 section, with the heading line "## Unreleased", then "### Changed", then this one bullet word for word:

~~~
- **After a refuted review, the review of a by-hand verify is a re-check, not a new audit of the whole card: when the last review of the task refuted rows and the verified sha is a different one, the reviewer's prompt lists those rows under "Refuted before" and tells the reviewer to write rows only for them and for the change since that review (`git diff <old sha> <new sha>`), so a fix made by the lead is checked as a fix. The reviewer's first line carries `recheck=<n>`, the row says `re-check:` where it says `review:`, and the ledger row carries `recheck`. A hand-back with words of its own, the same sha, or a last review that refuted nothing gives the whole review as before** (MOD-424, #533)
~~~

## Tests

- New file tests/node/recheck.node.mjs (the red test). Cover: recheckOf on an empty list; a last record with lines and a different sha (value returned, with the lines); a last record with no lines after an earlier one with lines (undefined); the same sha by short and long form (undefined); an empty sha and the word HEAD (undefined); a record with lines and no reviewedSha (undefined). recheckNote holds both shas, the worktree, the heading "Refuted before:" and each line. handbackSection with a note on report-only starts with the note; with a note on given or transcript it is unchanged; without a note it is unchanged. reviewMarker and parseReviewMarker round-trip recheck=2, and recheck=0 or recheck=x is ignored. reviewClause with recheck true starts with re-check.
- One engine test in tests/hooks4.test.ts, beside the report-only test: a refuted review at one sha, then a by-hand verify at another sha, gives a reviewer prompt whose first line ends with handback=report-only recheck=1]] and whose text holds "Refuted before:" and the refuted row, and does not hold the sentence "Take each Done-when statement of the card as one claim".
- Keep engine tests to that one; the logic is in the node tests.

## Left to you

- The names of local variables and the wording of test names.
- How the engine test sets up the refuted review, following the tests around it.

## Done when

- The red test fails before the source change and passes after it.
- A review after a refuted review, at a different sha and with only the report line, gets the re-check note in place of the report-only note, and its marker carries recheck=<n>.
- A review with a hand-back of its own, at the same sha, or after a review that refuted nothing, gets the same prompt as before this card.
- The review record keeps refutedLines and reviewedSha, and the ledger review row carries recheck when the review was a re-check.
- The quiet row and the long text say re-check for a re-check and review otherwise.
- The docs sentence and the changelog bullet are in.
- The validate, node and test gates are green.

## Review

Brain review (Fable 5.2): read the diff at 9440bf6. The design is as carded: review records keep refutedLines and reviewedSha; recheckOf looks at the last review only and needs refuted rows, a reviewed sha and a different sha now; the re-check note replaces the report-only note and ends with the rows under "Refuted before"; the marker carries recheck=<n> last, the clause and quiet row say re-check, the ledger review row carries recheck. No option to force a whole-card review, and nothing changes in what merge accepts. Eight files, all in scope. The worker's first two attempts were refuted on files because nothing was committed; the one red engine test was a fault in the new test (the reviewer of a by-hand verify is the first spawn, and the test makes one spawn itself), not in the source. Judged by a by-hand verify at 9440bf6: validate green, node 2238 pass, engine 2361 pass. Reviewer: 19 confirmed, 0 refuted, 4 unverifiable, 2 misreported (both are the worker's gate=fail claim, made before the verifier's full run showed green).
