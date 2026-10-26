---
id: MOD-169
title: The README and a new docs/alignment.md say how the mod fits Anthropic's subagent guidance: where it follows it, where it makes it a check, where it fills a gap or does more, and (on the page) where it differs
domain: mod
tier: standard
status: merged
scope: [README.md, docs/alignment.md, CHANGELOG.md]
forbid: [hooks/**, tests/**, .claude-plugin/**, docs/cards/**]
red_test: none
gate: validate
budget: 2-attempts
spend: 10
---
## Why

A fit analysis against Anthropic's published subagent and orchestration guidance found the mod follows most of it, turns much of it from advice into checks, and adds two things nothing published does (checking a worker's claims against git, a per-attempt dollar ceiling for interactive workers). The README's Why paragraph states the thesis; a reader still cannot see the itemised map with sources. Subagent guidance is where readers will compare the mod first.

## Done when

- Sources read first, not copied: the fit analysis `~/Documents/chassis-delegation-research/fit-analysis/fit-analysis.md` and the five notes `~/Documents/chassis-delegation-research/{claude-code-subagents,agent-sdk-orchestration,engineering-patterns,managed-agents,plugins-and-hooks}/reference.md` with each folder's `sources.md`. Those paths appear in no committed file. Every Anthropic URL the new text cites appears in one of those sources.md files; no other URL about Anthropic's guidance is cited. Every statement about the mod is checked against the docs in the worktree as they stand now (0.9.29), not taken from the analysis: in particular `review` now defaults to `on-frontier`, `delegateOnly` to `warn`, a lane's done-when adds to the shared one, and a repo=none gate runs in the checkout. Anything the analysis lists as a gap that the current docs show fixed is described as current behaviour, not a gap.
- docs/alignment.md is a new page, titled `# How chassis-delegation fits Anthropic's guidance`, with these sections in order: `## Where it follows the guidance` (the brief as the only channel to the worker, what a brief holds, gradeable done-when statements, evidence and a runnable check, a separate judge, cheaper models for cheaper work, fresh context per worker); `## Where it makes the guidance a check` (each item: what the guidance recommends, then what the mod refuses, queues or refutes; covering at least the complete brief, evidence, the retry cap, spend caps, the brain keeping its hands off, distinct files per parallel worker, never pushing to main, least privilege); `## Where it fills a gap or does more` (at least: claims checked against git, which the native output scan says it does not judge; a per-attempt dollar ceiling for interactive workers; escalation that depends on which claim failed; the ledger of every attempt; the dry run before a spawn); `## Where it differs` (stated plainly, each with what the guidance says and what the mod does: a worker's `scope+=` amend is applied on its own word; the ready fallback starts workers outside the mod's hooks; `delegateOnly: deny`, an opt-in, makes even a one-line edit a card where the guidance keeps quick edits in the main thread; it cuts its own worktrees and sets effort per step where native features now exist); `## Sources` (one line per cited page: title and URL). Each bullet in the first four sections names its source URL inline and the mod doc and section that shows the mod's side, as a relative link (e.g. `[contracts.md](contracts.md#how-a-report-is-verified)`). One to three lines per bullet. The page claims convergence, never priority.
- README.md gains `## How it fits Anthropic's guidance` directly after `## Why` and before `## Evidence`: three short labelled lists, **Follows**, **Enforces**, **Adds**, three to five one-line bullets each, no URLs in the bullets, then one line `Sources, and where the mod differs: [docs/alignment.md](docs/alignment.md).` The section is at most 22 lines and does not repeat the Why paragraph's sentences. README `## Documentation` gains, directly after the Evidence line, `- [Fit with Anthropic's guidance](docs/alignment.md): where the mod follows, enforces and adds to Anthropic's subagent guidance, and where it differs.`
- CHANGELOG.md `## Unreleased` (create it above `## 0.9.29` if absent) gets an `### Added` entry of one or two sentences naming the README section and the new page, tagged with this card's id.
- Wording rules for every changed file: in your own words; at most one direct quote per cited page, under 15 words, in quotation marks; no table or passage from a source copied. No product, repo, person, employer, machine path or session names; Anthropic, Claude Code, the Claude Agent SDK and Claude Managed Agents may be named. Any number used appears in docs/evidence/summary.json or the current docs; none is invented. The hand-back report lists every URL cited.

## Review

Consistent on attempt 1; docs only. Read the README section (20 lines, Follows/Enforces/Adds, no URLs, link to the page) and all 122 lines of docs/alignment.md: five sections in the card's order, every bullet cites a public Anthropic URL plus the mod doc section; all 15 relative anchors resolve to real headings; no quotes; claims match 0.9.29 (review on-frontier, delegateOnly warn); convergence, not priority. "Where it differs" states scope+= self-amends, the ready fallback, deny, and own worktrees/effort plainly. Hygiene 0. The worker flagged docs/review-and-merge.md's table still labelling `off` as the review default (missed by MOD-166); fixed separately.
