---
id: MOD-161
title: Claude Code plugins, hooks, settings and skills as a mod's integration surface: hook events (SubagentStart/SubagentStop and the rest), plugin manifest and userConfig, permission rules, skills, and the Claude Code changelog entries since 2026-01 that touch subagents or hooks
domain: mod
tier: standard
status: landed
repo: none
scope: [~/Documents/chassis-delegation-research/plugins-and-hooks/**]
forbid: []
red_test: none
gate: validate
budget: 2-attempts
spend: 4
---
## Why

chassis-delegation was built to enforce work delegation before Anthropic published much on subagent orchestration. Anthropic now has extensive docs: Claude Code subagents and agent teams, the Agent SDK, the Managed Agents platform, plugins and hooks, and engineering posts on multi-agent systems. Before judging how the mod fits that landscape we need faithful, sourced reference notes of what the guidance says; the fit analysis is a later card that reads these notes.

## Done when

- Covers at least: the hooks reference (every event name, its input JSON shape in words, what a hook may block or inject, matcher syntax), the plugins docs (manifest fields, components, marketplaces, userConfig if documented), the settings and permissions docs (allow/deny rules, how they apply to subagents), the skills docs (SKILL.md frontmatter, when skills auto-trigger), and the Claude Code CHANGELOG on GitHub (anthropics/claude-code): list each 2026 entry that mentions subagents, agents, hooks, worktrees, teams or workflows, by version and date.
