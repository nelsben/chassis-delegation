---
id: MOD-172
title: A brief rewritten from a changed card takes the higher of the card's budget and the brief's own, so raising `budget:` on the card takes effect; the rewrite line names a budget change
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, tests/rerender.test.ts, docs/guide.md, CHANGELOG.md]
forbid: [README.md, hooks/lib/version.ts, hooks/lib/allow.ts, .claude-plugin/**, docs/cards/**]
red_test: tests/rerender.test.ts
gate: validate, test
budget: 2-attempts
spend: 10
---
## Why

When dispatch rewrites an existing brief because its card changed (MOD-141), the header's budget comes from the old brief, not the card (hooks/register.ts, the `headBudget` line near 5697), so a hand-raised brief budget survives a rewrite. But a budget raised on the card itself is silently dropped: a card changed from 2-attempts to 3-attempts was re-rendered with budget=2-attempts and dispatch printed attempt 2/2, leaving one attempt where the card granted two. Taking the higher of the two keeps the hand-raised case and makes the card's raise work.

## Done when

- When dispatch renders a header for a task whose brief already exists (the reused-brief path), the header's budget is the larger of the card's budget (as `budgetAttempts(card.budget, cfg.defaultBudget)` gives it) and the existing brief's `budget=` (as `parseBudget` reads it). A card budget lower than the brief's leaves the brief's. An unparseable budget on either side falls back as today. A task with no existing brief is unchanged: the card's budget.
- When that budget differs from the existing brief's, the brief counts as changed: it is rewritten (subject to the live-worker refusal, unchanged), and the `2. brief <path> rewritten: …` reasons include `budget <old>→<new> attempts` alongside `the card changed`. The spawn line's `attempt <n>/<budget>` shows the new budget in the same dispatch.
- Tests in tests/rerender.test.ts (red first: at base, a card whose budget goes from 2 to 3 after its brief exists is re-rendered with budget=2-attempts): a card raised from 2 to 3 renders budget=3-attempts, the rewrite reasons name `budget 2→3 attempts`, and the spawn line says `/3`; the existing case `a budget= raised by hand is kept` still passes unchanged (brief 4, card 2 keeps 4); a card lowered below the brief keeps the brief's.
- docs/guide.md, where it describes dispatch rewriting a stale brief, adds one sentence: the rewritten brief keeps the higher of the card's budget and the brief's own. CHANGELOG.md `## Unreleased` gets a `### Fixed` entry tagged with this card's id. Wording generic: no product, repo, person, machine path or session names.

## Review

Attempt 1/2 consistent ($0.44, Sonnet), no amends. Dispatch now renders the larger of the card budget and a reused brief's budget, so a raised card raises the brief and a hand-raised brief is still kept. The rewrite line names the change, e.g. `rewritten: the card changed, budget 2→3 attempts`. The reason is appended in register.ts rather than in dispatch.ts's rewriteReasonsOf, because dispatch.ts was out of scope. Tests cover raise, the spawn showing attempt 1/3, a lowered card keeping the brief's budget, and the existing hand-raise test unchanged. The README 85>80 node-suite failure is pre-existing (MOD-169).
