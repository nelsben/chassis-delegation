---
id: MOD-158
title: Claude Agent SDK and the Claude Code Workflow tool: subagents in the SDK, orchestration patterns, hooks, sessions, custom tools, and any public documentation of the Workflow/ultracode multi-agent orchestration
domain: mod
tier: standard
status: landed
repo: none
scope: [~/Documents/chassis-delegation-research/agent-sdk-orchestration/**]
forbid: []
red_test: none
gate: validate
budget: 2-attempts
spend: 4
---
## Why

chassis-delegation was built to enforce work delegation before Anthropic published much on subagent orchestration. Anthropic now has extensive docs: Claude Code subagents and agent teams, the Agent SDK, the Managed Agents platform, plugins and hooks, and engineering posts on multi-agent systems. Before judging how the mod fits that landscape we need faithful, sourced reference notes of what the guidance says; the fit analysis is a later card that reads these notes.

## Done when

- Covers at least: the Agent SDK overview and its subagents page (defining agents programmatically, AgentDefinition fields), SDK hooks (events, what they can block or modify), SDK sessions and resuming, custom tools/MCP in the SDK, the SDK's guidance on orchestrator vs worker roles and context isolation, and the Claude Code Workflow tool or ultracode (agent()/parallel()/pipeline(), phases, resume) if any public page or changelog documents it; if nothing public exists for the Workflow tool, say so.
