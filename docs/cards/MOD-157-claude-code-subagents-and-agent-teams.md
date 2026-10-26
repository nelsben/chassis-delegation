---
id: MOD-157
title: Claude Code subagents and agent teams: custom subagents (.claude/agents), the Agent tool, background agents, worktree isolation, teammates and SendMessage, subagent permissions and model selection
domain: mod
tier: standard
status: landed
repo: none
scope: [~/Documents/chassis-delegation-research/claude-code-subagents/**]
forbid: []
red_test: none
gate: validate
budget: 2-attempts
spend: 4
---
## Why

chassis-delegation was built to enforce work delegation before Anthropic published much on subagent orchestration. Anthropic now has extensive docs: Claude Code subagents and agent teams, the Agent SDK, the Managed Agents platform, plugins and hooks, and engineering posts on multi-agent systems. Before judging how the mod fits that landscape we need faithful, sourced reference notes of what the guidance says; the fit analysis is a later card that reads these notes.

## Done when

- Covers at least: the Claude Code subagents docs page (custom agent definition files, frontmatter fields, tools, model, when Claude delegates automatically vs on request), background agents and how results come back, the fork/general-purpose/Explore/Plan built-in agents, agent teams or teammates and inter-agent messaging if documented, worktree isolation for agents, how subagents inherit or are denied permissions, and any documented limits (concurrency, context, nesting).
