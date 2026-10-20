---
id: MOD-105
title: docs/how-it-works.md shows the mod's flow in four mermaid sequence diagrams, each with a plain-text walkthrough
domain: mod
tier: standard
status: merged
scope: [docs/how-it-works.md, CHANGELOG.md]
forbid: [hooks/**, bin/**, .claude-plugin/**, README.md, docs/upgrading.md, docs/cards/**, docs/internals.md]
red_test: none
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

The docs explain the mod only in long prose; a reader cannot see the flow at a glance, and there is no diagram besides one PNG. Four sequence diagrams, accurate to the code, give the picture, and a numbered text walkthrough under each keeps the page usable with a screen reader or where mermaid does not render.

## Done when

- docs/how-it-works.md exists with a one-paragraph intro (under 60 words) and four sections, each a ```mermaid sequenceDiagram block followed by a numbered walkthrough of the same steps in plain text (one short line per step, under 20 words each):
- 1. **Card to merge**: person, brain, card tool, dispatch, worktree, worker, verifier, merge tool, GitHub. Covers the card and dry run, the spawn block, the worker's red-then-green run and report block, the verdict row with next=, and the merge tool's printed push/PR/merge lines then finish.
- 2. **What the verifier checks**: the report block's fields checked against git in the worker's worktree: branch exists, sha reachable, files= equals the delta from base, every path inside scope and none in forbid, the red evidence file, and the gate re-run; the outcomes consistent, unverified, refuted, no-report, and the next= advice each leads to.
- 3. **Resume and the attempt budget**: a refuted or unverified attempt, the brain's SendMessage resume, the next attempt judged against the same brief, and what happens when the budget is spent. Include the /dispatch <id> --verify <sha> re-verify path that spends no attempt.
- 4. **A card for another repo**: dispatch with repo=<path>, the worktree cut from that repo's origin/main, the brief kept in the session's briefDir, attempts keyed per repo, the delta and gate taken in that repo.
- Every step in the diagrams is checked against the code and docs (hooks/register.ts, hooks/lib/verify-native.ts, docs/contracts.md, docs/review-and-merge.md); participant and message names use the words the docs use (brief, report, verdict, gate, scope, forbid, delta). Diagrams stay small: at most 7 participants and 18 messages each, no notes longer than one line.
- Each diagram block is preceded by a one-sentence alt description in italics (what the diagram shows), for readers whose viewer does not render mermaid.
- No machine paths, user names, or product or customer names. CHANGELOG.md gets an entry under Unreleased. The node suite's link check passes (docs/how-it-works.md links resolve, anchors included).

## Review

Reviewed by the brain. docs/how-it-works.md has four mermaid sequence diagrams, each with an italic alt line and a numbered walkthrough: card to merge, what the verifier checks, resume and the attempt budget, and a card for another repo. Every diagram is within 7 participants. The card's nine-participant list for diagram 1 conflicted with the 7 cap; the worker merged card+dispatch and worktree+worker, which reads fine. Attempt 1 was refuted on the engine gate, and the cause was machine load (load average 20-27 on 10 cores; every failure was a 5 s timeout in an untouched test); /dispatch --verify with the machine quiet came back consistent. A wrong extra attempt (2/3, no brief) came from this window running pre-0.9.17 code. Three small errors are left for a wave 2 docs card: a spent budget advises next=stop (raise budget=), not "check by hand"; the red check also holds a short marker-less file since MOD-102; and diagram 4's card-tool call goes to a participant labelled "Dispatch tool". No names or machine paths.
