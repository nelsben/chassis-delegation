---
id: MOD-392
title: "Work pane: on the desktop, the editor and mobile, titles, toggles, show links, Clear filters, Show done, the List/Board switch and the detail's back control are Markdown links rather than native buttons, and the footer Close goes on the desktop and the editor"
domain: mod
tier: standard
status: merged
issue: 547
spike: MOD-384
scope: [hooks/lib/workpane.tsx, hooks/lib/work.ts, CHANGELOG.md, tests/node/worklink.node.mjs, tests/workpane.test.ts, tests/*.test.ts, tests/node/*.node.mjs, tests/harness.ts]
forbid: [bin/**, docs/cards/**, docs/mockups/**, docs/spikes/**, hooks/register.ts, hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, docs/upgrading.md, docs/guide.md]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/worklink.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Issue #547. The desktop draws every `Button` as a native bordered button, `plain` included. The engine's ButtonProps doc for `plain` says: "A desktop draws its native button either way." In the Work pane, every title, ▸/▾ toggle, `N done · show`, `Clear filters`, `Show done` and the List/Board switch therefore gets a box. A board card's two-line title (MOD-389) is cut in half: line 1 sits inside the button's border and line 2 outside it. Every surface draws `Markdown`, and a `Markdown` link answers the plugin through `onLinkPress` and `pressableLinks` without opening anything. On a remote surface those controls become links with no box. The terminal draws exactly what it draws today.

## Before you start

- `hooks/lib/workpane.tsx`, the whole file: `toolbar`, `summary`, `itemRow`, `rowNode`, `empty`, the board's `card` and `lane`, the detail's `work-detail-close`, and `footer` with its two uses.
- `MarkdownProps` and `MountPressTarget` in the engine types. They are git-ignored, so read `.claude-plugin/types/claude-code/index.d.ts` in the main checkout (`git worktree list`, the first line) and search `export type MarkdownProps` and `export type MountPressTarget`. A test presses a link with `ui.press({ key, link: { href } })`.
- `tests/workpane.test.ts`: `mountWork`, and the tests that loop over `['desktop', 'vscode', 'mobile']`.

## Design (decided by the brain; build it, do not redesign it)

- **Two pure helpers in `work.ts`, marked `MOD-392 (#547)`:**
  - `export function linkHref(key: string): string` returns `` `https://work.invalid/${encodeURIComponent(key)}` ``.
  - `export function mdLink(label: string, href: string): string` returns `[<label>](<href>)`. In the label, each newline becomes a space and each of these characters gets a backslash before it: `` \ ` * _ [ ] < > ~ | # ``.
- **One helper in `workTree`:** `const remote = p.surface !== 'terminal'` and `press(key, label, onPress, o?: { dim?: boolean })`.
  - On the terminal it returns today's `<Button key={key} plain label={label} onPress={onPress} />`, with `dimColor` when `o.dim`.
  - On a remote surface it returns `<Markdown key={key} text={mdLink(label, linkHref(key))} pressableLinks={[linkHref(key)]} onLinkPress={() => onPress()} />`, with `dimColor` when `o.dim`.
  - `Markdown` comes from `p.t` beside the other elements.
- **Use `press` for these controls, with the same keys, labels and handlers as today:**
  - `work-open-*`: a list leaf's title, still `cut(it.title, titleW)` and dim when done.
  - `work-toggle-*`: a list parent's toggle and a board lane's toggle.
  - `work-show-*`: the list's hidden row and the board's `N done · show`, both dim.
  - `work-clear` and `work-clear-empty`.
  - `work-done`: Show done.
  - `work-detail-close`.
- **The board card's title on a remote surface** is one `press('work-open-<k>', cut(it.title, 2 * w), …)` with no second line, where `w` is `Math.max(4, B.col - 2)` as today. The terminal keeps `twoLines`.
- **The List/Board switch on a remote surface:** the current view draws as `<Text bold>` of its label, and the other view as `press('work-view-<other>', label, …)`. On the terminal both stay the MOD-388 primary/secondary Buttons.
- **These stay `Button` on every surface:** the state chips, Refresh, the search Input's submit, the item actions (Dispatch, Review, Unblock) and the Unblock question.
- **The footer** (`work-close`) is not drawn when `p.surface` is `desktop` or `vscode`, since those panes have their own ✕. On the terminal and on mobile it stays.
- Mark the change `MOD-392 (#547)` once, in the file's top comment block.
- `CHANGELOG.md`, `## Unreleased` (create it above `## 0.9.64` when absent), `### Changed`: one bullet `(MOD-392, #547)`.

## Tests

- `tests/node/worklink.node.mjs` (the red test):
  - `linkHref('work-open-i13')`.
  - `mdLink` with a plain label.
  - `mdLink` with a label holding `[`, `]`, `*`, `_` and a backtick, each escaped.
  - `mdLink` with a newline in the label.
- `tests/workpane.test.ts`:
  - On `desktop` at 130 columns, `work-open-<leaf>` is a Markdown whose text ends `](https://work.invalid/work-open-<leaf>)`. Pressing it with that link opens the detail.
  - On `desktop`, pressing a parent's `work-toggle-*` link closes it.
  - On `desktop`, a chip and Refresh are still Buttons.
  - `work-close` is absent on `desktop` and `vscode`, and present on the terminal and `mobile`.
  - On the terminal, `work-open-<leaf>` is still a plain Button.
  - On the `desktop` board, a card's title is one Markdown and draws no second-line Text.
- Update the existing remote-surface tests that press these keys so they press the link.

## Left to you

- How the tests find an element's type and props, the fixtures, and test names.

## Done when

- On a remote surface, the listed controls are links and the footer is drawn only where the card says.
- The terminal tree is unchanged.
- Gate validate, node and test are green.

## Review

Brain review (Opus 5.5): Built as designed, on haiku as an explore pick. linkHref and mdLink are pure and escape as given. One press helper draws today's plain Button on the terminal and a Markdown link answering onLinkPress on a remote surface, and it serves the titles, toggles, show links, Clear filters, Show done, the detail's back control and the switch's other view. The remote board card has one title link, the terminal keeps twoLines, and the footer is dropped on the desktop and vscode. The worker's choices are sound: the bold current view is wrapped in a keyed Box so tests can find it, and the blocked-by ids became links too, so the desktop draws no box there either. Paint on the desktop is still unverified; Ben's look settles it.
