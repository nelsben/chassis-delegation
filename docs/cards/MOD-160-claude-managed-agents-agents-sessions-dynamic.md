---
id: MOD-160
title: Claude Managed Agents: agents, sessions, dynamic workflows (phases of many agents), outcomes and graders, scheduled deployments, and how verification of agent work is framed there
domain: mod
tier: standard
status: landed
repo: none
scope: [~/Documents/chassis-delegation-research/managed-agents/**]
forbid: []
red_test: none
gate: validate
budget: 2-attempts
spend: 4
---
## Why

chassis-delegation was built to enforce work delegation before Anthropic published much on subagent orchestration. Anthropic now has extensive docs: Claude Code subagents and agent teams, the Agent SDK, the Managed Agents platform, plugins and hooks, and engineering posts on multi-agent systems. Before judging how the mod fits that landscape we need faithful, sourced reference notes of what the guidance says; the fit analysis is a later card that reads these notes.

## Done when

- Covers at least: the Managed Agents overview, agent and session objects and versioning, dynamic workflows (how many agents are coordinated in phases, what the orchestrator sees), outcomes/graders (how a rubric is expressed and how iteration against it works), scheduled deployments, tools (sandbox, MCP, Skills, vaults) as they bear on isolation, and pricing or limits pages that bear on cost tiering. If a feature is listed as beta or research preview, say so.
