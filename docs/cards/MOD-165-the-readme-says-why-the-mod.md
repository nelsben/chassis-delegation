---
id: MOD-165
title: The README says why the mod exists and reports the evidence honestly: a "Why" section with the two guidance citations, "52% consistent" ahead of "88% in one attempt", and three stale figures corrected
domain: mod
tier: standard
status: merged
scope: [README.md, docs/evidence.md, docs/contracts.md, CHANGELOG.md]
forbid: [tests/**, .claude-plugin/**, docs/cards/**]
red_test: none
gate: validate
budget: 2-attempts
spend: 10
---
## Why

A fit analysis against Anthropic's published guidance found the mod's thesis is not stated anywhere in the repo: the guidance recommends delegation, briefs, evidence and cheaper models in prose, admits a lead "sometimes starts implementing tasks itself", and offers only more prose as the remedy; the mod makes those recommendations not optional. It also found the headline figure misleads (88% counts any final verdict; 52% ended consistent) and three doc figures stale.

## Done when

- README.md gains a `## Why` section between `## How it works` and `## Evidence`, one paragraph of four to six sentences in plain prose, making exactly this argument: Anthropic's own guidance recommends delegating to fresh-context subagents, writing self-contained briefs, asking for evidence not claims, and using cheaper models for cheaper work; the same guidance notes that a coordinating agent sometimes starts doing the work itself, and its remedy is an instruction telling it to wait; no published mechanism checks a worker's claims against git or caps what one interactive attempt may spend; this mod exists because the brain forgets to delegate and forgets to pick the right tier, so it turns those recommendations into checks that refuse, queue or refute. The paragraph links two pages inline, by their public URLs only: https://code.claude.com/docs/en/agent-teams#wait-for-teammates-to-finish (the lead doing the work itself) and https://code.claude.com/docs/en/sub-agents#subagent-output-scanning (the output scan does not judge truthfulness). It claims convergence, never priority: it does not say the mod came first.
- README.md `## Evidence` lists, in this order: the task count line unchanged; `52% of tasks ended consistent: the worker's report matched git. Consistent means the report was honest, not that the task was right.`; `88% of tasks needed one attempt (any final verdict).`; the cost line unchanged. The 88% line no longer stands alone or first.
- docs/evidence.md: after the line beginning `**88% settled in one attempt**` (line 4 area) a new bullet reads `**52% (356 tasks) ended consistent**; consistent means the report matched git, not that the task was right.` The lesson under `## Attempts to settle` says `the attempt budget (default 3)` not `(default 2)`, matching the `defaultBudget` row of hooks/lib/configtable.ts, which is 3 (read it; it is out of scope, do not change it). The sentence `27 tagged releases shipped since 2 October` names the count `git tag | grep -c '^v'` prints in the worktree at the time of the change, with the span `from 2 to 25 October` (e.g. `38 tagged releases shipped from 2 to 25 October`).
- docs/contracts.md, in the lanes paragraph (around line 349): `and done-when (else the shared list)` becomes `and done-when (the shared statements first, then the lane's own; a lane with none gets the shared ones alone)`, matching MOD-162's card.ts behaviour. No other sentence changes.
- CHANGELOG.md `## Unreleased` gets a `### Changed` entry (create the heading if absent, above the existing `### Fixed`) of two or three sentences naming the Why section, the reordered evidence figures and the three corrections, tagged with this card's id. Wording generic: no product, repo, person, machine path or session names anywhere; Anthropic, Claude Code and the two public URLs are allowed. Every number written matches a number in docs/evidence/summary.json or the tag count; nothing is invented.

## Review

Consistent on attempt 1; docs only. README gains a Why section stating the thesis (the guidance recommends delegation, briefs, evidence and cheaper models; it admits the lead drifts into the work and offers prose as the remedy; nothing native checks claims against git or caps interactive spend; the mod enforces) with the two public citations, claiming convergence not priority. Evidence reordered: 52% consistent first, 88% marked any final verdict. evidence.md: 52% bullet added, budget default 3, 38 releases 2–25 October. contracts.md lane wording matches MOD-162. Read the diff: prose is as specced.
