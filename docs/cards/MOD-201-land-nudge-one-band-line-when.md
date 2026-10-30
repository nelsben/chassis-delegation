---
id: MOD-201
title: Land nudge: one band line when a prompt describes work and the turn lands nothing, and one after a merge finish while the parent has open tasks; option landNudge, default on
domain: mod
tier: standard
status: merged
issue: 293
parent: 291
scope: [hooks/lib/landnudge.ts, hooks/lib/band.tsx, hooks/lib/configtable.ts, hooks/register.ts, .claude-plugin/plugin.json, tests/landnudge.test.ts, tests/landnudge-band.test.ts, tests/rerender.test.ts, tests/options.test.ts, tests/configcmd.test.ts, tests/hooks.test.ts, docs/configuration.md, docs/guide.md, CHANGELOG.md]
forbid: [hooks/lib/nudge.ts, hooks/lib/allow.ts, hooks/lib/land.ts, hooks/lib/mergecmd.ts, hooks/lib/ghguard.ts, hooks/lib/version.ts, docs/cards/**, README.md, docs/upgrading.md]
red_test: npx tsx --test tests/landnudge.test.ts tests/configcmd.test.ts tests/options.test.ts
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

The person does not want to remind the brain to keep GitHub current. The land and land_plan tools exist, but nothing prompts the brain to use them when a bug, feature or idea comes up in conversation, and the parent-still-open note at merge finish is buried in the finish text. A single line in the band above the prompt, aimed at the brain and cleared by the next land, land_plan or card call, closes that gap without any GitHub write.

## Done when

- New pure module hooks/lib/landnudge.ts: describesWork(text) returns true for a person's prompt that describes a bug, feature or idea and false otherwise, using a conservative word list (whole words, case-insensitive: bug, broken, crash, regression, fails, failing, feature, idea, we need, we should, let's add, add support, todo, follow-up) and returning false for text under 20 characters, for text that is a slash command (starts with /), and for text that already names an issue (#<digits>); nudgeLine(kind, parent?) returns `lead: land this as an issue (land or land_plan) or say it is not work` for kind prompt and `lead: parent #<n> has <k> open tasks; land the next or close it` for kind parent. No I/O in that module.
- A new boolean option landNudge, default true: in .claude-plugin/plugin.json userConfig (title `Land nudge`, description saying what the two lines are and that they are for the brain), in hooks/lib/configtable.ts in the group `Guards and nudges for the brain`, in the Cfg type and its resolution in hooks/register.ts (o.landNudge !== false), and as a row in docs/configuration.md beside wakeOnVerdict. The option count in tests/configcmd.test.ts moves from 61 to 62 and every count assertion there is updated.
- prompt.submit in hooks/register.ts: for a prompt that is not the plugin's own wake-up and for which describesWork is true, the mod remembers it (module state: the text's first 80 characters and the time) when landNudge is on. On turn.complete, if a flagged prompt is pending and no tool.call for mcp__chassis-delegation__land, mcp__chassis-delegation__land_plan or mcp__chassis-delegation__card was seen since it, the prompt nudge line is set and the band is redrawn; any of those three tool calls clears the pending prompt and any shown nudge line. The nudge line is also cleared by the next prompt.submit that is the person's.
- Merge finish: when the finish text reports a parent with open tasks (the MOD-195 siblings read gave open sibling numbers), the parent nudge line is set with that parent and count; a later land, land_plan, card or dispatch tool call clears it. A finish that closes (or would close) the parent sets no line.
- The AbovePrompt ui.render hook draws the nudge line even when neither the ration pane nor the live view is active: a one-line tree using the existing band table and scheme (hooks/lib/band.tsx gains nudgeBandTree(p, line, scheme) or an optional nudge line on bandTree, the line appended as the last band row and never counted against capLines). With the live view active the line is the last row of the existing band. landNudge off draws nothing and records nothing.
- Tests: tests/landnudge.test.ts covers describesWork (true for `the merge button is broken on dark mode`, false for `go ahead`, false for `/delegation status`, false for `fix #231 please`, false for a 12-character text) and both nudgeLine forms; tests/rerender.test.ts or a new tests/landnudge-band.test.ts covers the band drawing the line with and without the live view, and drawing nothing with landNudge off; tests/options.test.ts covers the prompt flagged, then cleared by a land tool call, then shown at turn.complete when no such call came; tests/configcmd.test.ts counts pass at 62.
- docs/guide.md gains a short `Land nudge` paragraph next to the effort nudge: what the two lines say, that they are for the brain not the person, and how to turn them off (/delegation config landNudge off). CHANGELOG.md gains an Added entry under the `## Unreleased` heading at the top (create the heading if absent) naming MOD-201.
- hooks/lib/nudge.ts (the effort nudge) is unchanged; no gh is run and no file is written to GitHub by anything in this card; tsc, `claude plugin validate` and the node tests pass.

## Review

Consistent first attempt. landnudge.ts is pure and conservative as carded; parentNudge helper added. Accepted gap: the parent line has pure tests only, no engine test through a real merge finish (merge fixtures were out of scope).
