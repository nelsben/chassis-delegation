---
id: MOD-198
title: land_plan resumes instead of re-filing: an item whose landed body already carries an issue: line is reused (its number taken from that line, not filed again), and issues filed before a failed create are still added to the project
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/land.ts, tests/land.test.ts, tests/node/land.node.mjs, CHANGELOG.md]
forbid: [docs/cards/**, hooks/lib/allow.ts, hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, docs/upgrading.md]
red_test: "tests/land.test.ts: land_plan with confirm: true and a fake gh whose second create fails (feature #50 filed, task 1 fails); then a second call with confirm: true and a gh that succeeds: the second call runs no create for the feature, passes --parent 50 for both tasks, writes no -2 file, and its text lists `already filed #50 <url> <title>` then `filed #51 …`, `filed #52 …`. Also the first (failed) call ran item-add for #50 when project o/1 is set. tests/node/land.node.mjs: issueLineOf(text) reads `issue: #50 https://github.com/o/r/issues/50` back. All fail on main."
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

MOD-193 review: after a partial failure, calling land_plan again with confirm: true writes -2 copies and files duplicate issues for the items that already went through, and the issues filed before the failure are never added to the Project. The founder never opens GitHub to clean up, so a retry must be safe.

## Done when

- A pure issueLineOf(text) in hooks/lib/land.ts returns { number, url } from the last line matching ^issue: #(\d+) (https://github\.com/\S+/issues/\d+)$, else undefined.
- In planWith's slug-file choice, a candidate file whose text with its trailing issue: line removed equals the new body is reused, and the item is marked filed with that issue; such items are not created again. The feature's number for --parent comes from its issue: line when it was already filed.
- The text lists `already filed #<n> <url> <title>` for a reused item, in tree order with the filed ones; the tree: line counts all tasks.
- When a create fails, the issues filed in that call (and the already-filed ones) are still added to the configured project before the failure text is returned, using addToProject; the failure text keeps its current lines and adds the project lines.
- No change to the land tool's output; no new allowlist shape. CHANGELOG.md Unreleased entry.
- The gates pass: claude plugin validate, the node suite, claude plugin test.

## Review

Consistent first attempt. Retry reuses bodies carrying issue: lines; issues filed before a failure still go to the project. Red file's node section is noisy; the engine red is real.
