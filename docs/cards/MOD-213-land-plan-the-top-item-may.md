---
id: MOD-213
title: land_plan: the top item may name an existing parent issue, and story, epic and feature items may have no paths
domain: mod
tier: standard
status: merged
scope: [hooks/lib/land.ts, hooks/register.ts, tests/land.test.ts, tests/node/land.node.mjs, docs/guide.md, CHANGELOG.md]
forbid: [hooks/lib/allow.ts, hooks/lib/version.ts, .claude-plugin/plugin.json, docs/cards/**]
red_test: claude plugin test . (tests/land.test.ts parent and empty-paths cases fail now)
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Adopter feedback (backfill of a feature > epic > story > task tree): land_plan's top item cannot take a parent, so each epic has to be linked to its feature by hand; and every item needs at least one path, which refuses process and rule stories and planned work whose files do not exist yet (about a quarter of stories in a full backfill).

## Done when

- land_plan's top item (feature) takes an optional `parent` (a whole number, an existing issue in landRepo). On confirm the top issue is filed as a sub-issue of it with the same allowlisted shapes land --parent uses today; the preview shows `under #<parent>` and runs no gh. The plan: key (MOD-207) includes the parent number, so the same plan under a different parent files anew.
- `paths` may be empty (or left out) on items of type feature, epic or story; a task item still needs at least one path. An item with no paths prints `scope: none` in the preview and its body says so in place of the paths list.
- Containment: a child's paths are checked against its parent's only when the parent has paths; under a parent with no paths a child's paths are not constrained. A card cut later under such an issue is refused by the card tool's parentScope check as today only when parentScope is given.
- `tasks` may be empty or left out: a feature or epic with no open work is filed alone (still under `parent` when given). The 30-task cap stays. A test covers a plan with no tasks filing just the top issue.
- land_plan's tool description and docs/guide.md say both rules in one sentence each.
- Tests in tests/land.test.ts: top item with parent files under it (fake gh) and shows `under #n` in preview; same plan with a different parent files a new top issue; a story with paths: [] is accepted and its body says scope none; a task with no paths is still refused; a child path outside a parent that has paths is still refused; children of a no-path parent are accepted. A node test covers the planKey change.
- CHANGELOG.md gains Added entries under a `## Unreleased` heading naming MOD-213. validate, the node tests and the engine suite pass.

## Review

Consistent on attempt 1 (sonnet, $0.39). land_plan takes parent (top issue filed with the --parent shape tasks already use; preview shows under #n, no gh); planKey hashes |parent:<n> only when given, so existing keys are unchanged; feature/epic/story may have no paths (scope: none), task/bug/spike still need one; containment only under a parent with paths; tasks may be empty. One old node test that pinned the earlier rules was rewritten to check the new refusals.
