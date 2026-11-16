---
id: MOD-395
title: "Work pane: a bold Work heading starts the toolbar, and the notes fold behind one dim `N notes · show` line"
domain: mod
tier: standard
status: merged
issue: 552
spike: MOD-384
scope: [hooks/lib/workpane.tsx, hooks/register.ts, CHANGELOG.md, docs/guide.md, tests/workpane.test.ts, tests/*.test.ts, tests/harness.ts]
forbid: [bin/**, docs/cards/**, docs/mockups/**, docs/spikes/**, hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, docs/upgrading.md]
red_test: none
gate: validate, test
budget: 2-attempts
spend: 10
---
## Why

Issue #552. When the Work pane is the only pane open, the engine draws no title, so nothing names it. The notes, such as the issue read state or the unknown status words, sit as full lines between the toolbar and the chips and push the table down. This is MOD-384's cards C5 and C6.

## Before you start

- `hooks/lib/workpane.tsx`: the `WorkView` and `WorkHandlers` types, the `press` helper (MOD-392), `toolbar`, and the notes block in the last `return` of `workTree`.
- `hooks/register.ts`: the Work pane module variables near `let workView` (about line 947), `workHandlers` (about line 1620) and the `workTree(p, { … })` call (about line 11726).
- `tests/workpane.test.ts`: `mountWork`, and the tests that read `work-note-*`.

## Design (decided by the brain; build it, do not redesign it)

- **The heading:** the toolbar's first child is `<Text key="work-title" bold>Work</Text>`, on every surface, before the List/Board switch.
- **State:** `WorkView` gains `notesOpen: boolean`, and `WorkHandlers` gains `notes: () => void`. In `register.ts`, a module variable `let workNotesOpen = false` sits beside `workView`, `notes` flips it and redraws, and the `workTree` call passes `notesOpen: workNotesOpen`.
- **The notes block** replaces today's, and is drawn only when `v.notes.length > 0`:
  - Folded: one `press('work-notes', \`${n} note${n === 1 ? '' : 's'} · show\`, hd.notes, { dim: true })`, where `n = v.notes.length`.
  - Open: `press('work-notes', 'hide notes', hd.notes, { dim: true })`, then today's dim wrapped `work-note-<i>` Texts below it.
- Nothing else in the pane changes.
- Mark the change `MOD-395 (#552)` once, in the file's top comment block.
- `CHANGELOG.md`, `## Unreleased` (create it above `## 0.9.65` when absent), `### Changed`: one bullet `(MOD-395, #552)`.
- `docs/guide.md`: in the Work pane paragraph that starts "The pane has a toolbar", name the `Work` heading, and add one sentence saying the notes fold behind `N notes · show`.

## Tests

In `tests/workpane.test.ts`:
- The toolbar's first child is the bold `Work` Text, on the terminal and on desktop.
- With two notes: `work-notes` reads `2 notes · show` and no `work-note-*` is drawn. Pressing it (a link press on desktop, a Button press on the terminal) draws both notes and `hide notes`, and pressing again folds them.
- With one note the label is `1 note · show`.
- With no notes, there is no `work-notes`.
- Update the existing tests that expect the notes to be drawn at once, so that they open them first.

## Left to you

- Fixtures, test names, and how the tests drive `notesOpen` (through the handler or by mounting with it).

## Done when

- The heading and the folded notes are drawn as designed on every surface.
- Gate validate and test are green.

## Review

Brain review (Opus 5.5): Built as designed. The bold Work Text is the toolbar's first child, and the notes fold behind one dim press line that reads `N note(s) · show` or `hide notes`, with the note Texts drawn only when open. workNotesOpen sits beside workView, is reset at session start, and is passed to workTree. The tests drive the fold by pressing on the terminal and on desktop. Nit: the guide's toolbar sentence puts the heading before the parenthesis that lists the controls, which reads a little awkwardly.
