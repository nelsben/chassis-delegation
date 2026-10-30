---
id: MOD-205
title: Option landAuto, default on: off makes land show the issue first and file only with confirm: true, and the land nudge says propose instead of land
domain: mod
tier: standard
status: merged
scope: [hooks/lib/land.ts, hooks/lib/landnudge.ts, hooks/lib/configtable.ts, hooks/register.ts, .claude-plugin/plugin.json, tests/land.test.ts, tests/landnudge.test.ts, tests/configcmd.test.ts, tests/options.test.ts, docs/configuration.md, docs/guide.md, CHANGELOG.md]
forbid: [hooks/lib/ghguard.ts, hooks/lib/allow.ts, hooks/lib/version.ts, docs/cards/**, README.md, docs/upgrading.md]
red_test: claude plugin test . (tests/land.test.ts landAuto cases and tests/configcmd.test.ts at 63 fail now)
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

The person chose to keep land automatic (it files on the brain's call) but wants a switch to turn that off, for public repos or when they want to approve each issue. Off, land behaves like land_plan: it writes the body and shows the issue, and files only when called again with confirm: true after the person's yes.

## Done when

- A new boolean option landAuto, default true: in .claude-plugin/plugin.json userConfig (title `Land files automatically`, description saying on files at once and off shows the issue and files only on confirm: true after the person's yes), in hooks/lib/configtable.ts in the group with project, in the Cfg type and its resolution in hooks/register.ts (o.landAuto !== false), and a row in docs/configuration.md beside project. The option count in tests/configcmd.test.ts moves from 62 to 63 everywhere, and tests/options.test.ts gains the one landAuto case tests/node/configtable.node.mjs requires.
- LAND_TOOL in hooks/lib/land.ts gains an optional boolean `confirm` with a description matching land_plan's (true only after the person said yes to the issue shown); parseLandTool returns it. With landAuto on, confirm is ignored and land files as today.
- With landAuto off, the land tool and /delegation land write the redacted body and print the issue (title, type, parent, the gh line) and file nothing, ending with `nothing filed: landAuto is off; call land again with confirm: true once the person says yes`, unless the tool call passes confirm: true, which files exactly as today (supersedes included). With landAuto off, /delegation land (typed by the person) also shows the issue and files nothing unless --confirm is given; LAND_USAGE names --confirm.
- The land nudge (hooks/lib/landnudge.ts nudgeLine kind prompt) takes the mode: with landAuto on the line stays as today; off it reads `lead: propose landing this as an issue (land shows it; file on the person's yes) or say it is not work`. register.ts passes cfg.landAuto.
- Tests in tests/land.test.ts: landAuto off without confirm runs no gh issue create and prints the closing line; off with confirm: true files; on ignores confirm. tests/landnudge.test.ts covers both nudge texts.
- docs/guide.md's land paragraph says what landAuto does and how to turn it off (/delegation config landAuto off). CHANGELOG.md gains an Added entry under `## Unreleased` naming MOD-205. validate, the node tests and the engine suite pass.

## Review

Consistent first attempt. landAuto off returns before any gh unless confirm is true; on ignores confirm; nudge wording follows the mode. Option sits beside project in the config table. Red file trimmed to fail lines.
