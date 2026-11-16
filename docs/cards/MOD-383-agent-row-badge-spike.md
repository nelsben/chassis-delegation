---
id: MOD-383
title: "Spike: why the model badge does not show on the editor's running-agent row, and whether a mod can put it there"
domain: mod
tier: standard
status: merged
issue: 527
purpose: spike
findings: docs/spikes/MOD-383-findings.md
verdicts: [adopt, adapt, skip]
scope: [docs/spikes/MOD-383-findings.md]
forbid: [hooks/**, bin/**, tests/**, docs/cards/**, .claude-plugin/**, README.md, CHANGELOG.md]
red_test: none
gate: findings
budget: 2-attempts
spend: 10
---
## Why

Issue #527. The mod puts a model badge at the front of a briefed worker's Agent `description` (`glyphDescription` in hooks/register.ts, `withGlyph` in hooks/lib/glyph.ts). The badge reaches the host: the completion notice reads `Agent "🟢 MOD-380 standard sonnet" finished`. But the editor extension's row for a running worker reads `Agent: Running mkdir -p … · 78.5k tokens · 6 tools · 32s`, with no badge and no description. Before any build card, we need to know what that row shows, where the badge is visible today, and whether a mod has any way to reach the row.

## Before you start

- `hooks/lib/glyph.ts`: `withGlyph`, `BUILTIN_GLYPHS`.
- `hooks/register.ts`: `glyphDescription` and its two callers (search `glyphDescription(`): the Agent `tool.call` rewrite and the start of a queued spawn.
- `docs/configuration.md`: the `modelGlyphs` row.
- The engine's API types. They are git-ignored, so your worktree may not have them: read `.claude-plugin/types/claude-code/index.d.ts` in the main checkout this worktree was cut from (`git worktree list`, the first line) (search `'tool.call'`, `Agent`, `description`, `progress`, `subagent`, `ui.render`, `component:`). Cite them by `path:line`, written relative to that checkout, as `.claude-plugin/types/claude-code/index.d.ts:<line>`. Never write a `/Users/…` path into the findings file.
- Public docs on Claude Code subagents and the editor extension (any source; cite each by URL).

## Questions

1. Which field of an Agent call, or of the subagent's progress, does the editor extension's row for a running agent show, and what does it show once the agent has finished?
2. On which surfaces does the badge in the description show today: the terminal, the editor extension, the desktop app, the completion notice, the `/agents` or tasks list? For each, say how you know, or mark it unanswered.
3. Does the engine API give a mod any way to change or add to the text of a running agent's row: a `ui.render` component for agent or task rows, a field on the Agent tool result or progress events, a status or label API? Name each candidate and whether it reaches the editor surface.
4. Should we build a fix in the mod: put the badge where the row reads it (adopt), use a different visible place such as the band or the status line (adapt), or leave it and document where the badge shows (skip)? (verdict)

## Rules for this spike

- Read and cite only. Change no file except the findings file. Spawn no process that writes anything, and make no network call except web search and web fetch.
- What you see in the engine types file is an answer with a `path:line`. What you infer about the editor's behaviour without a source is `⚠ Unverified:`.
- `## Decisions this implies` names the build card(s) to cut, or none, in one line each.

## Done when

- docs/spikes/MOD-383-findings.md answers the four questions as the findings gate checks them, with Q4's verdict one of adopt, adapt or skip.
- No other file changes.

## Review

Brain review (Opus 5.5): Sound, and honest about what it could not see. The citations I checked hold: the row-label and description lines in the types, ToolProgress terminal-only, AbovePrompt terminal and desktop only, the agent.spawn rewrite at register.ts and the modelGlyphs row. The verdict is adapt: no API rewrites the editor's live activity row, so the badge needs a place the mod draws. It also caught the card calling the rewrite a tool.call hook, when it is agent.spawn. Attempt 1 was refuted only for a bare ⚠ flag with no text. Follow-ups: a probe of what draws on the vscode surface, then a status line or pane of running workers, then a docs line for modelGlyphs.
