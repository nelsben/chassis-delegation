---
id: MOD-224
title: "Dogfood: verdict takes a review that arrives after the lead's context was compacted, or says plainly it never saw one"
domain: mod
tier: standard
status: merged
scope: [hooks/lib/review.ts, hooks/register.ts, tests/review.test.ts, tests/node/*.mjs, CHANGELOG.md]
forbid: [hooks/lib/allow.ts, hooks/lib/version.ts, .claude-plugin/plugin.json, docs/cards/**]
red_test: claude plugin test . (a new tests/review.test.ts case fails now: a review block for the right task, attempt and sha, delivered in a session whose spawn record was lost, is not recorded)
gate: validate, node, test
budget: 2-attempts
spend: 6
---
## Dogfooding feedback (from a consumer repo)

Reported by a lead session in a repo that uses the mod day to day. Not a guess from reading the code: it happened once and cost a second review.

## Why

The lead spawned the reviewer that `verdict` asked for (next=review), then the lead's context was compacted while the reviewer ran. The reviewer handed back a normal review block ending `[[review v=1 task=<id> confirmed=N refuted=N unverifiable=N]]`, the lead called `verdict`, and the verdict still said the card was waiting on a review. The lead had to spawn a second reviewer (about $0.17) to get a verdict on record. Nothing told the lead why the first review was not taken.

## Done when

- FIND THE SOURCE FIRST. The worker reads how a review block is matched to its card (hooks/lib/review.ts: parseReviewBlock, parseReviewMarker, reviewPlan, reviewVerdictLine, and where register.ts keeps the reviewer's spawn) and names in the report which link breaks across a compaction (the spawn id, a session-scoped store, the review-of header, or something else).
- A review whose block names the task, the attempt and the sha the verdict is waiting on is recorded even when the spawn record from before the compaction is gone. Match on task + attempt + sha; never on task alone.
- A review that cannot be matched (wrong sha, wrong attempt, no header) is not recorded, and the next `verdict` says so in one line, e.g. `review seen for <id> but it names sha <x>, waiting on <y>; spawn the reviewer again`, instead of only repeating next=review.
- tests/review.test.ts gains cases: matching block with no spawn record is recorded; wrong sha is refused with that line; a normal spawn-and-return review is unchanged.
- CHANGELOG.md gains a Fixed entry under `## Unreleased` naming MOD-224. validate, the node tests and the engine suite pass.

## Review

The break is the reviewer's spawn record: the hand-back joins a review only through it, so with the record lost the [[review]] block is never read. [[review]] now carries optional attempt= and sha=; matchReview matches on task+attempt+sha together, never on task alone, and a mismatch shows a one-line refusal on the next verdict. orphanReview finalizes a matching block with no spawn record. The normal spawn-and-return path is unchanged. Gaps: hooks/templates/review.md's last line still asks for the bare block (outside scope; tests/node/templates.node.mjs pins it), so the orphan path only works when the reviewer follows the appended prompt line. orphanReview and the verdict refusal line have no engine test. Follow-up card: the template's last line and its node test together.
