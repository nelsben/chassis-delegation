---
id: MOD-227
title: "Dogfood: a brief whose scope path falls under one of its own forbid globs is flagged when it is made (#304)"
domain: mod
tier: standard
status: merged
issue: 304
scope: [hooks/register.ts, hooks/lib/brief.ts, hooks/lib/card.ts, hooks/lib/dispatch.ts, tests/brief.test.ts, tests/node/*.mjs, CHANGELOG.md, docs/guide.md]
forbid: [hooks/lib/allow.ts, hooks/lib/version.ts, .claude-plugin/plugin.json, docs/cards/**]
red_test: claude plugin test . (a new tests/brief.test.ts case fails now: scope [.claude/skills/x/SKILL.md] with forbid [.claude/**] builds a brief with no warning)
gate: validate, node, test
budget: 2-attempts
spend: 6
---
## Dogfooding feedback (from a consumer repo)

Reported by a lead session in a repo that uses the mod day to day; refines issue #304. In that repo the generic `.claude/**` forbid came from the repo's own worker-prompt text, not from the mod, so that part is the consumer's fix. The mod part is that nothing caught the clash before a worker spent time on it.

## Why

A card named a skill file under `.claude/` in its scope while the brief also forbade `.claude/**`. The worker could not tell which rule wins, stopped to ask with an amend, and the lead had to resolve it by hand. A clash between a card's own scope and forbid is knowable when the brief is built, before any worker runs.

## Done when

- When a brief is built (card, dispatch or the manual brief path), each scope entry is tested against each forbid entry and forbid glob. A scope path that a forbid entry covers is reported as one line naming both, e.g. `scope .claude/skills/x/SKILL.md is under forbid .claude/** — drop the forbid, narrow it, or drop the scope path`.
- The rule (decided by the founder): a clash between the card's own scope and the card's own forbid REFUSES the brief: the card tool and dispatch write no brief and return the line above as the error. A clash with a forbid that came from elsewhere (repo-wide config, or an open sibling card's scope added as forbid under a parent) does not refuse: the brief is written, the forbid wins as today, and the same line is printed as a warning naming where that forbid came from (`(from repo config)` or `(from sibling card <ID>)`). docs/guide.md states this rule in one paragraph.
- Forbid entries that come from repo-wide config (not the card) are named as such in the line, so the lead knows where to fix it.
- tests/brief.test.ts gains: exact path under a glob, glob under a glob, no overlap (no line), and a forbid from repo config.
- CHANGELOG.md gains an entry under `## Unreleased` naming MOD-227 and #304. validate, the node tests and the engine suite pass.

## Review

The founder's rule: a clash between the card's own scope and its own forbid refuses the card tool and dispatch, and no brief is written. A forbid from an open sibling card warns with "(from sibling card <ID>)", and the forbid wins. No repo-wide forbid exists in this mod, so "(from repo config)" is supported and tested in the pure function, but no path produces it. The lead approved one amend: the GH-17 test in tests/hooks.test.ts pinned the old warning, and the lead read its rewrite (7+/5-, refusal plus no brief file). Replay skips the refusal.
