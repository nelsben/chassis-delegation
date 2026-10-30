---
id: MOD-196
title: scopeAmends within-parent: a card cut under a parent keeps parentScope (card frontmatter, brief header parent_scope=), and in within-parent mode a worker's scope+= applies on its word only when every path sits inside the parent's scope
domain: mod
tier: standard
status: merged
scope: [hooks/lib/brief.ts, hooks/lib/card.ts, hooks/lib/repoconfig.ts, hooks/register.ts, .claude-plugin/plugin.json, tests/brief.test.ts, tests/card.test.ts, tests/options.test.ts, tests/hooks.test.ts, docs/contracts.md, docs/configuration.md, docs/guide.md, CHANGELOG.md]
forbid: [docs/cards/**, hooks/lib/allow.ts, hooks/lib/version.ts, README.md, docs/upgrading.md]
red_test: tests/brief.test.ts: scopeAmendHeld(a, 'within-parent', scope, base, ['hooks/**']) is false for scope+=hooks/lib/x.ts and true for scope+=docs/x.md, true when parentScope is empty (behaves as ask), and the brief built from a card with parentScope: [hooks/**] carries parent_scope=hooks/** in its header and briefContract reads it back. tests/card.test.ts: a card cut with parent 50 and parentScope [hooks/**] has the frontmatter line `parentScope: [hooks/**]` after `parent: 50`. tests/options.test.ts: scopeAmends within-parent parses from the repo file and /config. All fail on main.
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Step 1 left a hole: the card tool checks a card's scope against its feature's, but a worker's scope+= amend can still widen past the feature. Ben runs scopeAmends ask, which closes the hole but makes him approve every harmless amend. within-parent applies the amends that stay inside the feature and holds only the ones that escape it.

## Done when

- SCOPE_AMENDS_MODES in hooks/lib/brief.ts becomes ['apply', 'new-files', 'ask', 'within-parent'] and ScopeAmends gains 'within-parent'. scopeAmendHeld gains a fifth parameter parentScope: readonly string[] = []; for within-parent it returns false only when parentScope is non-empty and every amend path p satisfies contained(p, parentScope) from hooks/lib/scopetree.ts; otherwise true. The other modes are unchanged.
- The card tool writes `parentScope: [<globs>]` into the card frontmatter right after the `parent:` line when parentScope was given (same list style as scope:), and the card parser reads it back; the brief written from such a card carries `parent_scope=<comma-joined globs>` in its [[brief …]] header (placed after forbid=), briefContract (or the header parser) exposes it as parentScope, and the verifier's amend step in hooks/register.ts (the scopeAmendHeld call) passes it. A brief without parent_scope= passes [].
- A held within-parent block is listed with the same 'amend needs approval: … (scopeAmends within-parent) — …' wording the other held modes use, so hooks/lib/verify.ts's existing regex (ask|new-files) must also match within-parent: verify.ts is NOT in scope, so instead word the held line so the existing regex still matches, OR if that is impossible stop and emit [[amend v=1 scope+=hooks/lib/verify.ts reason=…]] rather than editing it.
- repoconfig.ts accepts within-parent for scopeAmends (error text names all four); .claude-plugin/plugin.json scopeAmends options and title list within-parent and its description says what it does.
- docs/contracts.md documents parent_scope= in the brief header and within-parent; docs/configuration.md and docs/guide.md 'Planning on GitHub' mention within-parent as the mode to use with parents; CHANGELOG.md Unreleased entry.
- The gates pass: claude plugin validate, the node suite, claude plugin test.

## Review

Consistent after four scope amends approved by the brain on reading each diff (dispatch.ts header/parse, verify-native.ts contract field, verify.ts held-line regex, configtable.ts choices): the card had the wrong files for where the brief header and contract live. within-parent with no parent_scope behaves as ask.
