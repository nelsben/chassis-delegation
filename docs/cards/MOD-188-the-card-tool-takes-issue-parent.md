---
id: MOD-188
title: The card tool takes issue, parent, parentScope and parentForbid: a child's scope must sit inside its parent's, and forbid gains the parent's forbid and the scopes of open sibling cards
domain: mod
tier: standard
status: merged
scope: [hooks/lib/card.ts, hooks/lib/scopetree.ts, hooks/register.ts, tests/card.test.ts, tests/node/scopetree.node.mjs, docs/contracts.md, CHANGELOG.md]
forbid: [hooks/lib/allow.ts, hooks/lib/brief.ts, hooks/lib/verify.ts, hooks/lib/gitguard.ts, hooks/lib/mergecmd.ts, .claude-plugin/**, hooks/lib/version.ts]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs (the new tests/node/scopetree.node.mjs fails before hooks/lib/scopetree.ts exists)
gate: validate, node
budget: 2-attempts
spend: 10
---
## Why

Feature management puts the plan on GitHub as a sub-issue tree and makes only the leaf task a card. The card must record which issue it is and which parent it hangs under, and its scope must be checked against the parent's scope block so a task cannot quietly take work that belongs elsewhere. Concurrent siblings under the same parent must not collide, while finished siblings in a sequential chain must not block the next one.

## Done when

- The card tool's input schema (the properties block in hooks/lib/card.ts) gains four optional fields: issue (a whole number, the task's GitHub issue in this repo), parent (a whole number, the issue it hangs under), parentScope (array of repo-relative globs, the parent issue's scope block) and parentForbid (array of repo-relative globs, the parent's forbid block). Each has a one-sentence description. parentScope and parentForbid are refused without parent, with an error that says so. issue and parent must be whole numbers 1 or more, else an error.
- A new pure module hooks/lib/scopetree.ts exports `contained(child: string, parents: readonly string[]): boolean` and `strayGlob(scope: readonly string[], parents: readonly string[]): string | undefined`. A child glob is contained when some parent glob equals it, or a parent glob ends in `/**` and its prefix before `/**` plus `/` is a prefix of the child (so src/export/** contains src/export/a.ts and src/export/sub/**, but not src/exporter.ts), or the child has no glob character (no * ? [ {) and the parent glob matches it with the existing matcher the card tool already imports. Anything else is not contained. No I/O in the module.
- When parentScope is given, the card tool refuses the card if any scope glob is not contained, with the error `scope <glob> is outside parent #<parent>'s scope (<parent globs joined by ', '>)` naming the first stray. With no parentScope, no containment check runs.
- The written card's forbid is the deduplicated union, in this order, of: the forbid the caller gave, parentForbid, and the scope globs of every sibling card. A sibling is a card in the card folder whose frontmatter has the same `parent:` value, that is not the card being written, whose `status:` is not `merged`, and whose task id has no `accepted` or `merged` row in .delegation/ledger.jsonl (the card status lags, so the ledger decides). hooks/register.ts reads the card folder and the ledger and passes the siblings into the pure card code through a new optional CardCtx field `siblings: readonly { id: string; scope: readonly string[] }[]`; card.ts stays pure.
- A sibling glob that overlaps the new card's own scope is not added to forbid (forbid wins over scope, so it would make the card unbuildable); instead the card tool refuses the card with `scope <glob> overlaps open sibling <id> under parent #<parent>; wait for it to merge, or narrow the scope` naming the first overlap. Overlap uses the existing scopeOverlap helper card.ts already imports.
- The card frontmatter carries `issue: <n>` and `parent: <n>` lines, after `status:`, only when given. A card without them renders byte for byte as today; existing card tests pass unchanged.
- Lanes: issue is refused when lanes are given (one issue per card); parent, parentScope and parentForbid apply to every lane, each lane's scope checked on its own.
- tests/node/scopetree.node.mjs covers contained and strayGlob: equal globs, /** prefix, the src/exporter.ts non-match, a literal path matched by a parent glob, a child glob wider than the parent. tests/card.test.ts covers: the stray refusal message, the forbid union with parentForbid and an open sibling, a merged sibling dropping out, a sibling accepted in the ledger dropping out, the sibling overlap refusal, and a card with no new fields unchanged.
- docs/contracts.md names the two new card frontmatter fields in its card field table and adds a short paragraph 'Parent scope' stating the containment rule and the sibling forbid rule. CHANGELOG.md gains an Added entry under ## Unreleased. No absolute path and no repo name other than this one appears in any changed file, tests included (use /srv/... or relative paths in fixtures).

## Review

Attempt 1 consistent (sonnet, $0.48). Diff read: containment and sibling rule are pure in hooks/lib/scopetree.ts; register.ts reads the card folder and the ledger only when parent is given; a card with no new fields renders unchanged. The worker added openSiblings to scopetree.ts beyond the card, inside scope, accepted. The engine suite (claude plugin test) was not part of this card's gate.
