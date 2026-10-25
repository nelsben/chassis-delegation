---
id: MOD-168
title: The price table matches the live pricing page: every model's in/out and cache-read price in cost.ts and spend.md checked against platform.claude.com on 2026-10-25, and any that differ corrected
domain: mod
tier: standard
status: merged
scope: [hooks/lib/cost.ts, docs/spend.md, tests/cost.test.ts, CHANGELOG.md]
forbid: [hooks/register.ts, hooks/lib/brain.ts, README.md, docs/cards/**, docs/evidence.md, docs/evidence/**]
red_test: tests/cost.test.ts
gate: validate, test
budget: 2-attempts
spend: 10
---
## Why

The cost formula prices sonnet-5 at 3/15 while a research note taken from the pricing page on 2026-10-25 records Sonnet 5.5 and Sonnet 5 at $2/$10 and Sonnet 4.x at $3/$15. The table's comment says it was last checked 2026-10-06. Every dollar figure on the dashboard, the verdict rows and the evidence rests on this table, so it is worth a pass against the page itself.

## Done when

- The live page https://platform.claude.com/docs/en/about-claude/pricing was read with the WebFetch tool (not curl, not a cached note) and, for every model id prefix in the price table of hooks/lib/cost.ts, the page's per-million input price, output price and cache-read price were compared with the table's `in`, `out` and `cacheRead` (a missing `cacheRead` means 0.1x input: compare that too). A tiered price (such as a Haiku rate that changes past a prompt length) is compared with the table's lower tier, as the file's own comment describes.
- Every entry that differs from the page is changed to the page's figure, and nothing else in the table changes: no model is added or removed. The table's header comment names the check date 2026-10-25 and the page's URL in place of the 2026-10-06 note. If every entry already matches, the table is unchanged except for that comment.
- docs/spend.md, in `## The cost formula` (the `Prices per million tokens (in/out):` sentence and the cache-read sentence after it, around lines 104-105), lists the same figures as the table after the change, model by model, in the same order and shape as today.
- Tests (red first when a price changes: a tests/cost.test.ts case asserting the old figure fails at base): tests/cost.test.ts asserts each changed model's price from `priceFor` and one `usdOf` result computed with it; where no price changed, the red file holds a note saying so and no test is added. The suite stays green.
- CHANGELOG.md `## Unreleased` gets one entry under `### Fixed` (create the heading if absent) naming each model whose price changed, old and new figures, and the page checked, tagged with this card's id; where nothing changed it says the table was checked against the page on 2026-10-25 and found current. The hand-back report lists which models changed. Wording generic: no product names beyond the models, no repo, person, machine path or session names.

## Review

Consistent on attempt 1, red first (three cost.test.ts cases failed at base). The worker read the live pricing page with WebFetch and compared every prefix: two entries differed and are corrected, sonnet-5 $3/$15 → $2/$10 and sonnet-5-5 cache read $0.20 → $0.10; everything else matched. The table's header comment names 2026-10-25 and the page URL; spend.md's cost formula and the CHANGELOG Fixed entry list the same figures; two usdOf checks added. Diff read: only those two table rows and the comment changed in cost.ts.
