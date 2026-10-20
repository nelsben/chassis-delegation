---
id: MOD-109
title: docs/configuration.md and docs/spend.md cut to half: one table row per setting and per spend control, every anchor kept
domain: mod
tier: standard
status: merged
scope: [docs/configuration.md, docs/spend.md]
forbid: [CHANGELOG.md, README.md, hooks/**, bin/**, tests/**, .claude-plugin/**, docs/cards/**, docs/guide.md, docs/install.md, docs/contracts.md, docs/review-and-merge.md, docs/internals.md, docs/upgrading.md, docs/how-it-works.md, docs/evidence.md, docs/evidence/**]
red_test: none
gate: validate, node
budget: 2-attempts
spend: 10
---
## Why

configuration.md is 5,336 words and spend.md 2,852; both are lookup pages that a reader scans for one setting or one limit, but they read as essays. One row per setting (what it does, values, default, how to set it) answers the lookup in seconds, and the long explanations repeat what other pages say.

## Done when

- docs/configuration.md is at most 2,500 words and docs/spend.md at most 1,300 (wc -w). Both read as reference: tables first, short lists, sentences under 25 words, no paragraph over 4 lines.
- Every userConfig field in .claude-plugin/plugin.json, every .chassis-delegation.json key, and every /delegation subcommand and option the current text names has one table row: name, what it does, values, default, how to set it. Before cutting, list them with grep (and from plugin.json); after, check each against the new text and put the counts kept in the report's metrics.
- spend.md keeps every limit, ceiling, warning and the formula or rule behind each number, as a table: control, what it limits, default, what happens when it is hit, how to change it.
- These headings keep their exact text, because other docs link to them: in configuration.md the ones whose anchors are #delegation-config, #posting-the-findings, #the-debrief-now and #the-host-command-allowlist; in spend.md #a-workers-identity and #the-brains-spend. Other headings may merge or be renamed only if nothing in README.md or docs/*.md links to them (grep first).
- A fact that is found nowhere else in docs/ stays, compressed; detail that another page owns becomes one line and a link. No history in reference text: no card ids, no 'since 0.x', no 'used to' or 'now'.
- The node suite passes, including its link and anchor check. No machine paths, user names, or product or customer names.

## Review

Reviewed by the brain. docs/configuration.md goes from 5,336 to 2,485 words and docs/spend.md from 2,852 to 1,298. configuration.md is now the four config layers as a table, the /delegation config forms as a table, and one Options row for each of the 51 manifest userConfig fields plus issueRepo (checked by a grep loop against .claude-plugin/plugin.json: none missing), then the debrief, posting and the host-command allowlist. spend.md holds one Spend controls table (11 rows: what each limits, default, what happens when hit, how to change it), plus the brain's-spend lessons, a worker's identity and the cost formula. The six linked headings keep their exact text (The debrief now drops from ## to ###; the anchor is the same). A combined link check of every pending docs card against main found one break this card causes: contracts.md links spend.md#spend-ceiling, which this card removes; that link is fixed in MOD-108 before it merges. No card ids, no history wording, no names or machine paths.
