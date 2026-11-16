# MOD-384 findings: a UX review of the Work pane against its mockup

Types file below means `.claude-plugin/types/claude-code/index.d.ts` (git-ignored; read in the main checkout this worktree was cut from). Nobody ran or looked at the pane for this spike. Everything said about how it looks comes from the code, the layout widths and the types, and any claim about the drawn result that no source line backs is flagged Unverified (see the flags below).

Widths used in the examples, from the layout helpers:
- List (`hooks/lib/work.ts:330-334`): from 116 columns Work is `columns - 68`, Status 12, Progress 16, Card 10, Worker 22 and Cost 8. From 72 columns Work is `columns - 38` with Status, Progress and Card. Below 72, Work is `max(16, columns - 12)` with Status only.
- Board (`hooks/lib/work.ts:497-500`): from 100 columns each column is `floor((columns - 8) / 5)` cells. Below that the columns stack.
- Detail (`hooks/lib/workpane.tsx:69-70`, `hooks/lib/workpane.tsx:398`): from 116 columns the detail is 40 cells wide and the table is laid out at `columns - 42`. Below 116 the detail takes the whole pane.

## Q1

The design decisions the build cards made, with the card that made each one, the code that carries it, and whether it held up. One verdict per decision.

**D1. List widths and breakpoints (116 / 72).** Made in `docs/cards/MOD-354-the-work-pane-list-view.md:47` and carried by `hooks/lib/work.ts:330-334`. The arithmetic adds up: every mode sums to exactly `columns`, and the node tests pin it. It does not hold up well with the detail open. The detail costs 42 cells (`hooks/lib/workpane.tsx:70`), so at 116 to 157 columns the table falls back to the medium set and Worker and Cost disappear exactly when a person is looking at one item's worker. The MOD-347 review saw the same flaw in the mockup (`docs/cards/MOD-347-work-pane-mockup-redrawn-as-a-tracker.md:176`). In the medium and wide modes, Progress (16) and Card (10) are never both filled on one row: a parent fills Progress and leaves Card empty, and a leaf does the opposite (`hooks/lib/workpane.tsx:166-183`). That is 10 to 16 cells left blank on every row.
Verdict: revise

**D2. The column set and order: Work, Status, Progress, Card, Worker, Cost, with no Action column.** Made in `docs/cards/MOD-354-the-work-pane-list-view.md:96-104` and `docs/cards/MOD-356-the-work-pane-detail-panel-and-actions.md:84` ("there is no action column in the table"). Carried by `hooks/lib/workpane.tsx:110-119`. Keeping actions out of the table holds up in cells: an action button plus an Unblock question in a row would not fit at 72 to 115 columns. The cost is one extra press, into the detail, to act on an item.
Verdict: keep

**D3. Six states, their words and their order.** Made in `docs/cards/MOD-353-the-work-view-s-data-issues-and-cards-joined.md:104` and carried by `hooks/lib/work.ts:8-11` and `hooks/lib/work.ts:147-153`, with the first match winning. The words are short, the lozenges fit the 12-cell Status column (` TO REVIEW ` is the longest at 11 cells), and the text form, the chips, the board and the guide all use the same six (`docs/guide.md:265-270`). This holds up.
Verdict: keep

**D4. Reading a status by its first word through `statusMap`, with a note counting unknown words.** Made in `docs/cards/MOD-361-statusmap-a-repo-maps-its-own-status-words.md:41-53` and carried by `hooks/lib/statusmap.ts:73-74`. The data rule holds up. The note is one long sentence, about 180 characters, and it is drawn on every render above the chips (see D17).
Verdict: keep

**D5. The lozenge colours, one pair per scheme.** Made in `docs/cards/MOD-354-the-work-pane-list-view.md:49` and carried by `hooks/lib/work.ts:343-350`. They copy the mockup's tokens one to one (`docs/mockups/work-panel.html:11-15`, `docs/mockups/work-panel.html:23-27`). The scheme comes from `pickScheme`, which falls back to dark when the surface reports nothing (`hooks/lib/live.ts:122-134`). The palette holds up. Backlog has no background and no outline, so it reads as plain grey text, which suits a state with nothing happening.
Verdict: keep

