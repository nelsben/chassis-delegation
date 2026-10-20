---
id: MOD-108
title: docs/contracts.md cut to under half: the brief, report and amend grammar kept verbatim, every field as one table row, the verifier's checks as a table
domain: mod
tier: frontier
status: merged
scope: [docs/contracts.md]
forbid: [CHANGELOG.md, README.md, hooks/**, bin/**, tests/**, .claude-plugin/**, docs/cards/**, docs/guide.md, docs/install.md, docs/configuration.md, docs/spend.md, docs/review-and-merge.md, docs/internals.md, docs/upgrading.md, docs/how-it-works.md, docs/evidence.md, docs/evidence/**]
red_test: none
gate: validate, node
budget: 2-attempts
spend: 25
---
## Why

contracts.md is 9,821 words, the longest doc after the changelog, and it is the page adopters and workers actually consult. Its grammar and field meanings must stay exact, but the prose around them repeats itself and narrates history. A field table and a check table say the same thing in a fraction of the length, and the flow is now drawn in docs/how-it-works.md.

## Done when

- docs/contracts.md is at most 4,500 words (wc -w).
- The three grammar lines (the [[brief ...]], [[report ...]] and [[amend ...]] templates) are kept character for character inside code blocks. Every field of each block, required or optional, has one table row: field, values, meaning, default, and what the verifier or dispatcher does with it. Before cutting, list every field name and every option value in the current text with grep; after, check each against the new text and put the counts kept in the report's metrics.
- How a report is verified becomes one table: check, what is compared against git, the outcome when it fails (consistent, unverified, refuted, no-report, refused) and the next= advice that follows. The narrative goes; link to docs/how-it-works.md#what-the-verifier-checks for the drawn flow.
- These headings keep their exact text, because other docs and the code link to them: the ones whose anchors are #the-contracts, #how-a-report-is-verified, #delegating-into-another-repo, #repohere-the-main-checkout, #exclusive-resources-and-fan-out and #research-cards. Other headings may merge or be renamed only if nothing in README.md or docs/*.md links to them (grep first).
- Every rule a worker or adopter must follow is still stated, once, in the imperative. A fact that is found nowhere else in docs/ stays, compressed. Examples are kept only where a rule cannot be read without one, at most one per section.
- No history in reference text: no card ids, no 'since 0.x', no 'used to', 'now' or 'renamed'. State what the contracts are today.
- The node suite passes, including its link and anchor check. No machine paths, user names, or product or customer names.

## Review

Reviewed by the brain. docs/contracts.md goes from 9,821 to 4,479 words. The brief, report and amend grammar lines are kept character for character in code blocks. Each block has a field table, one row per field (brief 21/21, report 11/11, amend 7/7), giving values, meaning, default and what the mod does with it; all 55 option values are kept. How a report is verified is one table: check, what is compared against git, the outcome, and next=. Attempt 2 closed three gaps found by checking that table against hooks/lib/verify.ts and verify-native.ts: the red row now covers the short marker-less file settled by the red test's run at the head; a line under the table gives the budget-exhausted stop advice verbatim; the gate-timeout and marker-less-red cases are in the unverified row. It also replaced a link to a spend.md heading that MOD-109 removed with a plain spend.md link. The worker found that the amend's v=1 and reason= are required (brief.ts treats a block without them as malformed), and now says so. The six linked headings keep their exact text. The long worked examples and a product name are gone; the resource example is generic. No history wording, no names, no machine paths.
