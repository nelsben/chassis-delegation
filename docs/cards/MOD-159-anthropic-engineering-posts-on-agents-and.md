---
id: MOD-159
title: Anthropic engineering posts on agents and multi-agent systems: Building effective agents, the multi-agent research system, context engineering, writing tools for agents, long-running agent harnesses, Claude Code best practices
domain: mod
tier: standard
status: landed
repo: none
scope: [~/Documents/chassis-delegation-research/engineering-patterns/**]
forbid: []
red_test: none
gate: validate
budget: 2-attempts
spend: 4
---
## Why

chassis-delegation was built to enforce work delegation before Anthropic published much on subagent orchestration. Anthropic now has extensive docs: Claude Code subagents and agent teams, the Agent SDK, the Managed Agents platform, plugins and hooks, and engineering posts on multi-agent systems. Before judging how the mod fits that landscape we need faithful, sourced reference notes of what the guidance says; the fit analysis is a later card that reads these notes.

## Done when

- Covers at least these anthropic.com/engineering posts (find the live URLs): Building effective agents (workflow patterns incl. orchestrator-workers and evaluator-optimizer), How we built our multi-agent research system, Effective context engineering for AI agents, Writing tools for agents, Claude Code best practices, and any post from 2026 on long-running agents, harnesses, or verifying agent work. For each post, the `## Guidance and recommendations` bullets must capture the post's concrete recommendations (e.g. how to brief a subagent, when to parallelise, how to evaluate), not just its thesis.
