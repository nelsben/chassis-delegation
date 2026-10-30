---
id: MOD-193
title: land_plan tool: one call lands a feature and its tasks as a GitHub sub-issue tree, every task's paths checked inside the feature's before anything is filed, and files only with confirm: true
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/land.ts, tests/land.test.ts, tests/node/land.node.mjs, tests/background.test.ts, docs/guide.md, CHANGELOG.md]
forbid: [docs/cards/**, hooks/lib/allow.ts, hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, docs/upgrading.md]
red_test: "tests/land.test.ts: new cases drive the land_plan tool through the harness with a fake gh whose create prints https://github.com/o/r/issues/<n> with n counting up from 50: (1) without confirm, no gh runs, the bodies are written under .delegation/landed/ and the text shows the tree and says to call again with confirm: true after the person says yes; (2) with confirm: true the argvs run are, in order, the feature create (--label type:feature, no --parent), then each task create with --parent 50, then (project o/1 set) one item-add per filed issue; (3) a task path outside the feature's paths refuses the whole call before any gh or file write, naming the path and the feature's paths; (4) when the second task's create fails, the text lists #50 and #51 as filed, names the failed task and gh's stderr, and files nothing after it. tests/node/land.node.mjs covers the pure plan parse and containment check. All fail on main."
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

The founder plans in chat; when a plan is settled the brain must put the whole tree on GitHub in one step so the next session can read it back. The land tool (MOD-192) files one issue at a time; filing a feature and five tasks by hand loses the parent link and the containment rule. One confirmation per tree, given in chat, is the gate the founder chose.

## Done when

- A new tool land_plan is registered in session.start right after land (same try/debug pattern) and answered by an on('tool.call', { tool: 'mcp__chassis-delegation__land_plan' }) hook beside land's. inputSchema: { feature: { title (required), type (feature|epic, default feature), paths (string array, required, at least one), note? }, tasks: array (1 to 30) of { title (required), type (story|task|bug|spike, default task), paths (string array, required, at least one), note? }, confirm?: boolean }, additionalProperties false. Its description says: plan in chat first; call without confirm to show the tree; show it to the person; call again with confirm: true only after the person says yes in their own words.
- A pure parsePlan(input) in hooks/lib/land.ts returns the normalised plan or { error } (one line naming what is wrong), and checks every task path with contained(path, feature.paths) from hooks/lib/scopetree.ts; a stray path is an error naming the task, the path and the feature's paths. Nothing is written and no gh runs when it errors.
- Without confirm: every body is written under <root>/.delegation/landed/ with landedBody (redacted, freeName for the slug, the feature body with its ```scope block of feature.paths, each task body with its own ```scope block), no gh runs, and the text is the tree: the feature line `feature: <title> [paths]`, then one indented line per task `task: <title> [paths]`, the files written, and the line `nothing filed: call land_plan again with confirm: true once the person says yes`. Calling again with confirm: true re-writes the same bodies (the same slug files, not -2 copies, when their content is unchanged and they carry no issue: line).
- With confirm: true it files through the same run() path the land tool uses (factor a fileOne helper out of landWith rather than copying it; landWith keeps its current behaviour and output): the feature first with --label type:<feature type> and no --parent, then each task in order with --label type:<task type> --parent <feature number>, writing `issue: #n url` back to each body file and adding each issue to the configured project as land does. The text lists `filed #<n> <url> <title>` per issue, `added to project <owner>/<number>` once when all were added (else one not-added line per failure), and ends `tree: #<feature> with <k> tasks`.
- When any create fails it stops there: the text lists what was filed, `not filed: <title>` for the failed one and every one after it, and gh's stderr trimmed to 400 characters; a feature that fails files no tasks. When origin is not GitHub it behaves as without confirm and says why.
- The land_plan argvs match the MOD-192 allowlist shapes unchanged (hooks/lib/allow.ts is forbidden): the create shape with and without --parent, the item-add shape.
- tests/background.test.ts tool list ends 'land', 'land_plan'. docs/guide.md 'Planning on GitHub' explains the land_plan flow (plan in chat, show the tree, the person's yes, confirm: true) and CHANGELOG.md Unreleased gets an entry.
- The gates pass: claude plugin validate, the node suite, claude plugin test.

## Review

Consistent first attempt. fileOne/addToProject factored out of landWith; land unchanged. Two known gaps, accepted: on a partial failure the issues already filed are not added to the project, and a re-run after a partial failure re-files the issues that carry an issue: line (their slug files no longer match, so new -2 bodies are written). Follow-up: land_plan should skip items whose body already carries issue:.
