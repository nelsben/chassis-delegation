# MOD-383 findings: the model badge on the editor's running-agent row

Types file below means `.claude-plugin/types/claude-code/index.d.ts` (git-ignored; read in the main checkout).

## Q1

Which field the editor row shows, running and finished.

- The mod writes the badge into the Agent spawn's `description` and nothing else: `hooks/lib/glyph.ts:67` (`withGlyph`), `hooks/register.ts:896` (`glyphDescription`), callers `hooks/register.ts:10822` (a queued spawn through `$.agent.spawn`) and `hooks/register.ts:10926` (the `agent.spawn` rewrite, `next({ ...e, description: ... })`). The card calls the second one a `tool.call` rewrite; in the code it is the `agent.spawn` event (Types file:3827).
- The engine says a rewritten `description` "is what the task shows as" (Types file:251-254) and that `$.agent.list()` returns it as the agent's "row's label" (Types file:132-134). So the engine's own row label carries the badge.
- The row the card quotes, `Agent: Running mkdir -p ... · 78.5k tokens · 6 tools · 32s`, reads as the latest activity of the subagent plus counters. The public docs describe it as "live progress rows with their latest activity" under the tool-call group, and the agent map as "status, elapsed time, and token count" per subagent: https://code.claude.com/docs/en/vs-code (Focus view and agent map sections). Neither source lists a description or a model on that row.
- The completion notice does carry the description: `Agent "🟢 MOD-380 standard sonnet" finished` (quoted in the card's Why).
- What the editor row shows once finished: the docs for the terminal panel say a successful subagent's row is removed at once, and a failed or stopped one stays 30 s (https://code.claude.com/docs/en/sub-agents, subagent panel section). The docs give no finished-state row text for the editor extension.

⚠ Unverified: which Agent field the editor's running row reads. The row text in the card is the only evidence; no source names the field, and the extension's code is not available to this spike. The most likely reading is that the row shows the live activity string, not `description`, which matches the badge not showing.
Unanswered: what the editor row shows after the agent finishes (no source).

## Q2

Surfaces where the badge shows today.

- Completion notice: shown. Source: the card's Why, the notice reads `Agent "🟢 MOD-380 standard sonnet" finished`.
- Editor extension, running row: not shown. Source: the card's Why (`Agent: Running mkdir ...`, no badge, no description).
- Editor extension, the tool-call row of the Agent call itself: the docs say the delegation row reads "the subagent's name followed by a short task description" (https://code.claude.com/docs/en/sub-agents), which is the `description`, so the badge likely shows there. ⚠ Unverified: that this holds in the editor extension, and that the badge survives its rendering.
- Terminal: the same doc text (a tool-call row with the description) applies, and `$.agent.list()` reports the badged description as the row label (Types file:132-134). ⚠ Unverified: no terminal run was observed in this spike.
- `/agents` or `/tasks` list: `/tasks` lists background subagents and "names the model on the subagent's row" (https://code.claude.com/docs/en/sub-agents, the `/tasks` section, v2.1.242+). The engine's own model name is shown there, so a badge adds little. ⚠ Unverified: whether the row prints `description`.
- Desktop app: Unanswered: no source says what the desktop app's agent row prints.

## Q3

Engine API candidates for changing the text of a running agent's row.

- `ui.render` for `ToolUse`: draws the Agent call's transcript row; "Raised on every surface" (Types file:9186, props at Types file:9160-9225 include `tool`, `input`, `isRunning`). Reaches the editor surface for the transcript row. It does not name the live progress row under the group, so ⚠ Unverified: whether the editor's "Agent: Running ..." line is this row.
- `ui.render` for `ToolGroup`: "Raised on every surface" (Types file:9290, at 9292). Same caveat: the group is the container the docs say live progress rows sit under, but the types do not say the progress rows are part of its drawing. ⚠ Unverified.
- `ui.render` for `ToolProgress`: "Raised on the terminal surface only" (Types file:9372), and its only kind is the `background_hint` pill (Types file:9365-9385). It does not reach the editor and does not carry agent progress.
- `ui.render` for `Spinner`: terminal and desktop only (Types file:9403); not the editor.
- `ui.render` for `AbovePrompt` (the band): "Raised on the terminal and desktop surfaces only" (Types file:9545). Not the editor.
- `$.ui.status(text)`: pins one plugin line under the prompt (Types file:2260-2270). The types do not say which surfaces draw it. ⚠ Unverified: that the editor draws it. The VS Code doc lists "a toast or a status line above the prompt box" as something a mod can draw there (https://code.claude.com/docs/en/vs-code, plugins and mods section, extension v2.1.299+).
- `$.ui.toast` and `$.ui.notice`: same doc line for the editor; they are transient or fixed, not a per-agent row.
- Panes: the editor's table has `Box`, `Text`, `Button`, `Input`, `Select`, `Svg`, `Link`, `Code`, `Markdown` (Types file:3633-3645), and the doc lists "a pane beside the conversation" for the editor. A pane could list running agents with badges (read from `$.agent.list()`, Types file:122-165). It would be a new place, not the existing row.
- Agent tool result or progress event fields: no field in `AgentSpawnInput` (Types file:232-320), `AgentInfo` (Types file:122-165) or `BackgroundTaskSummary` (Types file:641-660) is a progress or label field beyond `description`. Unanswered: whether any API writes the progress activity string; none was found in the types.

## Q4

Verdict: adapt

- The row the card quotes is live activity text the engine builds; no type lets a mod rewrite it on the editor, and `ToolProgress` is terminal-only with one kind (Types file:9365-9385). So putting the badge where that row reads it (adopt) has no API behind it.
- Skipping leaves the badge visible only in the completion notice and, likely, the Agent tool-call row. The mod's `$.agent.list()` already gives the label and status of every agent (Types file:122-165), so a visible place the mod controls is possible.
- The place has to reach the editor: the band (`AbovePrompt`) does not (Types file:9545); `$.ui.status`, `$.ui.toast` and a pane are named for the editor in the public doc (https://code.claude.com/docs/en/vs-code, plugins and mods section). A first build is a status line (or a pane) that lists running workers with their badge, from `$.agent.list()`. ⚠ Unverified: that `$.ui.status` is drawn on the editor surface in practice; a mount test on the `vscode` surface (Types file:37-55) would settle it before building.
- Also document in `docs/configuration.md` (the `modelGlyphs` row, line 102) where the badge shows and where it does not.

## Decisions this implies

- Cut a probe card: mount a `ToolUse`/`ToolGroup` render and a `$.ui.status` call on the `vscode` surface and report what draws, before any build.
- Cut a build card (after the probe): a status line or pane listing running workers with their badge from `$.agent.list()`, shown on the surfaces that draw it.
- Cut a docs card: say in the `modelGlyphs` row of `docs/configuration.md` where the badge shows (completion notice, Agent call row) and that the editor's running-agent row does not show it.