**D6. Type marks as coloured glyphs on every surface (◆ ▲ ■ ✓ ● ? ○).** Made in `docs/cards/MOD-354-the-work-pane-list-view.md:50` and `docs/cards/MOD-354-the-work-pane-list-view.md:53`. That card named Svg icons as "a later decision, after the person has seen the pane". Carried by `hooks/lib/work.ts:352-360`. On the terminal this is forced, since only the remote surfaces have Svg (Types file `.claude-plugin/types/claude-code/index.d.ts:3574`). On the remote surfaces it was a choice. The glyphs carry one colour for both schemes. The spike and issue grey `#626f86` against the dark bg token `#1d2125` (`docs/mockups/work-panel.html:21`) works out to about 3.2:1. That is under the 4.5:1 that WCAG asks of text (https://www.w3.org/TR/WCAG21/#contrast-minimum).
⚠ Unverified: how wide the terminal draws ◆, ✓, ☐ and ☑. The row prefix is measured in code points (`hooks/lib/workpane.tsx:58`, `hooks/lib/workpane.tsx:127`), so a glyph drawn two cells wide would push that row's columns out of line.
Verdict: keep

**D7. The progress bar: 8 cells of █ and ░, then `done/leaves`.** Made in `docs/cards/MOD-354-the-work-pane-list-view.md:48` and `docs/cards/MOD-354-the-work-pane-list-view.md:101`. Carried by `hooks/lib/work.ts:337-341` and `hooks/lib/workpane.tsx:170-172`. It reads well in cells and is the same in the list and in the lane headers (`hooks/lib/workpane.tsx:333-335`).
Verdict: keep

**D8. The tier dot ● before the model.** Made in `docs/cards/MOD-354-the-work-pane-list-view.md:51` and `docs/cards/MOD-354-the-work-pane-list-view.md:103`. Carried by `hooks/lib/work.ts:362` and `hooks/lib/workpane.tsx:200-206`. It holds up.
Verdict: keep

**D9. Folding done work.** Done leaves sit behind `N done hidden · show`, at most 20 are listed in place, the rest show as an `older` row, and a root whose leaves are all done is hidden. Made in `docs/cards/MOD-353-the-work-view-s-data-issues-and-cards-joined.md:113` and carried by `hooks/lib/work.ts:233-245` and `hooks/lib/work.ts:265`. It holds up and keeps the active work on top. The known limit is that an all-done root has no hidden row of its own (`docs/cards/MOD-354-the-work-pane-list-view.md:179`); only the Show done toggle brings it back.
Verdict: keep

**D10. The 200-row cap with a `more` row.** Made in `docs/cards/MOD-353-the-work-view-s-data-issues-and-cards-joined.md:115` and carried by `hooks/lib/work.ts:267-268` and `hooks/lib/workpane.tsx:231-235`. It holds up. The hint says to "narrow the list with search", but mobile has no search box (`hooks/lib/workpane.tsx:79`).
Verdict: keep

**D11. The toolbar.** It holds List and Board, the search box, the epic select (only with two or more roots), Show done, the Updated time and Refresh, and it wraps. Made in `docs/cards/MOD-354-the-work-pane-list-view.md:85-89` and `docs/cards/MOD-357-the-work-pane-board-view.md:57`. Carried by `hooks/lib/workpane.tsx:75-93`.
- The current view is a non-plain primary Button and the other view is a plain one (`hooks/lib/workpane.tsx:77-78`). The terminal draws a non-plain Button as `[ label ]` and a plain one as the bare label (Types file `.claude-plugin/types/claude-code/index.d.ts:895`). So pressing Board adds four cells to Board and takes four from List, and the whole toolbar shifts.
- The pane draws no `Work` heading of its own, and the engine draws the title only when more than one pane is open (Types file `.claude-plugin/types/claude-code/index.d.ts:9603-9604`).
Verdict: revise

**D12. Search filters on Enter.** Made in `docs/cards/MOD-354-the-work-pane-list-view.md:86` ("so a redraw never lands mid-word"). Carried by `hooks/lib/workpane.tsx:79`. The engine does offer `onInput` (Types file `.claude-plugin/types/claude-code/index.d.ts:5172`), but a drawn `value` replaces the person's typing when the hook draws again (Types file `.claude-plugin/types/claude-code/index.d.ts:5150-5153`). So filtering as you type could eat keystrokes, and the choice holds up.
Verdict: keep

**D13. The summary chips: `■ Working 2`, a primary Button when on and a plain one when off.** Made in `docs/cards/MOD-354-the-work-pane-list-view.md:93` and carried by `hooks/lib/workpane.tsx:95-108`. This has the same width jump as D11: a chip turned on gains `[ ]` on the terminal (Types file `.claude-plugin/types/claude-code/index.d.ts:895`, `.claude-plugin/types/claude-code/index.d.ts:947`), and the chips after it shift. The counts are always the totals, as the mockup had them (`docs/cards/MOD-347-work-pane-mockup-redrawn-as-a-tracker.md:70`), and that part holds up.
Verdict: revise

**D14. The header row and the row styling.** The header is dim Title-case labels with no rule under it. Rows tint on hover and the selected row is tinted. Every parent title is bold. Made in `docs/cards/MOD-354-the-work-pane-list-view.md:96-99` and `docs/cards/MOD-356-the-work-pane-detail-panel-and-actions.md:84`. Carried by `hooks/lib/workpane.tsx:110-119`, `hooks/lib/workpane.tsx:132-135` and `hooks/lib/workpane.tsx:150`. With no rule, no row borders and an epic as bold as a feature, the tree has weak hierarchy (see Q3 #7).
Verdict: revise

**D15. A leaf's title is a plain Button that opens its detail.** Made in `docs/cards/MOD-356-the-work-pane-detail-panel-and-actions.md:84` and carried by `hooks/lib/workpane.tsx:154`. A Box has no `onPress` (Types file `.claude-plugin/types/claude-code/index.d.ts:740-829`), so a Button is the only way to make the row pressable. That much is forced, and the decision holds up. The cost on desktop is that "a desktop draws its native button either way" for a plain Button (Types file `.claude-plugin/types/claude-code/index.d.ts:933`).
⚠ Unverified: what a desktop or editor row looks like when its title, toggle and chips are each a native button.
Verdict: keep

**D16. Where the detail goes: beside the table from 116 columns, in place of the whole pane below that.** Made in `docs/cards/MOD-356-the-work-pane-detail-panel-and-actions.md:86-89`. Carried by `hooks/lib/workpane.tsx:69-70` and `hooks/lib/workpane.tsx:509-516`. Below 116 columns the toolbar, notes and chips go too, while the mockup keeps the toolbar (`docs/cards/MOD-347-work-pane-mockup-redrawn-as-a-tracker.md:105`). Two faults inside the detail:
- The trail is cut to `v.columns - 20` even when the detail is only 40 wide (`hooks/lib/workpane.tsx:398-400`), so beside the table it wraps instead of ending in `…`.
- The status row has no `columnGap` and no `flexWrap` (`hooks/lib/workpane.tsx:434`). The lozenge, the action button, the asked text and the Unblock question (about 40 cells of text plus two buttons, `hooks/lib/workpane.tsx:443-445`) all sit on one row in a 40-cell box.
Verdict: revise

**D17. The notes are drawn between the toolbar and the chips.** Made in `docs/cards/MOD-354-the-work-pane-list-view.md:91` and carried by `hooks/lib/workpane.tsx:521-529`. The notes are the failed-read, cap and status-word lines (`hooks/register.ts:5226-5265`, `hooks/lib/statusmap.ts:73-74`). In a repo with unknown status words the note is about 180 characters, so two to three wrapped lines sit above the chips on every render.
Verdict: revise

**D18. The detail's content.** It shows the trail, the title (wrapping), the status row, a field grid with 12-cell labels, and up to 8 activity events read from the ledger. Made in `docs/cards/MOD-356-the-work-pane-detail-panel-and-actions.md:91-108` and `docs/cards/MOD-356-the-work-pane-detail-panel-and-actions.md:58-65`. Carried by `hooks/lib/workpane.tsx:402-498` and `hooks/lib/work.ts:452-480`. The fields and the ledger activity hold up: they are real data, where the mockup's activity was invented (`docs/mockups/work-panel.html:480-492`).
Verdict: keep

**D19. The actions.** Dispatch, Review and Unblock each put one line to the session, the item reads `Asked · waiting for the session` for up to 10 minutes, and Unblock asks first inline. Made in `docs/cards/MOD-356-the-work-pane-detail-panel-and-actions.md:50-56` and `docs/cards/MOD-356-the-work-pane-detail-panel-and-actions.md:94-97`. Carried by `hooks/lib/work.ts:415-437` and `hooks/lib/workpane.tsx:437-449`. The behaviour holds up and matches the mockup (`docs/cards/MOD-347-work-pane-mockup-redrawn-as-a-tracker.md:116-118`). Only their placement differs from the mockup (D2).
Verdict: keep

**D20. Five board columns, with a blocked item in Queued carrying its lozenge.** Made in `docs/cards/MOD-357-the-work-pane-board-view.md:42` and carried by `hooks/lib/work.ts:484-494` and `hooks/lib/workpane.tsx:292-299`. It holds up and matches the mockup (`docs/cards/MOD-347-work-pane-mockup-redrawn-as-a-tracker.md:96`).
Verdict: keep

**D21. One lane per root, each with a toggle and a progress bar.** Made in `docs/cards/MOD-357-the-work-pane-board-view.md:62-63` and carried by `hooks/lib/workpane.tsx:305-336`. It holds up.
Verdict: keep

**D22. The board layout: side by side from 100 columns, everything stacked below.** Made in `docs/cards/MOD-357-the-work-pane-board-view.md:43` and `docs/cards/MOD-357-the-work-pane-board-view.md:65`. Carried by `hooks/lib/work.ts:497-500` and `hooks/lib/workpane.tsx:337-363`. At 100 columns a column is 18 cells, so a card title gets 16 (`hooks/lib/workpane.tsx:273`). At 130 columns it gets 22. One sample title, `Expire saved carts after 30 days` (32 characters), is cut in both. Below 100 columns every column of every open lane is listed one after another, which makes a long scroll.
Verdict: revise

**D23. At most 10 cards a column per lane, with `+N more`, and Done keeping the last 10.** Made in `docs/cards/MOD-357-the-work-pane-board-view.md:49` and carried by `hooks/lib/work.ts:521-526`. It holds up. `+N more` is plain text you cannot press (`hooks/lib/workpane.tsx:312`).
Verdict: keep

**D24. The board card itself.** It is a surface background with padding 1 and no border. Its title is cut to one line, and the type mark, number and card id sit side by side. The board header has no counts. Made in `docs/cards/MOD-357-the-work-pane-board-view.md:61` and `docs/cards/MOD-357-the-work-pane-board-view.md:67-71`. Carried by `hooks/lib/workpane.tsx:264-303` and `hooks/lib/workpane.tsx:369-377`. The mockup puts the card id at the right and the column counts in the header (`docs/cards/MOD-347-work-pane-mockup-redrawn-as-a-tracker.md:96-98`). Both are drawable: there is `justifyContent` (Types file `.claude-plugin/types/claude-code/index.d.ts:801`) and the counts are known.
Verdict: revise

**D25. The empty states.** They are `Reading the issues…`, `No work breakdown yet` with its hint, `No work matches.` and `Everything here is done.`. Made in `docs/cards/MOD-354-the-work-pane-list-view.md:108-112` and carried by `hooks/lib/workpane.tsx:238-249`. The wording holds up. While the first read runs, `Reading the issues…` is drawn twice: once in the toolbar (`hooks/lib/workpane.tsx:90`) and once as the body (`hooks/lib/workpane.tsx:239`).
Verdict: keep

**D26. The footer close button, a lower-case `close` with `role="dismiss"` at the bottom of the tree.** Made in `docs/cards/MOD-354-the-work-pane-list-view.md:114` and carried by `hooks/lib/workpane.tsx:503-507`. On desktop the role draws the native close control at the site's edge (Types file `.claude-plugin/types/claude-code/index.d.ts:956-957`). On the terminal it sits after up to 200 rows, and Esc already closes the pane (Types file `.claude-plugin/types/claude-code/index.d.ts:9596`). The lower case does not match `Close` in the detail (`hooks/lib/workpane.tsx:418`).
Verdict: revise

**D27. The data rules: the tree, card placement, and the `No epic` group.** Made in `docs/cards/MOD-353-the-work-view-s-data-issues-and-cards-joined.md:93-109` and carried by `hooks/lib/work.ts:94-213`. They hold up, and they are not a look question.
Verdict: keep

## Q2

Where the pane as built differs from the mockup, and whether each difference was forced by the engine or was a choice. "Forced" means the types file shows the engine cannot draw the mockup's version in that place.

1. **Font and units.** The mockup is proportional 13px type laid out in pixels (`docs/mockups/work-panel.html:32`). The pane is laid out in monospace cells. **Forced:** a surface draws "in character cells of the surface's monospace metric" (Types file `.claude-plugin/types/claude-code/index.d.ts:9667-9668`, `.claude-plugin/types/claude-code/index.d.ts:9672`).
2. **Row separators and the header band.** The mockup has rows 36px high with a 1px bottom border, and a header on a `--surface` band with a border (`docs/mockups/work-panel.html:116-117`). The pane has neither.
   - The per-row rule is **forced** as a border. Box has only `borderStyle`, `borderColor` and `borderDimColor` (Types file `.claude-plugin/types/claude-code/index.d.ts:823-825`), with no `borderTop` or `borderBottom`, though Ink itself has them (https://raw.githubusercontent.com/vadimdemedes/ink/master/readme.md, Box › borderStyle). ⚠ Unverified: that a full border costs a row above and below each row in the pane.
   - The header band is a **choice**: Box has `backgroundColor` (Types file `.claude-plugin/types/claude-code/index.d.ts:826`), and the header is drawn without one (`hooks/lib/workpane.tsx:110-119`).
3. **Type icons.** The mockup uses 16px rounded SVG squares (`docs/mockups/work-panel.html:302-304`). The pane uses coloured glyphs. **Forced on the terminal**, which has no Svg (Types file `.claude-plugin/types/claude-code/index.d.ts:3574`). **A choice on desktop, editor and mobile** (`docs/cards/MOD-354-the-work-pane-list-view.md:53`).
4. **Chevrons and the progress bar.** The mockup's are SVG (`docs/mockups/work-panel.html:305-312`). The pane uses ▾/▸ Buttons and █/░ cells. This splits the same way as item 3: forced on the terminal, a choice elsewhere (`hooks/lib/workpane.tsx:138`, `hooks/lib/workpane.tsx:170-171`).
5. **Lozenge shape and the backlog outline.** The mockup has rounded lozenges and an outlined backlog (`docs/mockups/work-panel.html:93-99`). The pane draws a Text with a background and no outline. **Forced:** Text has no border or radius prop (Types file `.claude-plugin/types/claude-code/index.d.ts:11838-11856`), and Box has no radius (`.claude-plugin/types/claude-code/index.d.ts:740-829`).
6. **Chips.** The mockup chip is a bold count over a label with a 3px coloured left edge (`docs/mockups/work-panel.html:78-85`). The pane draws `■ Working 2` on one line.
   - The left edge is **forced** as a border (no per-side border, see item 2).
   - The two-line chip is a **choice**: a column Box could hold it (`docs/cards/MOD-354-the-work-pane-list-view.md:93`).
7. **The List/Board segmented control.** The mockup draws a segmented control (`docs/mockups/work-panel.html:53-57`). The pane uses one primary Button and one plain one.
   - The segment look is **forced**: the surface owns Button chrome (Types file `.claude-plugin/types/claude-code/index.d.ts:895`, `.claude-plugin/types/claude-code/index.d.ts:944-947`).
   - Mixing plain and non-plain, which makes the width jump, is a **choice** (`docs/cards/MOD-357-the-work-pane-board-view.md:57`).
8. **The `Work` title in the toolbar.** The mockup has one (`docs/mockups/work-panel.html:344`). The pane has none. **Choice** (`docs/cards/MOD-354-the-work-pane-list-view.md:85-89`). The engine's title shows only with two or more panes (Types file `.claude-plugin/types/claude-code/index.d.ts:9603-9604`).
9. **Search timing.** The mockup filters as you type (`docs/cards/MOD-347-work-pane-mockup-redrawn-as-a-tracker.md:65`). The pane filters on Enter. **Choice** (`docs/cards/MOD-354-the-work-pane-list-view.md:86`). `onInput` exists (Types file `.claude-plugin/types/claude-code/index.d.ts:5172`), but see D12.
10. **No search or epic select on mobile.** **Forced** (Types file `.claude-plugin/types/claude-code/index.d.ts:3574`, `.claude-plugin/types/claude-code/index.d.ts:3612-3613`).
11. **The Show done checkbox.** The mockup draws an SVG checkbox (`docs/mockups/work-panel.html:349-350`). The pane uses a `☐`/`☑` label. **Forced:** no surface's element table has a checkbox (Types file `.claude-plugin/types/claude-code/index.d.ts:3577-3645`).
12. **The Action column, and buttons on board cards.** The mockup has both (`docs/mockups/work-panel.html:370`, `docs/mockups/work-panel.html:437`). The pane has actions only in the detail. **Choice** (`docs/cards/MOD-356-the-work-pane-detail-panel-and-actions.md:84`, `docs/cards/MOD-357-the-work-pane-board-view.md:74`). The Unblock question under a table row (`docs/mockups/work-panel.html:333-338`) goes with it.
13. **Cost alignment.** The mockup right-aligns Cost (`docs/mockups/work-panel.html:129`). The pane left-aligns it. **Choice** (`hooks/lib/workpane.tsx:189-193`). `justifyContent` exists (Types file `.claude-plugin/types/claude-code/index.d.ts:801`).
14. **The selected row's accent edge.** The mockup draws a 2px accent left edge (`docs/mockups/work-panel.html:119`). The pane tints the row only. As a border it is **forced** (item 2). A glyph in the first cell would be a **choice**, and the pane does not draw one (`hooks/lib/workpane.tsx:135`).
15. **Parent weights.** The mockup has an epic at 700 and a feature at 600 (`docs/mockups/work-panel.html:120`). In the pane every parent is bold. Semi-bold is **forced** away, since Text has `bold` only (Types file `.claude-plugin/types/claude-code/index.d.ts:11850`). Drawing epics and features alike is a **choice** (`hooks/lib/workpane.tsx:150`).
16. **The `show` link in hidden rows and the inline `Clear filters`.** The mockup uses links (`docs/mockups/work-panel.html:392`, `docs/mockups/work-panel.html:425`). The pane uses Buttons, and `Clear filters` sits in the chip row.
   - Buttons are **forced**: a Link takes only an https URL (Types file `.claude-plugin/types/claude-code/index.d.ts:5307-5315`).
   - Moving Clear filters is a **choice** (`docs/cards/MOD-354-the-work-pane-list-view.md:111`).
17. **Centred empty states.** The mockup centres them (`docs/mockups/work-panel.html:133`). The pane left-aligns them. **Choice:** `alignItems` exists (Types file `.claude-plugin/types/claude-code/index.d.ts:799`).
18. **Board column backgrounds and the header counts.** The mockup puts each column on a surface background and shows its count in the header (`docs/mockups/work-panel.html:142`, `docs/mockups/work-panel.html:146`, `docs/mockups/work-panel.html:451`). The pane shows neither. **Choice** (`docs/cards/MOD-357-the-work-pane-board-view.md:61`, `docs/cards/MOD-357-the-work-pane-board-view.md:64`).
19. **The board card.** The mockup card has a 1px border, a title clamped to two lines, and the card id at the right (`docs/mockups/work-panel.html:149-155`). The pane card has a background, no border, a title cut to one line, and the id beside the number.
   - The id position is a **choice** (`hooks/lib/workpane.tsx:274-285`).
   - The one-line title is a **choice** (`docs/cards/MOD-357-the-work-pane-board-view.md:68`). Box has `height` and `overflow` (Types file `.claude-plugin/types/claude-code/index.d.ts:806`, `.claude-plugin/types/claude-code/index.d.ts:827`), and Text wraps (`.claude-plugin/types/claude-code/index.d.ts:11855`). ⚠ Unverified: whether a Button label wraps, which decides whether the pressable title can take two lines.
   - Leaving out the border is a **choice**. A full border is drawable (`.claude-plugin/types/claude-code/index.d.ts:823`), but ⚠ Unverified: what it costs in rows.
20. **Sideways scrolling at medium widths.** The mockup's board scrolls sideways at 720px (`docs/cards/MOD-347-work-pane-mockup-redrawn-as-a-tracker.md:100`). The pane stacks the columns. **Forced:** the pane's scroll window is rows only (Types file `.claude-plugin/types/claude-code/index.d.ts:11128-11139`).
21. **One column at a time at 420px.** The mockup picks the column with a Select (`docs/mockups/work-panel.html:449`). The pane stacks every column. **Choice** (`docs/cards/MOD-357-the-work-pane-board-view.md:65`). Select exists on every surface but mobile (Types file `.claude-plugin/types/claude-code/index.d.ts:3574`).
22. **The detail's left border.** The mockup gives the side detail a left border (`docs/mockups/work-panel.html:89`). The pane has none. **Forced** as a border (item 2).
23. **The toolbar under a full-width detail.** The mockup keeps it (`docs/cards/MOD-347-work-pane-mockup-redrawn-as-a-tracker.md:105`). The pane drops the toolbar and the chips. **Choice** (`docs/cards/MOD-356-the-work-pane-detail-panel-and-actions.md:89`).
24. **The breadcrumb.** In the mockup its links filter to the epic (`docs/mockups/work-panel.html:494`), and the panel has both Back and Close (`docs/mockups/work-panel.html:505-506`). In the pane the trail is plain dim text and the panel has one of the two buttons. **Choice** (`docs/cards/MOD-356-the-work-pane-detail-panel-and-actions.md:92`).
25. **The activity timeline.** The mockup draws a line with dots and the newest dot in accent (`docs/mockups/work-panel.html:179-184`). The pane lists dim `●` rows. The line is **forced** as a border (item 2). The accent on the first dot is a **choice** (`hooks/lib/workpane.tsx:492`).
26. **The Unblock question's wording.** The mockup asks `MOD-901 still overlaps it. Unblock anyway?` (`docs/mockups/work-panel.html:320`). The pane asks `Still waiting on MOD-901. Unblock anyway?`. **Choice** (`docs/cards/MOD-356-the-work-pane-detail-panel-and-actions.md:96`).

The forced differences come down to five engine limits:
- no per-side border (items 2, 6, 14, 22, 25)
- no Svg on the terminal (items 3 and 4)
- no radius, semi-bold weight or checkbox (items 5, 11, 15)
- no sideways scroll (item 20)
- no fields on mobile (item 10)

Everything else was our choice.

## Q3

The parts that look or read worst today, ranked by how much a person working in the pane would notice. Each item names the code behind it. Nobody saw the drawn pane, so the ranking comes from the widths and the code.

1. **Board card titles cut to one short line.** A title gets 16 cells at 100 columns and 22 at 130 (`hooks/lib/work.ts:498`, `hooks/lib/workpane.tsx:273`). With the detail open at 116 to 141 columns the board falls to stack mode (`hooks/lib/workpane.tsx:261`). The title is a card's main content, and most real titles are longer than 22 characters (in the sample, 5 of the 8 working, queued or review titles are).
2. **On desktop, every plain Button may be a native button.** That covers every leaf title, toggle, chip, `Show done` and `N done hidden · show` (Types file `.claude-plugin/types/claude-code/index.d.ts:933`; `hooks/lib/workpane.tsx:89`, `hooks/lib/workpane.tsx:102`, `hooks/lib/workpane.tsx:138`, `hooks/lib/workpane.tsx:154`, `hooks/lib/workpane.tsx:220`). ⚠ Unverified: the types say so for desktop, but nobody has looked at the drawn pane there, and the editor's behaviour is not stated.
3. **The toolbar and chips jump when pressed.** Turning a chip on, or switching List and Board, swaps a bare label for `[ label ]` (`hooks/lib/workpane.tsx:77-78`, `hooks/lib/workpane.tsx:102`; Types file `.claude-plugin/types/claude-code/index.d.ts:895`). The control a person just pressed moves under the pointer.
4. **The detail's status row is crowded.** The lozenge, the button and the asked text touch, with no gap and no wrap. The Unblock question runs past the 40-cell side box, and the trail wraps instead of being cut (`hooks/lib/workpane.tsx:398-400`, `hooks/lib/workpane.tsx:434-450`). This is the row where a person acts.
5. **Notes push the work down.** One status-word note is about 180 characters, which is two or three lines at the top on every render, above the chips (`hooks/lib/workpane.tsx:521-529`, `hooks/lib/statusmap.ts:73-74`).
6. **A leaf row has a hole in it, and the useful columns go when the detail opens.** At 72 columns and up, a leaf leaves the 16-cell Progress cell blank between its lozenge and its card id (`hooks/lib/workpane.tsx:166-183`). From 116 columns, opening the detail drops Worker and Cost until 158 columns (`hooks/lib/workpane.tsx:70`, `hooks/lib/work.ts:331`).
7. **Weak hierarchy.**
   - There is no `Work` heading when the pane is alone (Types file `.claude-plugin/types/claude-code/index.d.ts:9603-9604`).
   - The column header is dim text with no rule (`hooks/lib/workpane.tsx:110-119`).
   - Epic and feature rows are equally bold (`hooks/lib/workpane.tsx:150`).
   - The chips, notes and toolbar are all one weight.
8. **Stacked board below 100 columns.** Every column of every open lane is listed in turn (`hooks/lib/workpane.tsx:337-351`), so the board becomes a long list that repeats what the table already shows.
9. **Loading and empty states.** `Reading the issues…` shows twice (`hooks/lib/workpane.tsx:90`, `hooks/lib/workpane.tsx:239`). `No work matches.` sits in the body while `Clear filters` sits in the chip row above it (`hooks/lib/workpane.tsx:106`, `hooks/lib/workpane.tsx:248`).
10. **Colour.**
    - A surface that reports no scheme gets the dark palette (`hooks/lib/live.ts:122-134`).
    - The spike and issue glyph grey is about 3.2:1 on the dark bg (D6).
    - The type and tier colours have one value for both schemes (`hooks/lib/work.ts:352-362`).
    - ⚠ Unverified: what the terminal's real background is, and so the real contrast.
11. **Very narrow widths.** Below 28 columns the narrow layout needs 28 cells (16 for Work and 12 for Status, `hooks/lib/work.ts:333`), so the Status cell is clipped. The `more` row tells a mobile reader to search, and mobile has no search box (`hooks/lib/workpane.tsx:79`, `hooks/lib/workpane.tsx:233`). ⚠ Unverified: how many cells wide the mobile pane is.
12. **Small alignment and detail points.**
    - Cost is left-aligned (`hooks/lib/workpane.tsx:191`).
    - The board card id sits beside the number (`hooks/lib/workpane.tsx:284`).
    - The board header has no counts (`hooks/lib/workpane.tsx:371-375`).
    - The selected row has no edge marker (`hooks/lib/workpane.tsx:135`).
    - The footer `close` is lower case and at the very bottom (`hooks/lib/workpane.tsx:505`).
13. **Long titles with wide characters.** `cut` counts code points, not cells (`hooks/lib/workpane.tsx:58-63`). A title with CJK or emoji is clipped by `overflow="hidden"` with no `…`. ⚠ Unverified: how often adopters' titles carry such characters.

## Q4

A ranked list of changes, each one line, with the files it would touch, whether the engine can draw it today, and a size.
- Files: `workpane.tsx` and `work.ts` are under `hooks/lib/`.
- Tests: `tests/workpane.test.ts` is the engine test, and `tests/node/*.node.mjs` are the pure tests.
- The **Draw** column says whether the engine can draw it today.

| # | Change | Files | Draw | Size |
|---|---|---|---|---|
| C1 | Board card title on two lines: line 1 as the pressable Button and line 2 as a dim Text holding the rest, cut with `…`, split at a word by a pure `twoLines(title, w)` | `hooks/lib/workpane.tsx`, `hooks/lib/work.ts`, `tests/node/workboard.node.mjs`, `tests/workpane.test.ts` | yes (Button and Text, `.claude-plugin/types/claude-code/index.d.ts:895`, `.claude-plugin/types/claude-code/index.d.ts:11855`) | small |
| C2 | The same chrome on and off for the chips and the List/Board switch: both non-plain, on is `primary` and off is `secondary` | `hooks/lib/workpane.tsx`, `tests/workpane.test.ts` | yes (`.claude-plugin/types/claude-code/index.d.ts:941-951`) | small |
| C3 | Detail status row with `columnGap={1}` and `flexWrap="wrap"`, the trail cut to the detail's own width (40 beside the table), and the Unblock question wrapping under the lozenge | `hooks/lib/workpane.tsx`, `tests/workpane.test.ts` | yes (`.claude-plugin/types/claude-code/index.d.ts:798`, `.claude-plugin/types/claude-code/index.d.ts:803`) | small |
| C4 | Merge Progress and Card into one 16-cell column (the bar on a parent, the card id on a leaf); the 10 cells this frees bring Worker in from 72 columns and keep it with the detail open | `hooks/lib/work.ts`, `hooks/lib/workpane.tsx`, `tests/node/worklayout.node.mjs`, `tests/workpane.test.ts`, `docs/guide.md` | yes | medium |
| C5 | Notes drawn below the table, or as one dim `N notes · show` line that opens them | `hooks/lib/workpane.tsx`, `hooks/register.ts` (a `workUi` flag), `tests/workpane.test.ts` | yes | small |
| C6 | A bold `Work` heading at the start of the toolbar | `hooks/lib/workpane.tsx`, `tests/workpane.test.ts` | yes | small |
| C7 | A dim `─` rule under the table header, and the header in capitals as the board's is | `hooks/lib/workpane.tsx`, `tests/workpane.test.ts` | yes | small |
| C8 | Epic rows bold and feature rows not bold | `hooks/lib/workpane.tsx`, `tests/workpane.test.ts` | yes (`.claude-plugin/types/claude-code/index.d.ts:11850`) | small |
| C9 | A selected-row marker: an accent `▌` in the row's first cell | `hooks/lib/workpane.tsx`, `tests/workpane.test.ts` | yes | small |
| C10 | Cost right-aligned, and the board card id at the right of its row (`justifyContent="space-between"`) | `hooks/lib/workpane.tsx`, `tests/workpane.test.ts` | yes (`.claude-plugin/types/claude-code/index.d.ts:801`) | small |
| C11 | Board header counts (`QUEUED 4`), summed over the lanes drawn | `hooks/lib/work.ts`, `hooks/lib/workpane.tsx`, `tests/node/workboard.node.mjs`, `tests/workpane.test.ts` | yes | small |
| C12 | Loading and empty states: one `Reading the issues…`, and a `Clear filters` button beside `No work matches.` | `hooks/lib/workpane.tsx`, `tests/workpane.test.ts` | yes | small |
| C13 | Footer label `Close`, as the detail's is | `hooks/lib/workpane.tsx`, `tests/workpane.test.ts` | yes | small |
| C14 | A per-scheme colour for the type marks and tier dots, with the spike and issue grey lightened in dark | `hooks/lib/work.ts`, `hooks/lib/workpane.tsx`, `tests/node/worklayout.node.mjs` | yes (raw colours, `.claude-plugin/types/claude-code/index.d.ts:11836`) | small |
| C15 | A floor for very narrow widths: below 28 columns the Status cell becomes a 2-cell coloured `●` | `hooks/lib/work.ts`, `hooks/lib/workpane.tsx`, `tests/node/worklayout.node.mjs` | yes | small |
| C16 | In stack mode, a `Column` Select picks one board column (not on mobile, which keeps stacking) | `hooks/lib/workpane.tsx`, `hooks/register.ts`, `tests/workpane.test.ts`, `docs/guide.md` | yes, except mobile (`.claude-plugin/types/claude-code/index.d.ts:3574`) | medium |
| C17 | Svg type icons on desktop, editor and mobile, keeping glyphs on the terminal | `hooks/lib/workpane.tsx`, `hooks/lib/work.ts`, `tests/workpane.test.ts` | partly: Svg exists on remote surfaces (`.claude-plugin/types/claude-code/index.d.ts:3574`), but ⚠ Unverified: how a CSS-pixel Svg (`.claude-plugin/types/claude-code/index.d.ts:11558-11562`) sits in a cell-laid row | medium |
| C18 | An Action column in the table from 116 columns while no detail is open, with the actions as in the detail | `hooks/lib/work.ts`, `hooks/lib/workpane.tsx`, `tests/node/worklayout.node.mjs`, `tests/workpane.test.ts`, `docs/guide.md` | yes | medium |
| C19 | `+N more` on the board made pressable, to lift that lane's cap | `hooks/lib/work.ts`, `hooks/lib/workpane.tsx`, `hooks/register.ts`, tests | yes | small |

The changes grouped into build cards, in the order to run them. They all touch `hooks/lib/workpane.tsx`, so they run one after another.
- **Card A, steady controls and the detail row:** C2, C3, C12, C13 and C9. Small, and every change is in `workpane.tsx`.
- **Card B, readable board cards:** C1, C10 and C11. Small to medium.
- **Card C, list columns and hierarchy:** C4, C7, C8, C14 and C15. Medium, and it moves the layout widths, so the node layout tests change.
- **Card D, the top of the pane:** C5 and C6. Small, and it waits on Ben's placement call.
- **Card E, the stack-mode column select:** C16. Medium, and it waits on Ben.
- **Card F, an Svg icon probe:** C17, as a probe first: mount one Svg in a row on desktop and in the editor and report how it sits, then a build card.
- **Card G, row actions at wide widths:** C18. Optional, and it waits on Ben.
- C19 is held: it is low value next to the filters.

## Q5

Should the mockup be updated to match what the pane can really draw before any build card?

- **Most differences are choices, not limits.** Of the 26 differences in Q2, the forced ones come down to five engine limits: per-side borders, Svg on the terminal, radius and weight, sideways scroll, and fields on mobile. Most of the rest are choices the cards made and can unmake against the current mockup. Examples are the column Select (Q2 #21), the action column (Q2 #12), the card id position (Q2 #19) and the header counts (Q2 #18).
- **Ben has already turned down a cell-accurate mockup.** He rejected the first two mockups, which were drawn on a character grid, as reading "as terminal output and an old design" (`docs/cards/MOD-347-work-pane-mockup-redrawn-as-a-tracker.md:16`). Redrawing the page to the cell limits would bring that look back as the target.
- **Each build card already does the mapping.** MOD-354 mapped pixels to cells in its Design (`docs/cards/MOD-354-the-work-pane-list-view.md:47`, `docs/cards/MOD-354-the-work-pane-list-view.md:53`). With the forced list in Q2 above, later cards can design against what is possible without a new page. A redraw would be one more card ahead of the cards in Q4.

The mockup stays the visual target. The build cards cite Q2 of this file for what the cells force.

Verdict: keep

## Decisions this implies

- Cut card A first: steady chip and view-switch chrome, the detail status row (gap, wrap, trail cut to its own width), one loading line, the `Close` footer label and a selected-row marker (C2, C3, C12, C13, C9).
- Cut card B second: board card titles on two lines, the card id at the right, and counts in the board header (C1, C10, C11).
- Cut card C third: merge Progress and Card into one column so Worker shows from 72 columns, with a header rule, epics bolder than features, per-scheme mark colours and a floor for very narrow widths (C4, C7, C8, C14, C15).
- Cut card D fourth: a `Work` heading and the notes moved below the table or behind `N notes · show` (C5, C6).
- Ben: where the notes go, below the table or behind a one-line `N notes · show`. Recommendation: behind the one-line toggle, so the chips stay at the top.
- Ben: the on/off look of the chips and the view switch, either `primary` against `secondary` (both bracketed on the terminal) or both plain with a `●`/`○` marker in the label. Recommendation: primary against secondary, which keeps one width and uses the engine's own emphasis.
- Ben: look at the pane once on desktop (or in the editor) before card A, and say whether the native-button rows read badly. Q3 #2 is unverified, and if it is bad it moves ahead of the board work.
- Cut card E after D, only if Ben wants it: a `Column` Select in stack mode in place of stacking every column. Recommendation: yes; it is what the mockup had (Q2 #21).
- Cut card F as a probe before any Svg build: one Svg type icon in a row on desktop and in the editor, reporting how it aligns with the cells.
- Ben: an Action column in the table at wide widths with no detail open (card G). Recommendation: hold it until cards A to C have shipped and he has used the pane, since one press into the detail is the only cost today.
- Leave the mockup page as it is (Q5 keep); the build cards cite Q2 of this file for the forced differences.
