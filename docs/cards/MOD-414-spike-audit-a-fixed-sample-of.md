---
id: MOD-414
title: Spike: audit a fixed sample of reviewer refutes against the diffs they reviewed: how often the reviewer was right, about what, what followed and what it cost
domain: mod
tier: frontier
tier_reason: Judging a Sonnet reviewer's refutes with Sonnet shares its blind spots; the verdict sets the review policy for the next
status: merged
issue: 586
parent: 584
scope: [docs/spikes/MOD-414-findings.md]
forbid: [hooks/**, bin/**, tests/**, docs/cards/**, docs/mockups/**, .claude-plugin/**, README.md, CHANGELOG.md, docs/guide.md, hooks/lib/drive.ts, hooks/lib/brain.ts, hooks/register.ts, bin/evidence.mjs, tests/node/braincalls.node.mjs, tests/node/*.mjs, tests/*.test.ts, tests/fixtures/evidence/*.jsonl, docs/spend.md, docs/internals.md]
purpose: spike
findings: docs/spikes/MOD-414-findings.md
verdicts: [adopt, adapt, skip]
red_test: none
gate: findings
budget: 2-attempts
spend: 35
---
## Why

Issue #586. The reviewer refuted at least one claim on about half of the cards it read, and nobody has checked how often it was right or whether its refutes are about the work or only about the worker's report. A ledger review row keeps only the counts, so the claim text has to be read back from each reviewer's transcript. The answer decides whether every card should get a cheap review and how much weight a refute should carry in the next-step line.

## Questions

1. For each sampled refuted claim, which class is it: (a) right, and about a defect in the work itself (code, tests, docs or files at the reviewed sha); (b) right, but only about the worker's report (the work was correct; a statement in the hand-back was wrong or stale, such as a line number or a count); (c) right but trivial (nothing a person would want changed before merge); (d) wrong (the reviewer misread the diff, the card or the report)? Give the counts by class, then by repo letter and by worker tier, and the share of refutes that are class (a).
2. What followed each sampled review: the same worker was resumed and repaired it, the card merged as it stood, a later card repaired it, or nothing more happened? For the class (a) refutes, how many defects were fixed before merge, and for the class (d) refutes, what did the wrong refute cause (a resume, a hand check, nothing)?
3. What did the sampled reviews cost: the reviewer's own dollars, the dollars of the worker attempts that followed on the same task until its next consistent verdict or merge, and the brain's dollars where two brain stamps of one session bracket it (say unknown where they do not)? Give dollars per class (a) refute found.
4. What do the class (b) and class (d) refutes have in common, and which lines of the reviewer's brief template or of the mod's handling of a refute produce them? Name the smallest changes that would remove them without losing class (a) refutes.
5. Should every consistent card get a review by an economy-tier reviewer, where today a card is reviewed only when the repo's review setting asks for it at that tier? (verdict)

The (verdict) words: adopt means review every consistent card with an economy reviewer as the default; adapt means do it with a named change (a different trigger, tier or template); skip means leave the review setting as it is.

## Before you start

- How a review is asked for and read: hooks/templates/review.md (the reviewer's brief), hooks/lib/review.ts (`reviewRows`, `refutedRows`, `shownRefuted`, `reviewDue`), and docs/review-and-merge.md. Cite these by `path:line` when an answer talks about the mechanism; every answered question needs at least one such citation for the findings gate.
- The ledgers: one `.delegation/ledger.jsonl` in each folder one level under `~/Documents` (the same set `node bin/evidence.mjs --scorecard --all ~/Documents` reads). A review row has `verdict` equal to `reviewed`, `review: { confirmed, refuted, unverifiable }`, `task`, `attempt`, `tier` (the worker's tier), `agentId`, `usd`, `at` (epoch ms, sometimes a string) and `next`.
- The claim text is not in the ledger. It is in the reviewer's transcript: `~/.claude/projects/*/*/subagents/agent-<agentId>.jsonl`. Each line is JSON; the reviewer's rows are in the `input` of its last `tool_use` block named `SubagentHandback` (an `assistant` line), one row per line starting `confirmed:`, `refuted:` or `unverifiable:`. Where there is no such block, read its last assistant text block. The transcripts are large: pull the rows out with a script, do not read a transcript whole.
- The diff that was reviewed: the nearest earlier ledger row of the same task that carries a `sha`. Read it with `git -C <that repo> show <sha>` and `git -C <that repo> diff <base>...<sha>`. Where the sha is gone, find the merged commit by its subject, which starts with the task id.
- The worker's hand-back that the reviewer judged is in the worker's own transcript (the earlier row's `agentId`), in the same `SubagentHandback` form.

## Sample

Fixed before you look at any claim, so it cannot be chosen:

1. The population is every review row with `review.refuted` above 0 and `at` below 1795651200000, across all the ledgers.
2. Letter the repos A, B, C and on by their count of such rows, largest first (ties: the repo whose first such row is earlier). Say which letter is this repo; name no other.
3. Within a repo, rank its rows by `at`, 1 for the earliest. With `n` rows in a repo, take `m` of them: `m` is `n` when `n` is 1 or 2, else the larger of 2 and `n / 9` rounded up. Take the rows of rank `floor(k * n / m) + 1` for `k` from 0 to `m - 1`. On the counts at the time this card was written (97, 68, 19, 15, 5, 3, 2, 1) that is 31 rows.
4. In each sampled row, audit its first two `refuted:` rows as the reviewer wrote them (one, when it has one).
5. A sampled row whose claim text or diff cannot be recovered stays in the table as `not recoverable`, with why. Do not replace it.

The findings file holds one table of the sample, a line per audited claim: the sample id `<letter>-<rank>`, the claim's position (1 or 2), the worker's tier, the class (a, b, c or d), a description of the claim in general words, what followed, and the review's dollars. Give the population and sample counts per letter above the table.

## Rules for this spike

- Read only. Change no file except the findings file. In the other repos run only git commands that read (`show`, `log`, `diff`, `cat-file`, `rev-parse`): no fetch, checkout, stash or worktree command. Make no network call.
- This repo is public and the others are not. The findings file, your hand-back and any commit message name the other repos only by letter and the sampled rows only by `<letter>-<rank>`. They carry no code, file path, identifier, task id, card title, person or product name, or quoted claim text from any repo but this one. Describe a claim in general words, such as "a line number in the report was off by seven" or "the reviewer said a test was missing; it is in the diff". For rows of this repo you may quote and cite freely.
- Class each claim by reading the diff and the files at the reviewed sha yourself, not by what happened next. A refute that led to a repair is not for that reason right. Where you cannot decide between two classes, give the lower-value one (c before a, b before a) and mark it `⚠ Unverified:` with why.
- Keep the figures honest about their size: 31 rows is a sample. Give counts beside every percent, and say which per-letter figures rest on fewer than five claims.
- `## Decisions this implies` names each build card to cut, one line each, in the order to run them, and marks any decision that is the maintainer's to make as `Ben:`, with your recommendation.
- Scripts and notes go in the brief's scratch folder, never in a repo.

## Done when

- docs/spikes/MOD-414-findings.md answers the five questions as the findings gate checks them, and holds the sample table described under Sample
- The file names repos only by letter and sampled rows only by `<letter>-<rank>`, and holds no code, path, identifier, task id, card title or claim text from any repo but this one
- No other file changes, in this repo or any other

## Review

Brain review (Fable 5.2): I read the findings file whole at the first sha and the diff of the second commit. The sample follows the card's rule (210 rows, 8 repos, 31 rows, 45 claims) and the counts, shares and dollar sums agree with the sample table. The verdict (adapt) follows from the evidence: all 445 reviews read frontier or premium work with a standard reviewer, so nothing here supports an economy reviewer on every card. The spike corrected one thing in my card: a review row's `tier` is the reviewer's tier, not the worker's. Three reviews ran. The first gave one refuted row that said in its own words it was no defect, so I did not resume on it and re-ran the verifier at the same sha. The second, given only the report line as the hand-back, found a real overreach: Q5 said 20 of 43 refutes each drove a resume or hand check that changed nothing, though the advice is per review. The worker's second attempt restated it per review (11 of 31 sampled reviews hold only report-only or wrong refutes; my own count from the table agrees), fixed the same overreach in Q4 change 1 (the new label helps 9 of 31 reviews), and put quoted phrases from other repos into general words. The third review confirmed 13 rows and refuted none; it notes the $3.20 of following worker dollars is a floor, since one row's later attempts carry no dollars. Limits I accept: the class calls for repos A to F and H rest on the worker's own reading of diffs and transcripts outside this repo, and nine claims are flagged Unverified in the file.
