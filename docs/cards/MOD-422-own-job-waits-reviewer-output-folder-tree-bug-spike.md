---
id: MOD-422
title: A worker waiting on its own job is not charged an attempt, a reviewer may read the card's output folder and gets the whole hand-back, and tree import takes bug and spike
domain: mod
tier: standard
status: merged
issue: 604
scope: [hooks/lib/waitstate.ts, hooks/lib/review.ts, hooks/lib/landtree.ts, hooks/register.ts, hooks/templates/review.md, tests/harness.ts, tests/*.test.ts, tests/node/*.mjs, CHANGELOG.md, docs/guide.md, docs/configuration.md, docs/review-and-merge.md]
forbid: [docs/cards/**, docs/spikes/**, docs/mockups/**, hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, docs/upgrading.md, bin/**]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/reviewhandback.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Three small changes were written and tried in another session, outside the card flow, and never ran through the gates. They are right in design and this card brings them in as written, tested and reviewed:

1. A worker that stops to wait on its own background job (a long gate run, a render, a queued lease) was charged an attempt: at the third pause, or at once when it said it was waiting but printed no pause line (it got a no-report row).
2. A reviewer could not read a card's output folder, so every claim about a rendered file was unverifiable, and it was given only the first 6,000 characters of the hand-back.
3. Tree import refused bug and spike items, which land takes.

## Before you start

- The whole change is the patch file .delegation/MOD-422/peer.patch in the main checkout (517 lines, 14 files). It was cut against this card's base and applies clean with git apply. Read it whole before applying it.
- hooks/lib/waitstate.ts: saysWaiting, extractPause, PAUSE_CAP, pauseRow and pauseCapLine, which the patch builds on.
- hooks/register.ts: finalizeOnce near the comment "MOD-226 (#270): a pause line and no report line is a pause", pausedHandback above it, and prepareReview near HANDBACK_CAP.

## Design (decided by the brain; build it, do not redesign it)

Apply the patch as it is, in two steps so the red test is real, then make the four edits below. Do not redesign what the patch does.

1. **Tests first.** In the worktree run git apply with --include='tests/*' on the patch, then run the red test command and keep its failing output as the red file. Then run git apply with --exclude='tests/*' on the same patch.
2. **One card id.** The patch labels its lines MOD-422, MOD-423 and MOD-424. In the lines the patch adds (comments, test names, describe names), change MOD-423 and MOD-424 to MOD-422. Change no label on a line the patch did not add.
3. **No private tool name.** The patch has an example reason that names a private tool in tests/waitstate.test.ts and the same name in a comment in hooks/lib/waitstate.ts. Change the example to "render lease queued" and the comment words to "a lease". The regex OWN_JOB stays as the patch has it.
4. **Changelog.** Add a new section ## Unreleased above ## 0.9.71, with ### Changed and these three entries, word for word, in this order:

~~~
- **A worker waiting on its own job is no longer charged an attempt: a pause whose reason names the worker's own job, build, render, bake, gate, tests or run, a lease, the GPU lock, a queue or the background (`waiting on my render`, `render lease queued`, `bench running in the background`) may pause up to 12 times in one attempt (or the repo's `pauseCap` when that is higher) before the cap charges it; any other pause keeps the cap of 3. A hand-back with no report and no pause line whose last paragraph says it waits on its own run (the MOD-418 reading) is now a pause with that reason, not a no-report charged as an attempt; a report line still wins over a wait sentence. The quiet line shows the cap that applied (`paused (4/11)`)** (MOD-422)
- **A reviewer may now read the card's output folder: when the brief has `outdir=`, the review prompt names the folder beside the tree and the brief (in the "label only what you can read" and "do not stray" rules) and tells the reviewer to ls and cat it and open its images with the Read tool, deciding a claim about a render or a sheet by opening the file it names and saying which; the reviewer guard still refuses every write. A brief with no `outdir=` gives the same prompt as before. The hand-back a reviewer is given is now cut at 40,000 characters instead of 6,000, and a cut copy ends with a line giving both lengths** (MOD-422)
- **`/delegation tree import` and the `tree_import` tool now take `bug` and `spike` items beside feature, epic, story and task, the same six types `/delegation land` takes; a bug or spike ranks with a task (it hangs under a story, feature or epic, and nothing hangs under it) and is filed with `--label type:bug` or `type:spike`. The counts line names bug and spike only when the plan has one, so a plan without them prints the same line as before** (MOD-422)
~~~

5. **Docs.** Three one-sentence edits, each stating only the new rule:
   - docs/configuration.md, the pauseCap row: a pause that waits on the worker's own job gets 12, or pauseCap when that is higher.
   - docs/guide.md, the paragraph that begins "A worker that must stop while its own background job runs prints a pause line": the same rule, and that a hand-back with no report and no pause line that says it is waiting on its own run is read as a pause.
   - docs/review-and-merge.md, the sentence with "cut at 6000 characters": say 40,000, and that the reviewer may read the brief's output folder when it has one, never write it.

Do not touch hooks/lib/version.ts, plugin.json, README.md or docs/upgrading.md: the release card does those.

## Tests

The patch carries them: tests/waitstate.test.ts (own-job reasons, the cap per reason, four own-job pauses uncharged, the twelfth charged, a report wins), tests/node/reviewhandback.node.mjs (the cut line, the 40,000 cap, reviewReadable, outdirRule, the template keys), tests/hooks4.test.ts (the reviewer prompt with and without outdir=), tests/landtree.test.ts (bug and spike parse, the counts line with and without them, the order rule, the six types in the error) and the edits to tests/harness.ts, tests/mergedverdict.test.ts, tests/node/templates.node.mjs and tests/node/landtree.node.mjs. Add one test to tests/waitstate.test.ts that the patch lacks: a hand-back with no report and no pause line whose last paragraph says it is waiting on its own background run gives a paused row and no no-report row.

If a test in the patch fails after the source part is applied, the fix belongs in the source the patch adds, kept as small as it can be; say what you changed and why in the hand-back.

## Left to you

- The wording of the three doc sentences.
- The text of the one added test.

## Done when

- The patch is applied whole, with the label, example and comment edits above, and nothing else in its files differs from it apart from a fix a failing test forced.
- No line in the diff holds the private tool name or the labels MOD-423 or MOD-424.
- CHANGELOG.md has the ## Unreleased section with the three entries word for word.
- The three doc sentences are in place.
- The added test passes, and the gates validate, node and test are green.

## Testing

- Planned: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/reviewhandback.node.mjs
- Red test: failed before the change (.delegation/MOD-422/red-1.txt)
- Gate validate: pass · ✔ Validation passed with warnings · 6 s · verify pass reused at merge
- Gate node: pass · 2220 pass, 0 fail, 1236 skipped (engine tests: claude plugin test runs them) · 20 s · verify pass reused at merge
- Gate test: pass · 2360 pass, 0 fail, Ran 2360 tests across 111 files. [184.48s] · 3.1 min · verify pass reused at merge
- Test files changed: 8 (tests/harness.ts, tests/hooks4.test.ts, tests/landtree.test.ts, tests/mergedverdict.test.ts, tests/node/landtree.node.mjs, tests/node/reviewhandback.node.mjs, tests/node/templates.node.mjs, tests/waitstate.test.ts); tests added: 17
- Worker ran:
  - node pure suite -> 2220 pass, 0 fail
  - `claude plugin test` -> 2360 pass, 0 fail
  - `claude plugin validate` -> passed with warnings

## Review

Brain review (Fable 5.2): the diff at 3b328b7 is the peer patch plus only the ordered edits (MOD-422 labels, the generic "render lease queued" example and "a lease" comment, one added foreground test, the three changelog bullets and three doc sentences). Verifier gates green (validate, node 2220, engine 2360). Reviewer: 15 confirmed, 0 refuted, 3 unverifiable, 2 misreported. Both misreported rows are the card's own wording, not the worker's: an own-job wait has a cap of 12, so it pauses 11 times and the twelfth is charged (the docs say "up to 12 times" / "gets 12"), and the rule matches "queued", not "a queue". The release card corrects those phrases. Nit, not changed: OWN_JOB matches bare gate, queued, lease and background, so some non-wait pauses get the higher cap.
