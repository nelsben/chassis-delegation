---
id: MOD-403
title: "Work pane on remote surfaces: rows stay on one line, a Markdown sits alone or in a fixed-width box, labels and cells align in boxes instead of space padding, and gaps are half a line"
domain: mod
tier: standard
status: merged
issue: 566
scope: [hooks/lib/workpane.tsx, hooks/lib/work.ts, CHANGELOG.md, docs/guide.md, docs/internals.md, tests/workpane.test.ts, tests/*.test.ts, tests/node/*.node.mjs, tests/harness.ts]
forbid: [bin/**, hooks/register.ts, docs/cards/**, docs/mockups/**, docs/spikes/**, hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, docs/upgrading.md]
red_test: none
gate: validate, node, test
budget: 2-attempts
spend: 12
---
## Why

Issue #566. These are facts about how the editor's pane draws a plugin tree (engine 2.1.327). They were read from its own renderer code; they are not guesses:

- **A row Box wraps.** A Box draws as a CSS flex row, and a row's default `flex-wrap` is `wrap`. The terminal does not wrap.
- **A Markdown is `width: 100%`.** Beside any sibling in a row, it takes the whole line and pushes the rest onto the next one. Today every pressable control on a remote surface is a Markdown (MOD-392). So a list row with a toggle and a title link draws on two or three lines.
- **The font is proportional.** A space is narrower than a cell, so `fit()` padding drifts: the header labels and the detail field names do not line up with the fixed-width cell boxes under them.
- **Gaps count in lines.** `gap={1}` is one full line height, so the board puts a blank line between every card.
- **Ignored there:** Text `size`, `weight` and `mono`; Button `variant` and `plain`; Box `hover`.

The fix applies only where `remote` is true; the terminal draws as today.

## Before you start

- `hooks/lib/workpane.tsx`, in order:
  - `press`, `pressLine` and `LinePart` (MOD-402), and `markNode`;
  - `header` and `headerRule`, `itemRow`, `rowNode` (its `hidden` row), and `empty()`;
  - in `board()`: the board header, and the lane head (the MOD-402 `work-lane-head-*` line and the `work-lane-bar-*` line under it);
  - `detailNode`: its first row (the trail and `work-detail-close`), `field`, and the Blocked by list;
  - the final `return`.
- `tests/workpane.test.ts`:
  - `mountWork(…, surface)`;
  - how a remote link is pressed (`ui.press({ key, link: { href } })`);
  - the MOD-395 heading test, which reads a found node's `children`.

## Design (decided by the brain; build it, do not redesign it)

### 1. Rows do not wrap

- Every Box in `workTree` drawn with `flexDirection="row"` and no `flexWrap` gains `flexWrap="nowrap"`.
- So does every Box with no `flexDirection` that holds more than one child; it also gains `flexDirection="row"`.
- Keep `flexWrap="wrap"` where it is set today: the terminal toolbar, `work-summary`, `work-detail-status`, and the Blocked by row on the terminal.
- The terminal already draws rows unwrapped, so its tests stay unchanged.

### 2. A Markdown sits alone or in a fixed-width box (remote only)

The rule: on a remote surface, every Markdown is either the only child of a column Box, or the only child of a Box with a numeric `width`.

- **`LinePart` gains `href?: string`:** a link the surface opens itself. Its text is `mdLink(label, href)`. It is not listed in `pressableLinks`, and `onLinkPress` ignores it.
- **List row (`itemRow`).** The work cell (`<Box width={L.work} overflow="hidden">`) holds, left to right:
  1. When `indent.length > 0`: an empty `<Box width={indent.length} />`.
  2. `<Box width={2}>` holding one of:
     - a parent: today's `press(\`work-toggle-${k}\`, open ? '▾' : '▸', …)`;
     - a selected leaf: today's blue `▌` Text;
     - otherwise: nothing.
  3. `markNode(it.type)` when `mark`, else `<Box width={2} />`.
  4. `<Box width={Math.max(4, L.work - indent.length - 4)} overflow="hidden">` holding `pressLine(\`work-row-head-${k}\`, parts, { sep: ' ', dim: doneLeaf })`. The parts:
     - When `numText !== ''`: `{ id: 'number', label: numText }`, plus `href: https://github.com/${v.repo}/issues/${it.number}` when `v.repo` is set.
     - A parent: `{ id: 'title', label: cut(it.title, titleW), bold }`.
     - A leaf: `{ id: 'open', label: cut(it.title, titleW), onPress: () => hd.select(it.key) }`.

  The other cells are unchanged.
- **The hidden row (`rowNode`, kind `hidden`):** on remote, `<Box key={\`work-hidden-${k}\`} flexDirection="column" paddingLeft={indentOf(r.depth).length + 2}>` holding today's `press(\`work-show-${k}\`, …)`.
- **Lane head (`board()`).** Replace the remote `work-lane-head-*` line and the `work-lane-bar-*` line under it with one row: `<Box key={\`work-lane-top-${k}\`} flexDirection="row" flexWrap="nowrap">`. It holds:
  1. `markNode(r.type)` when `mark`.
  2. `<Box width={Math.max(8, (stack ? B.col : 2 * B.col) - 16)} overflow="hidden">` holding today's `pressLine(\`work-lane-head-${k}\`, …)`, unchanged.
  3. `bar(r.done, r.leaves)`.
- **Detail head (`detailNode`):** on remote, the first row is `pressLine('work-detail-head', [{ id: 'close', label: closeLabel, onPress: () => hd.select(undefined) }, { id: 'trail', label: trailText }])`, alone on its line.
- **Blocked by (remote):**
  - The field's value is `<Box width={Math.max(8, width - 12)}>` holding `pressLine('work-by', …, { sep: ', ' })`.
  - There is one part per id: `{ id: keySlug(id), label: id, onPress: () => hd.select(target.key) }` when `leafOfCard` finds the target, else `{ id: keySlug(id), label: id }`.
- **`empty()` (remote):** `pressLine('work-clear-empty', [{ id: 'text', label: 'No work matches.' }, { id: 'clear', label: 'Clear filters', onPress: hd.clear }])`.
- The notes `press`, the board card's title `press` and the toolbar lines already sit alone on their lines. They stay as they are.

### 3. Labels align in boxes, not with spaces (remote only)

- **List header (`work-header`):** each label is `<Box width={L.<cell>}><Text dimColor bold>{cut(label, L.<cell>)}</Text></Box>`, with no padding. The COST box adds `justifyContent="flex-end"`.
- **Header rule:** `work-header-rule` is not drawn on remote.
- **Board header (`work-board-header`):** each label is `<Box key={\`work-board-head-${c}\`} width={B.col}><Text dimColor bold>{cut(label, B.col)}</Text></Box>`.
- **Detail fields (`field`):** the name is `<Box width={12}><Text dimColor>{name}</Text></Box>`.
- The terminal keeps `fit()` everywhere.

### 4. Half-line gaps (remote only)

- Every `gap={1}` on a column Box in `workTree` becomes `gap={remote ? 0.5 : 1}`.
- If the engine refuses a fractional gap (the remote mount draws nothing, or the harness reports a refused tree), use `gap={remote ? 0 : 1}` instead, and say so in your report.

### 5. Docs and marks

- Mark the change `MOD-403 (#566)` once, in the top comment block of `workpane.tsx`.
- **`docs/internals.md`:** a new section `## Drawing on the editor and the desktop`, placed above `## Developing`. It states the five facts in "Why" as rules for whoever changes the pane next:
  - rows say `nowrap`;
  - a Markdown sits alone or in a fixed-width box;
  - widths count in cells, but text is proportional, so align with boxes, not spaces;
  - gaps count in lines;
  - `size`, `weight`, `mono`, `variant`, `plain` and `hover` are not drawn in the editor.

  Say these were read from engine 2.1.327.
- **`docs/guide.md`:** fix the broken sentence in the Work pane toolbar paragraph, `… (the phone has no search). a row of state chips …`. Make it two sentences: the toolbar sentence ends after `(the phone has no search)`, and the next starts `Below it are a row of state chips …`. The rest of the paragraph stays word for word.
- **`CHANGELOG.md`:** under `## Unreleased`, `### Fixed`, one bullet `(MOD-403, #566)`.

## Tests

All new tests mount on `vscode`, except where a surface is named.

- **No wrapping:** walk the tree from `ui.find({ key: 'work-pane' })` through each node's `children`, as the MOD-395 test reads them. Do this for:
  - the list view with an open parent, two leaves and a done-hidden row;
  - the board at 80 and at 130 columns;
  - the detail of a blocked leaf at 80 columns.

  In each, every Box whose `flexDirection` is `row` or absent, and that has more than one child, has `flexWrap` `nowrap` or one of the keys `work-summary` or `work-detail-status`.
- **Markdown placement:** in the same walks, every Markdown is either the only child of its Box, or that Box has a numeric `width`. If found nodes carry no `children`, assert the named sites instead (the toggle and head boxes have widths 2 and `L.work - indent - 4`, and `work-detail-head` and `work-clear-empty` exist), and say so in your report.
- **List row:**
  - A parent row's `work-row-head-<k>` Markdown holds `#<n>` and the bold title.
  - A leaf's holds a link that selects the leaf when pressed (`href` `linkHref('work-row-head-<k>-open')`).
  - Pressing `work-toggle-<k>` folds the parent.
  - With a repo set, the `#n` link's href is the GitHub issue URL, and it is not in `pressableLinks`.
- **Labels:** no Text in `work-header` or `work-board-header` ends with a space, and `work-header-rule` is not drawn. On the terminal it is still drawn.
- **Detail:** pressing the `close` link of `work-detail-head` closes the detail. The Blocked by ids are one `work-by` Markdown.
- **Gaps:** `work-pane` has `gap` 0.5 on `vscode`, or 0 under the fallback, and 1 on the terminal.
- **Existing tests:** update the remote tests that press `work-open-*`, `work-detail-close`, `work-by-*` or `work-clear-empty`, or that read `work-lane-bar-*`, so they use the new keys and hrefs. Every terminal test passes unchanged.

## Left to you

- Fixtures, test names, and how the walk is written.

## Done when

- On remote surfaces, the pane draws as designed, and the terminal is unchanged.
- Gate validate, node and test are green.

## Review

Brain review (Opus 5.5): As designed. On remote surfaces every row Box says nowrap; a list row's work cell is fixed-width boxes (indent, a 2-wide toggle or marker, the mark, then a head box holding one Markdown with the #n issue link and the title), the hidden row is a padded column, the lane head is one row (mark, a fixed-width head, the bar), the detail head and the empty-filter line are each one Markdown, and Blocked by is one work-by Markdown in a width box. Header, board header and field labels sit in width boxes; the header rule is dropped on remote; column gaps are 0.5. The terminal is unchanged apart from the added nowrap. internals.md gains the five renderer rules; the guide sentence is fixed. Worker choices, all accepted: a Markdown whose parent is a column Box also passes the placement walk; a single-child Box with no flexDirection is left as it is; the selected marker has no trailing space; an empty STATUS label draws an empty width box; the no-repo #n test was dropped (the href part is covered with a repo set).
