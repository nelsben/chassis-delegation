---
id: MOD-358
title: scopeAmends within-parent on a card with no parent scope applies a scope+= whose every path sits in a folder the card's scope already names, and holds the rest
domain: mod
tier: standard
status: merged
scope: [hooks/lib/brief.ts, hooks/register.ts, .claude-plugin/plugin.json, hooks/lib/configtable.ts, tests/brief.test.ts, tests/hooks.test.ts, tests/*.test.ts, tests/node/*.node.mjs, tests/harness.ts, docs/configuration.md, docs/contracts.md, docs/guide.md, CHANGELOG.md]
forbid: [bin/**, docs/cards/**, docs/mockups/**, hooks/lib/allow.ts, hooks/lib/verify.ts, hooks/lib/verify-native.ts, hooks/lib/version.ts, README.md, docs/upgrading.md]
red_test: tests/brief.test.ts (scopeAmendHeld under within-parent with an empty parent scope returns false for a path in a folder the scope names; on main it returns true)
gate: validate, node, test
budget: 2-attempts
spend: 8
---
## Why

`scopeAmends within-parent` (MOD-196) applies a worker's `scope+=` on its word only when the brief carries the parent issue's scope and every path sits inside it. A card with no parent scope has no such boundary, so MOD-196 made it behave as `ask`: every amend waits for the lead. Most cards have no parent scope, so with the option set at user level every amend is held, including the harmless ones. The ledger says which are harmless: of 72 paths workers asked for across 303 cards, 60 sat in a folder the card's scope already named (one more test file, one more file beside a file in scope). This card makes the card's own folders the boundary when there is no parent scope. A path outside them is still held, and a card with a parent scope is judged exactly as before.

## Before you start

- `hooks/lib/brief.ts`: `scopeAmendHeld`, `inScopeFolder`, `amendScopePaths` and the doc comments above them.
- `hooks/register.ts`: the caller (search `MOD-170: scopeAmends decides the rest`). It already passes the scope in force (`scopeNow`) and `parentScopeOf(briefText)`: the call does not change.
- `tests/brief.test.ts`: the `scopeAmendHeld` tests, among them the one that says an empty parent scope behaves as `ask`.
- `tests/hooks.test.ts`: `describe('MOD-170: scopeAmends'` (how a hand-back with an amend block is driven and how a held and an applied line read).

## Design (decided by the brain; build it, do not redesign it)

### 1. The rule, `hooks/lib/brief.ts`

In `scopeAmendHeld`, the `within-parent` branch becomes:

- `parentScope` non-empty: unchanged. Held unless every path satisfies `contained(p, parentScope)`. The scope's folders are **not** a fallback here: a path outside the parent's scope is held even when it sits in a folder the card's scope names.
- `parentScope` empty (MOD-358): held unless every path of the block satisfies `inScopeFolder(p, scope)`. `inScopeFolder` is used as it is: a path that is itself a glob never passes; a listed file names only its own folder; a listed glob names the folder of its fixed prefix and everything under it.

`apply`, `ask` and `new-files` are unchanged. A block that mixes a path inside the folders with one outside is held whole, as today's modes hold a block whole. Update the doc comment of `scopeAmendHeld` and the `// MOD-196` line to say this.

Nothing else decides differently: a block that removes scope or forbid, hides paths, or names a path under a forbid is still held by `amendNeedsApproval` before this rule is asked, and `applyAmends` off still holds everything.

### 2. The held line

Unchanged: `amend needs approval: <block> (scopeAmends within-parent) — append it to <brief> to accept, then dispatch verify=<sha>`. The code that reads that line back is outside this card and needs no change.

### 3. Tests

- `tests/brief.test.ts`: replace the expectation that an empty parent scope behaves as `ask` with these cases: `scopeAmendHeld(a, 'within-parent', ['hooks/lib/work.ts', 'tests/*.test.ts'], new Map(), [])` is false for a block `scope+=hooks/lib/x.ts` and for `scope+=tests/x.test.ts` (both are true on main: this is the red test), and true for `scope+=docs/x.md`, for `scope+=hooks/x.ts` and for `scope+=hooks/lib/*.ts`. And add: a block naming two paths, one inside the folders and one outside, is held; with a non-empty parent scope `['hooks/**']`, `scope+=tests/x.test.ts` is held although `tests/*.test.ts` is in the card's scope; an empty `scope` list holds every block.
- `tests/hooks.test.ts`, in the MOD-170 describe (or a `MOD-358` describe beside it, built the same way): with the repo file `{"scopeAmends":"within-parent"}` and a brief with no `parent_scope=`, a hand-back whose amend asks for a file in a folder the brief's scope names is applied (the applied-amend line, and the brief file gains the block), and one that asks for a file in a folder the scope does not name gives the held line with `(scopeAmends within-parent)`.
- Any other test that pins the old behaviour (a parentless `within-parent` amend held) is updated only when its path sits in a scope folder; otherwise it stays as it is.

### 4. Words

- `.claude-plugin/plugin.json`, the `scopeAmends` description: after the sentence on `within-parent`, add: `With no parent scope on the card, a block applies when every path it names sits in a folder the card's scope already names, and waits for you otherwise.` Nothing else in the file changes.
- `hooks/lib/configtable.ts`: no change unless the summary line states the old rule (it lists the four values only).
- `docs/configuration.md` (the `scopeAmends` row), `docs/contracts.md` (the `scope+=` row and the `parent_scope` row, which says an empty or absent parent scope holds every amend as under `ask`) and `docs/guide.md` (the paragraph beginning `While parents are in use`): say the new rule for a card with no parent scope, in one sentence each.
- `CHANGELOG.md`: when the file has no `## Unreleased` heading, add `## Unreleased` above the newest version heading; under it a `### Changed` section (after `### Added` when that exists) with one bullet in the style of its neighbours, ending `(MOD-358)`.

## Left to you (list each as a `choice:` line)

- The fixture paths and block texts of the new tests.
- The wording of the docs sentences and the changelog bullet.

## Done when

- `scopeAmendHeld` in `within-parent` mode with an empty parent scope returns false exactly when every path of the block passes `inScopeFolder` against the scope, and with a non-empty parent scope behaves as before; the other modes are unchanged.
- The tests of section 3 pass, and the two applied-path cases fail on main.
- The option's description, the three docs and the changelog say the rule.
- The held line's wording is unchanged.
- The gates `validate`, `node` and `test` pass.

## Review

Brain review: read the whole diff. The rule is one line in scopeAmendHeld: with a non-empty parent scope every path must sit inside it (unchanged, the card's folders are no fallback); with none, every path must pass inScopeFolder against the card's scope, so a glob path, a mixed block and an empty scope list are all held. The other modes, the forbid check that runs first and the held line's wording are untouched. Tests: the pure cases in tests/brief.test.ts (two applied paths that were held on main, three held paths, the mixed block, the parent-scope case, the empty scope) and two engine cases in the MOD-170 describe (applied in a named folder with the brief gaining the block; held outside with the within-parent held line). The option's description and the three docs say the rule; the changelog gains a Changed bullet. Approved by the owner on 2026-11-09 as a harness logic change.
