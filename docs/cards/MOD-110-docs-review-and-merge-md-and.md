---
id: MOD-110
title: docs/review-and-merge.md and docs/internals.md cut to half, and three errors in docs/how-it-works.md fixed
domain: mod
tier: standard
status: merged
scope: [docs/review-and-merge.md, docs/internals.md, docs/how-it-works.md]
forbid: [CHANGELOG.md, README.md, hooks/**, bin/**, tests/**, .claude-plugin/**, docs/cards/**, docs/guide.md, docs/install.md, docs/contracts.md, docs/configuration.md, docs/spend.md, docs/upgrading.md, docs/evidence.md, docs/evidence/**]
red_test: none
gate: validate, node
budget: 2-attempts
spend: 10
---
## Why

review-and-merge.md is 2,392 words and internals.md 3,686; the merge path is a short checklist that is buried in prose, and internals repeats what the code comments say. docs/how-it-works.md shipped with three errors the review caught: a spent budget advises stop and raising budget=, not checking by hand; the red check also accepts a short file with no marker; and diagram 4 sends the card-tool call to a participant labelled as the dispatch tool.

## Done when

- docs/review-and-merge.md is at most 1,200 words and docs/internals.md at most 1,800 (wc -w). Both read as reference: numbered checklists for procedures, tables for parts and files, sentences under 25 words, no paragraph over 4 lines.
- review-and-merge.md gives the merge as one numbered checklist, in the order the merge tool prints it (review, leak check of the PR body, push, PR create, PR merge, finish, delete the branch, and the release extras), plus one table of what the review must check. Every command, tool, option and file path the current text names still appears (a table row is enough); list them with grep before cutting and put the counts kept in the report's metrics.
- internals.md keeps one table of the parts (file or folder, what it does) and the '## Evidence' section. Every file path, hook name, store and environment variable the current text names still appears; same grep check and metrics.
- These headings keep their exact text, because other docs link to them: in review-and-merge.md the ones whose anchors are #review and #merging-a-card; in internals.md #without-the-engine-two-settingsjson-hooks and #evidence. Other headings may merge or be renamed only if nothing in README.md or docs/*.md links to them (grep first).
- docs/how-it-works.md: (1) wherever a spent attempt budget is described, the advice is next=stop and raising budget= in the brief, after which the ladder resumes and the brief is re-read; nothing says 'check by hand' for that case. (2) The red check's description says it accepts the evidence file when it holds the failing run's marker, or when it is a short file with no marker. (3) In diagram 4 the card tool call goes to a participant named for the card tool (rename or add the participant; keep the diagram at 7 participants or fewer), and the numbered walkthrough under it matches. Confirm each against the code in hooks/ before writing it; if the code says otherwise, follow the code and say so in the report.
- A fact found nowhere else in docs/ stays, compressed. No history in reference text: no card ids, no 'since 0.x', no 'used to' or 'now'.
- The node suite passes, including its link and anchor check. No machine paths, user names, or product or customer names.

## Review

Reviewed by the brain. docs/review-and-merge.md goes from 2,392 to 1,199 words and docs/internals.md from 3,686 to 1,795. The merge is now one numbered checklist in the order the merge tool prints it (review, leak check of pr.md, push, PR create, PR merge, finish, delete the branch, release extras), followed by the allowlist table and a short procedure for a missing or untrustworthy verdict. internals.md opens with a parts table and a store-key table, and keeps the Evidence section. 110 of 110 backticked commands and paths kept in review-and-merge.md and 166 of 177 in internals.md; the 11 dropped are sample message strings. Linked headings (Review, Merging a card, Without the engine, Evidence) keep their exact text. docs/how-it-works.md gets the three fixes, each checked against hooks/lib/verify.ts and verify-native.ts: a spent budget advises next=stop and raising budget=; the red check also holds a short marker-less file (2,048 bytes or less) when the red test's own run at the head passes and prints otherwise; diagram 4 sends the card-tool call to a Card tool participant (7 participants). No history wording, no names, no machine paths.
