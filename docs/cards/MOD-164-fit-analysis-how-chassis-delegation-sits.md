---
id: MOD-164
title: Fit analysis: how chassis-delegation sits against Anthropic's published subagent-orchestration guidance, concept by concept, with ranked recommendations
domain: mod
tier: frontier
status: landed
repo: none
scope: [~/Documents/chassis-delegation-research/fit-analysis/**]
forbid: [~/Documents/chassis-delegation-research/claude-code-subagents/**, ~/Documents/chassis-delegation-research/agent-sdk-orchestration/**, ~/Documents/chassis-delegation-research/engineering-patterns/**, ~/Documents/chassis-delegation-research/managed-agents/**, ~/Documents/chassis-delegation-research/plugins-and-hooks/**]
red_test: none
gate: validate
budget: 2-attempts
spend: 12
---
## Why

chassis-delegation was built to enforce delegation before Anthropic published much on subagent orchestration. Five reference notes now summarise that guidance (Claude Code subagents and teams, the Agent SDK and Workflow tool, the engineering posts, Managed Agents, plugins and hooks). The founder needs one honest read of where the mod agrees with the guidance, where it enforces what Anthropic only recommends, where Anthropic now ships natively what the mod built, and where the mod is at odds with or ahead of the guidance, so the next round of cards can be chosen.

## Done when

- Read first, in full: the five reference notes `~/Documents/chassis-delegation-research/{claude-code-subagents,agent-sdk-orchestration,engineering-patterns,managed-agents,plugins-and-hooks}/reference.md` (and their sources.md), then the mod's own docs in the session checkout: README.md, docs/guide.md, docs/how-it-works.md, docs/contracts.md, docs/review-and-merge.md, docs/configuration.md, docs/spend.md, docs/internals.md, docs/evidence.md, and the CHANGELOG.md headings. Read nothing else in the repo and change nothing in it; commit nothing.
- The output folder holds `fit-analysis.md` with these sections in order: `## Summary` (10-15 sentences: the verdict in plain words); `## Concept map` (a table: one row per mod concept (the card, the brief/report contracts, the dry run, tiers and spend ceilings, worktree per task, repo=here and repo=none, the verifier and its claims, red-first evidence, gates and gate maps, merge and merge checks, the queue and slots, owed rows and retire, debrief, lanes, the delegateOnly/brain guard, amends), with columns: the nearest Anthropic concept(s) and source, relation (same / overlaps / mod enforces what guidance recommends / native now covers it / mod adds / mod contradicts), and one sentence of evidence); `## Where the guidance and the mod agree` (bullets, each citing the reference note and the mod doc); `## Where Anthropic now ships natively what the mod built` (bullets: the native feature, what the mod does instead, whether the mod could adopt the native path and what would be lost); `## Where the mod enforces what the guidance only recommends` (bullets); `## Where the mod is at odds with the guidance` (bullets with the exact guidance and the exact mod behaviour); `## Gaps: guidance the mod does not follow yet` (bullets); `## Gaps: things the mod does that the guidance does not address` (bullets); `## Recommendations` (a ranked list, 8-15 items, each: keep / adopt native / change / retire / investigate, one paragraph of reasoning, an effort guess of small/medium/large, and what evidence would change the call); `## Open questions` (what could not be settled from the notes and docs).
- Every claim about Anthropic guidance cites a reference note section and the URL it carries; every claim about the mod cites the mod doc file and section. Where the two conflict or a note says a figure needs rechecking, say so rather than picking one. No claim about the mod's code beyond what the docs say; where a doc is silent, say the doc is silent.
- The analysis is for the founder: direct, no hedging, no marketing. Everything in your own words; at most one direct quote per source, under 15 words. No machine paths, user names, session ids, or product names other than Anthropic's own and chassis-delegation. The file is 3,000-6,000 words.
