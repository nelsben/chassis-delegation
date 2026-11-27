# MOD-414 findings: an audit of a fixed sample of reviewer refutes against the diffs they reviewed

What a review is: a consistent hand-back is followed by one reviewer agent, one tier below the worker (`docs/review-and-merge.md:15`), when the repo's `review` setting asks for it at that worker tier (`hooks/lib/review.ts:125`, default `on-frontier`, `docs/review-and-merge.md:13`). The reviewer gets `hooks/templates/review.md`, labels each factual claim of the hand-back `confirmed`, `refuted` or `unverifiable` (`hooks/templates/review.md:11-15`), and any refuted row sends the worker a resume while the budget lasts, else a check by hand (`hooks/lib/review.ts:262-270`).

How the sample was drawn (the card's rule, run before any claim was read): every ledger review row with `review.refuted` above 0 and `at` below 1795651200000, across every repo's ledger on this machine that has any. That is 210 rows. Ranked within each repo by `at`, then `m = max(2, ceil(n / 9))` rows taken at rank `floor(k * n / m) + 1`. The counts match the card's (97, 68, 19, 15, 5, 3, 2, 1), which gives 31 rows and 45 audited claims (the first two `refuted:` rows of each). Claim text was read from each reviewer's `SubagentHandback` in its transcript. All 31 had one. The reviewed diff is the nearest earlier ledger row of the same task that carries a `sha`. Where that sha was gone, I used the commit whose subject starts with the task id. **This repo is G.**

| Letter | Population (refuted > 0) | Sampled rows | Audited claims |
| --- | --- | --- | --- |
| A | 97 | 11 | 16 |
| B | 68 | 8 | 11 |
| C | 19 | 3 | 5 |
| D | 15 | 2 | 3 |
| E | 5 | 2 | 3 |
| F | 3 | 2 | 2 |
| G (this repo) | 2 | 2 | 4 |
| H | 1 | 1 | 1 |
| **All** | **210** | **31** | **45** |

Classes: (a) right, and about a defect in the work; (b) right, but only about the worker's report; (c) right but trivial; (d) wrong. A claim about the report alone is (b) even when it is also trivial. A claim about the work that nobody would want changed before merge is (c). In this table, "Review $" is the dollars on the reviewer's own row. Every worker in the sample was frontier tier.

| Sample | Claim | Worker tier | Class | The claim, in general words | What followed | Review $ |
| --- | --- | --- | --- | --- | --- | --- |
| A-1 | 1 | frontier | b | A test count in the report was one too high: the file has 22, the report said 23 | Same worker resumed and corrected the report; landed | 0.20 |
| A-9 | 1 | frontier | not recoverable | The work was never committed, its worktree is gone, and the recorded sha is the base | Same worker resumed and was reviewed again; the task was closed without landing | 0.67 |
| A-9 | 2 | frontier | not recoverable | As above | As above | 0.67 |
| A-18 | 1 | frontier | b | A new-test count in the report: it said 13, the diff adds 11 | Same worker resumed and corrected the report; landed | 0.25 |
| A-27 | 1 | frontier | b | A depth figure in the report was a different measure: height above a surface, not depth below it | Check by hand (budget spent); the lead accepted; landed as it stood | 0.32 |
| A-27 | 2 | frontier | b | A percentage in the report came from other poses than the one it named | As above | 0.32 |
| A-36 | 1 | frontier | a | A committed data file credited two thresholds to the wrong earlier task | Resume advised; the lead accepted, fixed the credit by hand, then landed | 0.51 |
| A-36 | 2 | frontier | c | The same file credited two figures to an earlier task whose file does not hold them; the card's text is the only source | As above | 0.51 |
| A-45 | 1 | frontier | c | A doc table's p95 column holds the worst frame's p95 next to a mean-over-frames column, and the label does not say so | Check by hand; the lead relabelled the column by hand at landing | 0.56 |
| A-53 | 1 | frontier | b | The report read a 13 % pixel difference as a difference in one region; most of it is a broad one-level shift | Resume advised; the lead accepted; landed as it stood | 0.76 |
| A-62 | 1 | frontier | b | The report gave one bound for every score, and one score exceeds it by 0.0001 | Check by hand; landed as it stood | 0.40 |
| A-62 | 2 | frontier | c | A doc gave a range as 84-95 % where its own table gives 83-96 % | As above | 0.40 |
| A-71 | 1 | frontier | d | Said the hand-back lacked the forbid-lift amend line. The worker's hand-back has it; the copy the reviewer was given did not | Check by hand (budget spent); landed as it stood | 0.36 |
| A-80 | 1 | frontier | c | A doc sentence said one region's counts equal the control's; its own figures show one fewer at two poses | Check by hand; the lead reworded it by hand at landing | 0.40 |
| A-89 | 1 | frontier | a | A trace doc said one guard holds a point at its floor; the probe output shows the guard alone leaves it where it was | Resume advised; the lead accepted and fixed the doc by hand 6 minutes after the worker's commit landed | 0.44 |
| A-89 | 2 | frontier | a | The same doc said no step puts the surface inside the body with the guard on; stages with the guard on still do | As above | 0.44 |
| B-1 | 1 | frontier | b | The report said each new method only delegates; two also do their own work (the hand-back lists both elsewhere) | Same worker resumed; merged | 0.33 |
| B-1 | 2 | frontier | b | The report said each test checks serialization; 6 of 9 do, which meets the card | As above | 0.33 |
| B-9 | 1 | frontier | b | The report said every relative link resolves; 14 do not, by design per the card | Check by hand, then resumed anyway; merged | 1.23 |
| B-9 | 2 | frontier | c | A doc diagram quoted an error message with a fixed word where the code inserts a title | Same worker fixed it in that resume; merged | 1.23 |
| B-18 | 1 | frontier | a | A doc widened a claim to say every answer in a preview run took one path; several preview answers never took it | Check by hand; the lead fixed it by hand (a `--verify` run), re-reviewed; merged | 0.73 |
| B-26 | 1 | frontier | b | The report said the visible layout did not change; against the base, one visible label was removed (it came from unfinished earlier work) | Check by hand; the lead explained it by hand in the doc, re-reviewed twice; merged | 0.19 |
| B-35 | 1 | frontier | c | A research doc called one session the oldest of eight open; its own timeline puts four sessions before it | Check by hand, then resumed; fixed; merged | 0.33 |
| B-43 | 1 | frontier | c | A script header and a doc disagreed on whether a count is exact or a floor | Check by hand, then resumed; header fixed; merged | 0.51 |
| B-52 | 1 | frontier | c | A doc sentence said four public links where the section holds six | Check by hand, then resumed; reworded; merged | 0.32 |
| B-60 | 1 | frontier | a | A README promised that a capture run fails when it cannot frame its still; only one of four scripts can fail that way | Check by hand, then resumed; README fixed; merged | 0.45 |
| B-60 | 2 | frontier | c | The same README's list of what writes rows left out one script's model call | As above | 0.45 |
| C-1 | 1 | frontier | c | A protocol row holds a setup step done by a second actor, where the hand-back said each row has one actor | Same worker resumed over several rounds; merged | 0.38 |
| C-1 | 2 | frontier | b | The report said a doubt marker sits on a fact; the doc states no such fact | As above | 0.38 |
| C-7 | 1 | frontier | b | Line numbers cited in the report were off; the content is there | Same worker resumed twice; merged | 0.41 |
| C-13 | 1 | frontier | d | Refuted the report's statement that one file had not been written, because the file existed when the reviewer looked; it was written after the hand-back, not by the worker | Resume advised; no later row of the task | 0.55 |
| C-13 | 2 | frontier | c | Line cites in a findings file held only at an older commit, and the hand-back said so | As above | 0.55 |
| D-1 | 1 | frontier | a | A spike doc went in with two unfilled placeholder sections, where the measurements the card asked for belong | Check by hand; a fresh attempt on the same task filled them; merged | 0.28 |
| D-1 | 2 | frontier | b | The report said a device run passed; the only finished run failed at the parent commit, and the run at the sha never finished | As above | 0.28 |
| D-8 | 1 | frontier | c | A doc said a test changed only its waits; the diff also flips two assertions (the card's amend allowed that) | Same worker resumed and fixed the doc; merged | 0.49 |
| E-1 | 1 | frontier | a | A proof run's screenshot shows missing-image placeholders, and neither the doc nor the report mentions them | Same worker resumed, fixed the state and added a detector; merged | 0.51 |
| E-3 | 1 | frontier | a | The report said an unreadable guard adds no names. One code path adds its text whenever another guard on the same entry agrees | Check by hand, then resumed; code fixed; merged | 0.28 |
| E-3 | 2 | frontier | c | A code doc comment still described the old rule after the report's wording was fixed | As above | 0.28 |
| F-1 | 1 | frontier | d | Said the hand-back gave no republish statement or per-view notes. The worker's hand-back gives the statement and points at the first hand-back's notes; the reviewer was given the report line alone | Check by hand; merged as it stood | 0.35 |
| F-2 | 1 | frontier | b | The report's visual-change note gave an outline's old width wrong; only a chip border changed | Resume advised; the lead accepted; merged as it stood | 0.18 |
| G-1 | 1 | frontier | a | The card's move of the `gateTimeoutMinutes` table default from 9 to 30 (`docs/cards/MOD-229-the-verifier-s-gate-runs-with.md:23`) was not in the diff: `hooks/lib/configtable.ts:33` at b208687 still reads 9 | Same worker resumed and moved it (c1d8e27); merged | 0.31 |
| G-1 | 2 | frontier | d | "the hand-back is only the report line, with no limits list and no answer to (b)". The worker's hand-back at b208687 gives both; the reviewer was given the report line only | As above | 0.31 |
| G-2 | 1 | frontier | c | The field comment at `hooks/lib/repoconfig.ts:91` at c1d8e27 still read "whole minutes (1 to 10) … unset = 9" | Check by hand; the budget was raised and the worker resumed; comment fixed (544f688); merged | 0.20 |
| G-2 | 2 | frontier | b | The line numbers in the report's limits list were the card's approximate ones, off by 7 to 69 at the sha (`DEFAULT_GATE_TIMEOUT_MS` is at `hooks/lib/verify-native.ts:201` at c1d8e27, not 194) | As above | 0.20 |
| H-1 | 1 | frontier | b | A file's line count in the report was off by one | Same worker resumed and corrected it; merged | 0.17 |

⚠ Unverified: A-27 (both claims), A-53 and A-62 claim 1. The files that decide them were in the worker's untracked tree or output folder, and that is gone. I read the reviewer's own command output in its transcript, not the files. All four are report statements whose figures are not in the committed diff, so they are (b) or (d), and they are given (b).

⚠ Unverified: A-45 and A-89. The log and probe lines sit outside git. I read them as the reviewer's commands printed them in its transcript. My own recomputation from those lines matches the reviewer: the p95 column equals the largest per-frame p95 (0.138 / 0.335 / 0.639), not their mean (0.123 / 0.298 / 0.569).

⚠ Unverified: E-1. The screenshot is outside git and I could not view it. The class rests on the reviewer's description and on the committed plan file setting the name the reviewer named.

⚠ Unverified: A-36 claim 2 and C-13 claim 2 could be (a) or (c); each is given (c).

⚠ Unverified: C-13 claim 1 is (d) because the file's write time is after the hand-back. Who wrote it is not recorded.

## Q1

Counts by class, over the 43 claims that could be classed (2 are not recoverable):

| Class | Claims | Share |
| --- | --- | --- |
| (a) right, a defect in the work | 9 | 21 % (9 of 43) |
| (b) right, the report only | 16 | 37 % (16 of 43) |
| (c) right but trivial | 14 | 33 % (14 of 43) |
| (d) wrong | 4 | 9 % (4 of 43) |

By repo letter (claims classed; D, E, F, G and H rest on fewer than five claims each, and C on exactly five, so none of their rows supports a rate):

| Letter | Classed | a | b | c | d | Not recoverable |
| --- | --- | --- | --- | --- | --- | --- |
| A | 14 | 3 | 6 | 4 | 1 | 2 |
| B | 11 | 2 | 4 | 5 | 0 | 0 |
| C | 5 | 0 | 2 | 2 | 1 | 0 |
| D | 3 | 1 | 1 | 1 | 0 | 0 |
| E | 3 | 2 | 0 | 1 | 0 | 0 |
| F | 2 | 0 | 1 | 0 | 1 | 0 |
| G | 4 | 1 | 1 | 1 | 1 | 0 |
| H | 1 | 0 | 1 | 0 | 0 | 0 |

By worker tier, all 43 classed claims are frontier (9 a, 16 b, 14 c, 4 d), so the tier split shows nothing. That is not a quirk of the sample. Of all 445 review rows below the cutoff, 442 reviewed a frontier worker, 1 a premium worker and 2 a worker whose tier is not recorded. 444 reviewers ran at standard and 1 at frontier, and none at economy. That fits the default, where `on-frontier` reviews only frontier and premium attempts (`hooks/lib/review.ts:125`) with a reviewer one tier below (`docs/review-and-merge.md:15`).

⚠ Conflict: the card says a review row's `tier` is the worker's tier. In all 31 sampled rows it is the reviewer's tier (standard), and the reviewed rows of the same tasks say frontier. Here, the worker's tier was read from the reviewed row.

The share of refutes that are class (a) is 21 % (9 of 43). Most sampled reviews hold no class (a) claim among their first two refutes: 23 of 31 rows (74 %), A-9 among them as not recoverable. Only 8 of 31 rows (26 %) hold one. About half of all reviews refute something: 210 of 445 (47 %).

## Q2

What followed each of the 31 sampled reviews (read from the task's later ledger rows and the commits whose subject names the task):

| What followed | Rows |
| --- | --- |
| The same worker was resumed and repaired it, then merged | 16 |
| The same worker was resumed, then the task closed without landing (A-9) | 1 |
| A fresh attempt on the same task repaired it (D-1) | 1 |
| The lead repaired it by hand, then or right after landing | 6 |
| Merged or landed as it stood | 6 |
| Nothing more recorded (C-13) | 1 |
| A later card repaired it | 0 found |

Of the 31 rows, 15 gave `next=resume` and 16 gave `check by hand` because the budget was spent (`hooks/lib/review.ts:265-268`). On 7 of those 16, the brain raised the budget and resumed anyway.

⚠ Unverified: "a later card repaired it" was checked only against commits that name the same task. A later card under another id could have changed the same text.

The 9 class (a) refutes:

- 7 were fixed before merge. The worker fixed 4 of them on a resume (B-60, E-1, E-3, G-1), a fresh attempt fixed 1 (D-1), and the lead fixed 2 by hand (A-36 by a commit before landing; B-18 by a commit verified with `--verify`).
- 2 (both from A-89) were fixed by the lead by hand in a commit 6 minutes after the worker's commit landed.
- None was left unfixed.
- 4 of the 9 needed the lead's own hands rather than the worker's.

What the 4 class (d) refutes caused:

- A-71: a check by hand, because the budget was spent, then the lead landed it as it stood.
- F-1: a check by hand, then it merged as it stood.
- G-1 claim 2: nothing of its own. It rode on the same resume that the class (a) claim G-1 claim 1 justified anyway.
- C-13 claim 1: a resume advised together with two other refutes, after which no row of the task was recorded.

## Q3

What it cost, per sampled review row (the table above has each review's own dollars):

- **The reviewer's own dollars:** $13.08 over the 31 reviews, a mean of $0.42. Over all 445 reviews below the cutoff, $177.91, a mean of $0.40.
- **Worker attempts that followed on the same task until its next consistent verdict, the brain's accept, or a merge:** $26.81 over the 31. Of that, $17.10 is D-1's fresh attempt. The other 30 rows total $9.71. 16 rows show $0. In 13 of them, no worker ran after the review. In the other 3 (B-9, B-52, B-60), the resume row carries no `usd`, so it counts as $0.
- **The brain's dollars:** known for 17 of the 31 rows, where two stamps of one session (same `brain.since`, read the way `bin/evidence.mjs:81` and `bin/evidence.mjs:265-270` read them) bracket the stretch from the last stamp before the review to the first stamp at or after the window's end. That is $33.25 over those 17, a mean of $1.96. The other 14 are unknown. 11 have no brain stamp before the review: A-1, A-9, A-18, A-27, A-36, D-1, F-1, F-2, G-1, G-2 and H-1. 3 have no later row to end the window: A-62, A-71 and C-13.

⚠ Unverified: the brain's bracket counts every brain turn between the two stamps, and that can include work on other tasks, so the $33.25 is an upper figure for those 17 rows.

Dollars per class (a) refute found (9 in the sample):

| What is counted | Dollars | Per class (a) refute |
| --- | --- | --- |
| Reviewer only | $13.08 | $1.45 |
| Reviewer plus the worker attempts that followed | $39.89 | $4.43 |
| Same, without D-1's fresh attempt | $22.79 | $2.53 |
| The brain, known rows only (17 of 31) | $33.25 | not comparable (14 rows unknown) |

These figures rest on 9 class (a) claims, and only the first two refutes of each review were audited (7 of the 31 had a third or fourth), so the per-refute cost is a rough ceiling, not a measurement.

## Q4

**What the 16 class (b) refutes have in common.** Every one is a statement in the hand-back that is wrong while the work at the sha is right. There are three kinds:

- 8 are a number in the report that is off: test counts, line numbers, a line count, a bound or a figure (A-1, A-18, A-27 ×2, A-62 claim 1, C-7, G-2 claim 2, H-1).
- 4 are a statement about all cases (all of a set, or no change at all) that one case breaks (B-1 ×2, B-9 claim 1, B-26).
- 4 are a summary that reads more into the evidence than it holds (A-53, C-1 claim 2, D-1 claim 2, F-2).

**What produces them.** The template asks for "every factual claim the hand-back makes" (`hooks/templates/review.md:11`), one row each (`hooks/templates/review.md:12`). It has one label for a false claim, whether the falsehood is in the work or in the report (`hooks/templates/review.md:14`). The mod then treats every refuted row alike. Any refuted row means a resume, or a check by hand (`hooks/lib/review.ts:262-270`). The resume text asks the worker to "correct the report where the claim was only misworded" (`hooks/lib/review.ts:280`), so a wrong count costs an attempt from `budget=` and another review (`docs/review-and-merge.md:43`). The parser has no way to tell the two apart (`hooks/lib/review.ts:88`, `hooks/lib/review.ts:107`).

**What the 4 class (d) refutes have in common.** 3 of the 4 judged a hand-back that is not the one the worker wrote:

- In F-1 and G-1 claim 2, the reviewer's prompt held only the `[[report …]]` line under "## The hand-back", where the worker's `SubagentHandback` ran to 3,459 and 5,152 characters.
- In A-71, the prompt held a shorter, reworded copy that had lost the `[[amend …]]` line the worker wrote.
- The prompt's hand-back is `input.text`, cut at 6,000 characters (`hooks/register.ts:10891`, `hooks/register.ts:10931`). The mod has a reader for the worker's transcript hand-back (`workerText`, `hooks/register.ts:6193`), but the reviewer is not given what it returns.
- The template never says what to do when the hand-back is only the report line (`hooks/templates/review.md:36-37`). So the reviewer rebuilt the claims from the card's done-when list and refuted that the hand-back made them.

The fourth (C-13 claim 1) judged a file as it stood after the hand-back. With `sha=HEAD`, the template sends the reviewer to the live tree (`hooks/templates/review.md:8`) and never says to judge as of the hand-back.

⚠ Unverified: which path filled `input.text` with the report line alone, or with the reworded copy, for those three runs. One path that passes a report line alone is the `--verify` path, which finalizes with a synthetic report (`hooks/register.ts:9475`). The spawn records do not say which path ran.

**The smallest changes that remove them and keep the 9 class (a) refutes:**

1. **Report-only refutes get their own label.** In `hooks/templates/review.md`, keep `refuted:` for a defect the diff or a file at the sha shows. Add `misreported:` for a wrong count, line number, all-cases statement or summary in the hand-back when the work is right. Parse it in `hooks/lib/review.ts:88`. In `reviewAdvice` (`hooks/lib/review.ts:262`), misreported rows alone give `next=accept`, with the rows shown under the verdict (and copied into the card's Review section at merge), not a resume. All 9 class (a) claims are about the work at the sha, so none would move to the new label. The advice is per review, not per claim, so this helps only a review whose refutes are all misreported. That is 9 of the 31 sampled reviews (29 %): A-1, A-18, A-27, A-53, B-1, B-26, C-7, F-2 and H-1, and every refute in each of them was audited. Those 9 hold 11 of the 16 class (b) claims. The other 5 class (b) claims (A-62 claim 1, C-1 claim 2, D-1 claim 2, G-2 claim 2, B-9 claim 1) share a review with a class (a) or (c) refute, which would still resume.
2. **The reviewer reads the worker's real hand-back.** In `prepareReview` (`hooks/register.ts:10899`), when `input.text` is no longer than the report block, fill `{{handback}}` from the transcript's `SubagentHandback` (`workerText`). Add one template line: "Refute only what you can read. Check the card's done-when against the diff, and refute an item the diff lacks. Never refute that the hand-back says or leaves out something you cannot see; that is unverifiable." That keeps G-1 claim 1, which was a done-when item missing from the diff, and removes A-71, F-1 and G-1 claim 2.
3. **Judge `sha=HEAD` as of the hand-back.** In `hooks/templates/review.md:8`, add: "a file written after the hand-back is unverifiable, not refuted." That removes C-13 claim 1.

The 14 class (c) rows also drive resumes, and that same label is the one (a) rows arrive under. The template's only filter is "Judge the claims, not the style" (`hooks/templates/review.md:17`). A rule to leave out trivial rows risks losing class (a) refutes. I name no change for them here.

## Q5

Verdict: adapt

The case for more review:

- On frontier cards, a standard reviewer found 9 real defects in the work in 31 reviews (21 % of the 43 refutes classed). 7 were fixed before merge.
- The cost was $1.45 of review dollars per real defect, or $4.43 with the worker attempts that followed (Q3).

The case against turning it on by default:

- The sample holds no evidence for an economy reviewer, and none for cards below frontier. All 445 reviews ran at standard or frontier and read frontier or premium work (Q1). That follows from `on-frontier` (`hooks/lib/review.ts:125`, `docs/review-and-merge.md:13`).
- 20 of the 43 classed refutes (47 %) are class (b) or (d), 16 and 4 respectively. That is a share of claims. The mod's advice is per review (`hooks/lib/review.ts:262-270`), and many of those claims share a review with a class (a) or (c) refute.
- Per review, 11 of the 31 sampled reviews (35 %) hold only class (b) or (d) refutes: A-1, A-18, A-27, A-53, A-71, B-1, B-26, C-7, F-1, F-2 and H-1. Each of them still sent the work back or to the lead:
  - 7 got resume advice. In 5 the same worker was resumed, then merged (A-1, A-18, B-1, C-7, H-1). In 2 the lead accepted and it landed as it stood (A-53, F-2).
  - 4 got a check by hand. In 3 it landed as it stood (A-27, A-71, F-1). In 1 the lead added an explanation to the doc by hand (B-26).
  - Those 11 reviews cost $3.53 in review dollars and $3.20 in worker attempts after them. None of them found a defect in the work.
- Only the first two refutes of each review were audited, and 7 of the 31 had more. So a review counted here as (b)/(d)-only could in principle hold a later refute of another class. None of the 11 had more than two refutes, so all of theirs were read.

So "adopt" (every consistent card, an economy reviewer, as the default) is not supported, and "skip" throws away a stage that pays on frontier work. The named change: first separate report-only refutes and give the reviewer the real hand-back (Q4, changes 1 to 3). Then trial `"review": "on"` in one repo, which already puts an economy reviewer on standard cards (`docs/review-and-merge.md:12`, `docs/review-and-merge.md:15`). Re-run this audit on those economy reviews before any default changes.

## Decisions this implies

- Cut a build card: give report-only errors a `misreported:` label in `hooks/templates/review.md`, parse it in `hooks/lib/review.ts`, and have `reviewAdvice` accept, with the rows shown, when a review holds only misreported rows (Q4 change 1).
- Cut a build card: when the text given is only the report block, fill the reviewer's `{{handback}}` from the worker's transcript `SubagentHandback`. Add the template lines "never refute what the hand-back says or leaves out that you cannot see" and "with sha=HEAD, a file written after the hand-back is unverifiable" (Q4 changes 2 and 3).
- Cut a build card: have the review ledger row carry the worker's tier under its own key, next to `tier` (which is the reviewer's), and the refuted rows' text, cut, so the next audit needs no transcripts. Correct the card template's note that `tier` is the worker's.
- Ben: whether to trial `"review": "on"` (an economy reviewer on standard cards) in one busy repo for two weeks once the first two cards land, then re-run this audit on those reviews. Recommendation: yes. Until then, keep `on-frontier` as the default.
