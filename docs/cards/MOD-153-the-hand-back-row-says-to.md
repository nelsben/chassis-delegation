---
id: MOD-153
title: The hand-back row says to land after the verdict: `… · verifying · land after the verdict`, so a lead does not cherry-pick or remove the worktree while the verifier runs
domain: mod
tier: standard
status: merged
scope: [hooks/lib/rows.ts, hooks/register.ts, tests/**, docs/guide.md, CHANGELOG.md]
forbid: [docs/cards/**, bin/**, hooks/templates/**, .chassis-delegation.json, .claude-plugin/**, README.md, docs/upgrading.md, hooks/lib/verify-native.ts, hooks/lib/allow.ts, hooks/lib/dashboard.ts]
red_test: pure or engine test: the hand-back row for MOD-1 reads `chassis-delegation: MOD-1 handed back · sonnet · 12 min · $1.40 · verifying · land after the verdict`, and with a nudge the nudge follows it; at base the row ends `· verifying`. Red first
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

#246 ask 2: the lead landed hand-backs while the verifier's gate was still running, because the hand-back row only said `verifying`. Saying in the row itself that landing waits for the verdict tells a lead on any route not to move yet.

## Done when

- The hand-back row built in hooks/lib/rows.ts reads `chassis-delegation: <label> handed back · <glyph><alias> · <n> min · <usd> · verifying · land after the verdict`, with the MOD-114 nudge still riding last after it when there is one. Every route that prints this row (briefed Agent hand-back, manual dispatch, repo=here) gets the same text; nothing else about the row changes.
- The dashboard's verifying line (hooks/lib/dashboard.ts) and `/delegation status` are unchanged.
- Tests in tests/ that assert the exact hand-back row are updated to the new text, and one test asserts the tail with and without a nudge (red first: at base the row ends `· verifying`). docs/guide.md, if it quotes the row, quotes the new text. CHANGELOG.md Unreleased gets one entry naming #246. Wording generic: no product, repo, person, path or session names.

## Review

Consistent on attempt 1. handedBackRow in rows.ts appends `· land after the verdict` after `verifying`, before the MOD-114 nudge; every route shares that one builder, so register.ts was untouched. docs/guide.md does not quote the row and was left alone. The CHANGELOG had no Unreleased heading after the 0.9.27 release, so the worker added one.
