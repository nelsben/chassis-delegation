---
id: MOD-140
title: The dry run flags a hedged Done when line: `hint: done-when line 2 says "appropriate": the worker decides that alone; name the outcome` for each line holding a hedge word, printed beside the existing scope-size warning and tier hint
domain: mod
tier: standard
status: merged
scope: [hooks/lib/dispatch.ts, hooks/register.ts, tests/**, docs/guide.md, CHANGELOG.md]
forbid: [docs/cards/**, bin/**, hooks/templates/**, hooks/lib/card.ts, .chassis-delegation.json, .claude-plugin/**, README.md, docs/upgrading.md, docs/how-it-works.md, docs/contracts.md]
red_test: pure node test: hedgeHints(['Writes the file.', 'Handle errors appropriately.']) returns ['hint: done-when line 2 says \"appropriately\": the worker decides that alone; name the outcome']; at base hedgeHints is not exported from hooks/lib/dispatch.ts. Red first
gate: validate, node, test
budget: 2-attempts
spend: 5
---
## Why

The worker sees only the card, so a Done when line that says "sensible" or "as needed" hands it a decision the brain then reads about after the fact (MOD-137 made four such calls from two soft lines). The dry run already warns on scope size and suggests a tier; one more hint at the same moment catches the soft line before dispatch, at no cost.

## Done when

- hooks/lib/dispatch.ts gains `HEDGE_WORDS`, a readonly list of exactly these lowercase phrases: `appropriate`, `appropriately`, `sensible`, `sensibly`, `as needed`, `as necessary`, `if needed`, `where relevant`, `reasonable`, `reasonably`, `etc`, `and so on`, `the existing one`, `as usual`, `properly`, `correctly`, `clean up`, `tidy`, `improve`, `better`.
- A pure `hedgeHints(doneLines: readonly string[]): string[]` in hooks/lib/dispatch.ts returns one line per Done when statement that holds a hedge word, matched case-insensitively on word boundaries (so `appropriately` matches its own entry, `inappropriate` matches nothing, `etc.` matches `etc`): `hint: done-when line <n> says "<word>": the worker decides that alone; name the outcome`, where n is the 1-based statement number and word is the first hedge word found in that line in the order it appears in the line (as written in the card, original case). Text inside backticks is skipped, so a line that quotes a hedge word in code (like this card's own lines) gives no hint. At most 3 hint lines; a fourth or later hedged line adds one closing line `hint: <k> more done-when lines hedge` instead.
- hooks/register.ts prints those lines in the dry run and in /dispatch output directly after the economy tier hint (line 5671 today), with the same three-space indent, using the same doneWhenOf(card.body) statements the tier hint counts. Nothing is refused or changed: the card is still written and dispatch still runs.
- Tests: pure tests in tests/node (a new hedge.node.mjs or the existing dispatch node test file) for each case above: one hedge word, two in one line (first by position wins), case, word boundary (`inappropriate`), `etc.`, backtick-quoted words skipped, a clean card gives [], the 3-line cap with the closing line. One engine test in tests/scopesize.test.ts: a card whose second Done when line says `Handle errors appropriately.` prints `hint: done-when line 2 says "appropriately"` in the card tool's dry run, and a card with no hedge words prints no hedge hint.
- docs/guide.md's Dry-run warnings table gains one row for the hedge hint (the line, and fires when: a Done when line holds a hedge word outside backticks; at most three, then a count). CHANGELOG.md Unreleased gets one Added entry under the existing Unreleased section. Wording generic: no product, repo, person, path or session names.

## Review

Attempt 1 consistent at 7ca3d2d (validate, node 1080, engine 1587). HEDGE_WORDS (20 phrases), HEDGE_HINTS_MAX 3 and pure hedgeHints in dispatch.ts; register prints the lines after the economy hint. Statements are numbered as the tier hint counts them (list items when present, else non-blank lines), so a wrapped continuation of a list item is not scanned. Guide table row and CHANGELOG Added entry.
