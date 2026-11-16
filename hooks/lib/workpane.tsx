// MOD-354: the Work pane, the list view. A column of a toolbar (search, epic select, Show done, Refresh), the notes, the state
// chips, then the table: one row per item, parents with a toggle and a progress bar, leaves with a lozenge, a card, a worker and a
// cost. Drawn in character cells from the host's elements; no `$` here: register.ts builds the view and the handlers.
// MOD-388 (#538): the List and Board switch and the state chips are never plain (secondary off, primary on), so a press keeps their width;
// the detail status row has a gap and wraps, its trail cut to its own width; `Reading the issues…` shows only once something is loaded;
// an empty filter result offers Clear filters beside `No work matches.`; the footer reads Close; a selected leaf has a blue marker.
// MOD-395 (#552): a bold Work heading starts the toolbar, and the notes fold behind one dim `N notes · show` line.
// MOD-393 (#548): a progress bar is two coloured boxes (no █ or ░, which show gaps on the desktop), a stacked board heading counts the folded
// cards too (`laneCount`), and a chip that is off with a count of 0 is dim.
// MOD-392 (#547): on a remote surface the controls that were plain Buttons are Markdown links (`press`), so the desktop draws no box around
// a title or a toggle; the footer Close is drawn on the terminal and on mobile only, the desktop and vscode panes have their own close.
import type { RenderNode } from 'claude-code'

import type { Scheme } from './live'
import type { PaneTable } from './pane'
import { modelGlyph, type GlyphMap } from './glyph'
import { ACTION_LABEL, boardCounts, boardLayout, BOARD_COLS, BOARD_LABEL, keySlug, leafOfCard, linkHref, LOZENGE, laneCount, mdLink, progressCells, SELECTED_BG, STATE_LABEL, SURFACE_BG, TIER_COLOR, TRACK_BG, TYPE_MARK, markColor, twoLines, workLayout, WORK_STATES, type BoardCol, type BoardLane, type WorkAction, type WorkEvent, type WorkItem, type WorkModel, type WorkRow, type WorkState, type WorkUi } from './work'

export type WorkView = {
  model: WorkModel
  /** workRows(model, ui), made by register.ts */
  rows: readonly WorkRow[]
  ui: WorkUi
  /** e.props.bodyColumns */
  columns: number
  scheme: Scheme
  /** 'Updated 4 min ago' */
  updated?: string
  notes: readonly string[]
  /** MOD-395: the notes are drawn open */
  notesOpen: boolean
  /** a read of the issues is running */
  reading: boolean
  /** owner/name, for the issue links */
  repo?: string
  /** MOD-357: the list (the table) or the board */
  view: 'list' | 'board'
  /** MOD-387 (#537): the modelGlyphs map, or 'off'; the badge beside the worker is drawn only with a map */
  glyphs?: GlyphMap | 'off'
  /** MOD-357: workBoard(model, ui), given when the view is the board */
  lanes?: readonly BoardLane[]
  /** MOD-356: the open leaf, its ancestors root first, its action, whether it was asked, the Unblock question and its ledger events */
  detail?: { item: WorkItem; trail: readonly WorkItem[]; action?: WorkAction; asked: boolean; confirming: boolean; activity: readonly WorkEvent[] }
}

export type WorkHandlers = {
  /** MOD-357: the List and Board switch */
  view: (v: 'list' | 'board') => void
  /** open or close a parent */
  toggle: (key: string) => void
  /** show a parent's hidden done children */
  show: (parent: string) => void
  /** a state filter on or off */
  chip: (state: WorkState) => void
  query: (text: string) => void
  /** 'all' or a root's key */
  root: (value: string) => void
  showDone: () => void
  clear: () => void
  /** MOD-395: fold or unfold the notes */
  notes: () => void
  refresh: () => void
  close: () => void
  /** MOD-356: open a leaf's detail, or close it with undefined */
  select: (key: string | undefined) => void
  /** MOD-356: the action button of an item */
  act: (key: string) => void
  /** MOD-356: the Unblock question: true is Unblock, false is Cancel */
  confirm: (key: string, yes: boolean) => void
}

// A cell is cut with an ellipsis to its width and padded to it; a row's prefix is measured in code points.
const cells = (text: string) => [...text].length
const cut = (text: string, w: number): string => (cells(text) <= w ? text : `${[...text].slice(0, Math.max(0, w - 1)).join('')}…`)
const fit = (text: string, w: number): string => {
  const c = cut(text, w)
  return c + ' '.repeat(Math.max(0, w - cells(c)))
}
const indentOf = (depth: number): string => '  '.repeat(Math.min(depth, 6))
const doneFg = (scheme: Scheme): string => LOZENGE.done[scheme].fg

export function workTree(p: PaneTable, v: WorkView, hd: WorkHandlers): RenderNode {
  const { Box, Text, Button, Input, Select, Link, Markdown } = p.t
  // MOD-392 (#547): a control is a native Button on the terminal; on a remote surface it is a Markdown link, which draws no box
  const remote = p.surface !== 'terminal'
  const press = (key: string, label: string, onPress: () => void, o: { dim?: boolean } = {}): RenderNode =>
    remote ? (
      <Markdown key={key} text={mdLink(label, linkHref(key))} pressableLinks={[linkHref(key)]} onLinkPress={() => onPress()} dimColor={o.dim} />
    ) : (
      <Button key={key} plain label={label} onPress={onPress} {...(o.dim ? { dimColor: true } : {})} />
    )
  const side = v.columns >= 116
  const L = workLayout(v.detail !== undefined && side ? v.columns - 42 : v.columns)
  const filtered = v.ui.query.trim() !== '' || v.ui.states.size > 0 || v.ui.root !== undefined
  const narrowSurface = p.surface === 'mobile'
  const roots = v.model.roots
  // MOD-387 (#537): the model's badge beside the worker in the list, the board card and the detail; '' when there is none to draw
  const badge = (it: WorkItem): string => (it.model === undefined || it.model === '–' || v.glyphs === undefined || v.glyphs === 'off' ? '' : modelGlyph(it.model, v.glyphs))

  // MOD-392 (#547): on a remote surface the current view is bold text and the other a link; the terminal keeps both Buttons (MOD-388)
  const viewSwitch = (view: 'list' | 'board', label: string): RenderNode => {
    if (!remote) return <Button key={`work-view-${view}`} label={label} variant={v.view === view ? 'primary' : 'secondary'} onPress={() => hd.view(view)} />
    return v.view === view ? (
      <Box key={`work-view-${view}`}>
        <Text bold>{label}</Text>
      </Box>
    ) : (
      press(`work-view-${view}`, label, () => hd.view(view))
    )
  }

  const toolbar = (
    <Box key="work-toolbar" flexDirection="row" flexWrap="wrap" columnGap={2}>
      <Text key="work-title" bold>
        Work
      </Text>
      {viewSwitch('list', 'List')}
      {viewSwitch('board', 'Board')}
      {narrowSurface ? null : <Input key="work-search" placeholder="Search work" value={v.ui.query} submitLabel="Search" onSubmit={(text: string) => hd.query(text)} />}
      {narrowSurface || roots.length < 2 ? null : (
        <Select
          key="work-epic"
          label="Epic"
          options={[{ value: 'all', label: 'All' }, ...roots.map(r => ({ value: r.key, label: r.group ? 'No epic' : `#${r.number} ${r.title}` }))]}
          value={v.ui.root ?? 'all'}
          onSelect={(value: string) => hd.root(value)}
        />
      )}
      {press('work-done', v.ui.showDone ? '☑ Show done' : '☐ Show done', hd.showDone)}
      {v.reading && v.model.total > 0 ? <Text dimColor>Reading the issues…</Text> : v.updated ? <Text dimColor>{v.updated}</Text> : null}
      <Button key="work-refresh" label="Refresh" onPress={hd.refresh} />
    </Box>
  )

  // MOD-393 (#548): 8 cells, the done part in the done colour and the rest in the track colour, then the count
  const bar = (done: number, leaves: number): RenderNode => {
    const n = progressCells(done, leaves)
    return (
      <Box flexDirection="row">
        {n > 0 ? (
          <Box key="work-bar-done" width={n} backgroundColor={doneFg(v.scheme)}>
            <Text>{' '.repeat(n)}</Text>
          </Box>
        ) : null}
        {8 - n > 0 ? (
          <Box key="work-bar-track" width={8 - n} backgroundColor={TRACK_BG[v.scheme]}>
            <Text>{' '.repeat(8 - n)}</Text>
          </Box>
        ) : null}
        <Text>{` ${done}/${leaves}`}</Text>
      </Box>
    )
  }

  const summary = (
    <Box key="work-summary" flexDirection="row" flexWrap="wrap" columnGap={2}>
      {WORK_STATES.map(s => {
        const on = v.ui.states.has(s)
        return (
          <Box key={`work-state-${s}`} flexDirection="row">
            <Text color={LOZENGE[s][v.scheme].fg}>■ </Text>
            <Button key={`work-chip-${s}`} label={`${STATE_LABEL[s]} ${v.model.counts[s]}`} variant={on ? 'primary' : 'secondary'} {...(!on && v.model.counts[s] === 0 ? { dimColor: true } : {})} onPress={() => hd.chip(s)} />
          </Box>
        )
      })}
      {filtered ? press('work-clear', 'Clear filters', hd.clear) : null}
    </Box>
  )

  const header = (
    <Box key="work-header" flexDirection="row">
      <Text dimColor>{fit('WORK', L.work)}</Text>
      {/* MOD-390 (#540): at a dot-wide status the label is left out, a cut word reads worse than none */}
      <Text dimColor>{fit(L.status > 2 ? 'STATUS' : '', L.status)}</Text>
      {L.card ? <Text dimColor>{fit('CARD', L.card)}</Text> : null}
      {L.worker ? <Text dimColor>{fit('WORKER', L.worker)}</Text> : null}
      {L.cost ? <Text dimColor>{'COST'.padStart(L.cost)}</Text> : null}
    </Box>
  )
  // MOD-390 (#540): one dim rule under the header, the full width of the cells
  const headerRule = (
    <Text key="work-header-rule" dimColor>
      {'─'.repeat(L.work + L.status + L.card + L.worker + L.cost)}
    </Text>
  )

  const itemRow = (it: WorkItem, depth: number, open: boolean | undefined): RenderNode => {
    const k = keySlug(it.key)
    const parent = it.children.length > 0
    const indent = indentOf(depth)
    const numText = it.number !== undefined ? `#${it.number}` : ''
    // the prefix before the title: indent, toggle (or two spaces), the type glyph and a space, then `#n ` when numbered
    const prefixW = indent.length + 2 + 2 + (numText !== '' ? cells(numText) + 1 : 0)
    const titleW = Math.max(4, L.work - prefixW)
    const doneLeaf = !parent && it.state === 'done'
    const mark = it.group ? null : TYPE_MARK[it.type]
    const lozenge = parent ? null : LOZENGE[it.state][v.scheme]
    // MOD-390 (#540): only an epic and the No epic group are bold; below 28 columns a leaf's status is a dot
    const bold = it.type === 'epic' || it.group === true
    const dot = L.status < 12
    const hover = { backgroundColor: v.scheme === 'light' ? '#f1f2f4' : '#2c333a' }
    const selected = !parent && v.detail !== undefined && v.detail.item.key === it.key
    return (
      <Box key={`work-row-${k}`} flexDirection="row" hover={hover} {...(selected ? { backgroundColor: SELECTED_BG[v.scheme] } : {})}>
        <Box width={L.work} overflow="hidden" flexDirection="row">
          <Text>{indent}</Text>
          {parent ? press(`work-toggle-${k}`, open ? '▾' : '▸', () => hd.toggle(it.key)) : selected ? <Text color="#1d7afc">▌ </Text> : <Text>{'  '}</Text>}
          {parent ? <Text>{' '}</Text> : null}
          {mark ? <Text color={markColor(it.type, v.scheme)}>{mark.glyph} </Text> : <Text>{'  '}</Text>}
          {numText !== '' ? (
            v.repo !== undefined ? (
              <Link key={`work-issue-${k}`} href={`https://github.com/${v.repo}/issues/${it.number}`} label={numText} />
            ) : (
              <Text dimColor>{numText}</Text>
            )
          ) : null}
          {numText !== '' ? <Text>{' '}</Text> : null}
          {parent ? (
            <Text bold={bold} wrap="truncate-end">
              {cut(it.title, titleW)}
            </Text>
          ) : (
            press(`work-open-${k}`, cut(it.title, titleW), () => hd.select(it.key), { dim: doneLeaf })
          )}
        </Box>
        <Box width={L.status}>
          {lozenge ? (
            dot ? (
              <Text color={lozenge.fg}>● </Text>
            ) : (
              <Text bold color={lozenge.fg} backgroundColor={lozenge.bg}>
                {` ${STATE_LABEL[it.state].toUpperCase()} `}
              </Text>
            )
          ) : L.mode === 'narrow' && parent && !dot ? (
            <Text dimColor>{`${it.done}/${it.leaves}`}</Text>
          ) : null}
        </Box>
        {L.card ? (
          <Box width={L.card} overflow="hidden" flexDirection="row">
            {parent ? (
              bar(it.done, it.leaves)
            ) : (
              <Text wrap="truncate-end">{it.card ?? ''}</Text>
            )}
          </Box>
        ) : null}
        {L.worker ? (
          <Box width={L.worker} overflow="hidden" flexDirection="row">
            {!parent ? workerCell(it) : null}
          </Box>
        ) : null}
        {L.cost ? (
          <Box width={L.cost} overflow="hidden">
            <Text>{(!parent && typeof it.usd === 'number' ? `$${it.usd.toFixed(2)}` : '').padStart(L.cost)}</Text>
          </Box>
        ) : null}
      </Box>
    )
  }

  const workerCell = (it: WorkItem): RenderNode => {
    if (it.model !== undefined) {
      const dot = it.tier !== undefined ? TIER_COLOR[it.tier] : undefined
      const text = [it.model, it.attempt].filter((x): x is string => x !== undefined && x !== '').join(' · ') + (it.state === 'working' && it.running !== undefined ? ` · ${it.running}` : '')
      const glyph = badge(it)
      return (
        <Box flexDirection="row">
          {glyph !== '' ? <Text>{`${glyph} `}</Text> : dot ? <Text color={dot}>● </Text> : <Text dimColor>● </Text>}
          <Text wrap="truncate-end">{text}</Text>
        </Box>
      )
    }
    const dim = it.slot ? 'waiting for a slot' : it.onDisk ? 'worktree on disk' : it.by !== undefined && it.by.length > 0 ? `by ${it.by.join(', ')}` : ''
    return <Text dimColor wrap="truncate-end">{dim}</Text>
  }

  const rowNode = (r: WorkRow, i: number): RenderNode => {
    if (r.kind === 'item') return itemRow(r.item, r.depth, r.open)
    if (r.kind === 'hidden') {
      const k = keySlug(r.parent)
      return (
        <Box key={`work-hidden-${k}`} flexDirection="row">
          <Text>{`${indentOf(r.depth)}  `}</Text>
          {press(`work-show-${k}`, `${r.n} done hidden · show`, () => hd.show(r.parent), { dim: true })}
        </Box>
      )
    }
    if (r.kind === 'older') {
      return (
        <Box key={`work-older-${keySlug(r.parent)}`} flexDirection="row">
          <Text dimColor>{`${indentOf(r.depth)}  ${r.n} older done not shown`}</Text>
        </Box>
      )
    }
    return (
      <Box key={`work-more-${i}`} flexDirection="row">
        <Text dimColor>{`… ${r.n} more rows: narrow the list with search or a filter`}</Text>
      </Box>
    )
  }

  const empty = (): RenderNode => {
    if (v.model.total === 0 && v.reading) return <Text dimColor>Reading the issues…</Text>
    if (v.model.total === 0) {
      return (
        <Box flexDirection="column">
          <Text bold>No work breakdown yet</Text>
          <Text dimColor>Import one with /delegation tree import &lt;file&gt;, or start one with /delegation land epic &lt;title&gt;.</Text>
        </Box>
      )
    }
    if (!filtered) return <Text>Everything here is done.</Text>
    return (
      <Box flexDirection="row" columnGap={2}>
        <Text>No work matches.</Text>
        {press('work-clear-empty', 'Clear filters', hd.clear)}
      </Box>
    )
  }

  const table = (
    <Box key="work-table" flexDirection="column">
      {header}
      {headerRule}
      {v.rows.map((r, i) => rowNode(r, i))}
      {v.rows.length === 0 ? empty() : null}
    </Box>
  )

  // MOD-357: the board: a lane per epic, a card per leaf in the column of its state.
  const board = (): RenderNode => {
    const B = boardLayout(v.detail !== undefined && side ? v.columns - 42 : v.columns)
    const lanes = v.lanes ?? []
    const stack = B.mode === 'stack'
    const counts = boardCounts(lanes) // MOD-389 (#539)
    const card = (it: WorkItem): RenderNode => {
      const k = keySlug(it.key)
      const w = Math.max(4, B.col - 2)
      const [line1, line2] = twoLines(it.title, w)
      const mark = TYPE_MARK[it.type]
      const selected = v.detail !== undefined && v.detail.item.key === it.key
      const lozenge = LOZENGE[it.state][v.scheme]
      const by = it.by ?? []
      const cost = typeof it.usd === 'number' ? ` · $${it.usd.toFixed(2)}` : ''
      return (
        <Box key={`work-card-${k}`} flexDirection="column" backgroundColor={selected ? SELECTED_BG[v.scheme] : SURFACE_BG[v.scheme]} paddingLeft={1} paddingRight={1}>
          {remote ? press(`work-open-${k}`, cut(it.title, 2 * w), () => hd.select(it.key), { dim: it.state === 'done' }) : <Button key={`work-open-${k}`} plain {...(it.state === 'done' ? { dimColor: true } : {})} label={line1} onPress={() => hd.select(it.key)} />}
          {!remote && line2 !== '' ? <Text dimColor={it.state === 'done'}>{line2}</Text> : null}
          <Box flexDirection="row" justifyContent="space-between">
            <Box flexDirection="row">
              <Text color={markColor(it.type, v.scheme)}>{mark.glyph} </Text>
              {it.number !== undefined ? (
                v.repo !== undefined ? (
                  <Link key={`work-issue-${k}`} href={`https://github.com/${v.repo}/issues/${it.number}`} label={`#${it.number}`} />
                ) : (
                  <Text dimColor>{`#${it.number}`}</Text>
                )
              ) : null}
            </Box>
            {it.card !== undefined ? <Text dimColor>{it.card}</Text> : null}
          </Box>
          {(it.state === 'working' || it.state === 'review') && it.model !== undefined ? (
            <Box flexDirection="row">
              {badge(it) !== '' ? <Text>{`${badge(it)} `}</Text> : it.tier !== undefined ? <Text color={TIER_COLOR[it.tier]}>● </Text> : <Text dimColor>● </Text>}
              <Text wrap="truncate-end">{[it.model, it.attempt].filter((x): x is string => x !== undefined && x !== '').join(' · ') + cost}</Text>
            </Box>
          ) : null}
          {it.state === 'blocked' ? (
            <Box flexDirection="row">
              <Text bold color={lozenge.fg} backgroundColor={lozenge.bg}>
                {` ${STATE_LABEL.blocked.toUpperCase()} `}
              </Text>
              {by.length > 0 ? <Text dimColor>{` by ${by.join(', ')}`}</Text> : null}
            </Box>
          ) : null}
          {it.state === 'queued' && it.slot ? <Text dimColor>waiting for a slot</Text> : null}
          {it.state === 'queued' && it.onDisk ? <Text dimColor>worktree on disk</Text> : null}
        </Box>
      )
    }
    const lane = (l: BoardLane): RenderNode => {
      const r = l.root
      const k = keySlug(r.key)
      const mark = r.group ? null : TYPE_MARK[r.type]
      const body = (c: BoardCol): RenderNode[] => {
        const out: RenderNode[] = l.cols[c].map(card)
        if (c === 'done' && l.doneHidden > 0) out.push(press(`work-show-${k}`, `${l.doneHidden} done · show`, () => hd.show(r.key), { dim: true }))
        if (l.more[c] > 0) out.push(<Text key={`work-more-${k}-${c}`} dimColor>{`+${l.more[c]} more`}</Text>)
        return out
      }
      return (
        <Box key={`work-lane-${k}`} flexDirection="column" gap={1}>
          <Box flexDirection="row">
            {press(`work-toggle-${k}`, l.open ? '▾' : '▸', () => hd.toggle(r.key))}
            <Text>{' '}</Text>
            {mark ? <Text color={markColor(r.type, v.scheme)}>{mark.glyph} </Text> : null}
            {r.number !== undefined ? (
              v.repo !== undefined ? (
                <Link key={`work-issue-${k}`} href={`https://github.com/${v.repo}/issues/${r.number}`} label={`#${r.number}`} />
              ) : (
                <Text dimColor>{`#${r.number}`}</Text>
              )
            ) : null}
            {r.number !== undefined ? <Text>{' '}</Text> : null}
            <Text bold wrap="truncate-end">
              {r.group ? 'No epic' : cut(r.title, Math.max(4, B.col * (stack ? 1 : 2)))}
            </Text>
            <Text>{'  '}</Text>
            {bar(r.done, r.leaves)}
          </Box>
          {!l.open ? null : stack ? (
            <Box flexDirection="column" gap={1}>
              {BOARD_COLS.map(c => {
                const nodes = body(c)
                if (nodes.length === 0) return null
                return (
                  <Box key={`work-colbox-${k}-${c}`} flexDirection="column">
                    <Text dimColor>{`${BOARD_LABEL[c].toUpperCase()} · ${laneCount(l, c)}`}</Text>
                    <Box key={`work-col-${k}-${c}`} flexDirection="column" gap={1} width={B.col}>
                      {nodes}
                    </Box>
                  </Box>
                )
              })}
            </Box>
          ) : (
            <Box flexDirection="row" columnGap={2}>
              {BOARD_COLS.map(c => {
                const nodes = body(c)
                return (
                  <Box key={`work-col-${k}-${c}`} flexDirection="column" gap={1} width={B.col}>
                    {nodes.length > 0 ? nodes : <Text dimColor>—</Text>}
                  </Box>
                )
              })}
            </Box>
          )}
        </Box>
      )
    }
    return (
      <Box key="work-board" flexDirection="column" gap={1}>
        {stack || lanes.length === 0 ? null : (
          <Box key="work-board-header" flexDirection="row" columnGap={2}>
            {BOARD_COLS.map(c => (
              <Text key={`work-board-head-${c}`} dimColor>
                {fit(`${BOARD_LABEL[c].toUpperCase()} ${counts[c]}`, B.col)}
              </Text>
            ))}
          </Box>
        )}
        {lanes.map(lane)}
        {lanes.length === 0 ? empty() : null}
      </Box>
    )
  }
  const main = (): RenderNode => (v.view === 'board' ? board() : table)

  const lozengeOf = (it: WorkItem): RenderNode => {
    const l = LOZENGE[it.state][v.scheme]
    return (
      <Text bold color={l.fg} backgroundColor={l.bg}>
        {` ${STATE_LABEL[it.state].toUpperCase()} `}
      </Text>
    )
  }

  // MOD-356: the detail of one leaf: where it sits, its status and action, its fields, its activity from the ledger.
  const detailNode = (d: NonNullable<WorkView['detail']>): RenderNode => {
    const it = d.item
    const k = keySlug(it.key)
    const width = side ? 40 : v.columns
    const mark = it.number === undefined ? null : TYPE_MARK[it.type]
    const trailText = cut(d.trail.map(t => (t.group ? 'No epic' : t.title)).join(' / '), Math.max(4, width - 10))
    const parentItem = d.trail[d.trail.length - 1]
    const field = (name: string, value: RenderNode): RenderNode => (
      <Box key={`work-field-${name.toLowerCase().replace(/ /g, '-')}`} flexDirection="row">
        <Text dimColor>{fit(name, 12)}</Text>
        {value}
      </Box>
    )
    const dash = <Text>—</Text>
    const typeName = it.number === undefined ? 'Card' : it.type.charAt(0).toUpperCase() + it.type.slice(1)
    const by = it.by ?? []
    const closeLabel = side ? 'Close' : v.view === 'board' ? '← Back to board' : '← Back to list'
    const queuedNote = it.state === 'queued' && it.slot ? ' waiting for a slot' : it.state === 'queued' && it.onDisk ? ' worktree on disk' : ''
    return (
      <Box key="work-detail" flexDirection="column" gap={1} width={width}>
        <Box flexDirection="row" columnGap={1}>
          <Text dimColor wrap="wrap">
            {trailText}
          </Text>
          {remote ? press('work-detail-close', closeLabel, () => hd.select(undefined)) : <Button key="work-detail-close" label={closeLabel} onPress={() => hd.select(undefined)} />}
        </Box>
        <Box flexDirection="row">
          {mark ? <Text color={markColor(it.type, v.scheme)}>{mark.glyph} </Text> : <Text>{'  '}</Text>}
          {it.number !== undefined ? (
            v.repo !== undefined ? (
              <Link key="work-detail-issue" href={`https://github.com/${v.repo}/issues/${it.number}`} label={`#${it.number}`} />
            ) : (
              <Text dimColor>{`#${it.number}`}</Text>
            )
          ) : null}
          {it.number !== undefined ? <Text>{' '}</Text> : null}
          <Text bold wrap="wrap">
            {it.title}
          </Text>
        </Box>
        <Box key="work-detail-status" flexDirection="row" columnGap={1} flexWrap="wrap">
          {lozengeOf(it)}
          {queuedNote !== '' ? <Text dimColor>{queuedNote}</Text> : null}
          {d.asked ? (
            <Text key={`work-asked-${k}`} dimColor italic>
              Asked · waiting for the session
            </Text>
          ) : d.confirming ? (
            <Box key={`work-confirm-${k}`} flexDirection="row" columnGap={1}>
              <Text>{by.length > 0 ? `Still waiting on ${by.join(', ')}. Unblock anyway?` : 'Unblock anyway?'}</Text>
              <Button key={`work-confirm-yes-${k}`} variant="primary" label="Unblock" onPress={() => hd.confirm(it.key, true)} />
              <Button key={`work-confirm-no-${k}`} label="Cancel" onPress={() => hd.confirm(it.key, false)} />
            </Box>
          ) : d.action !== undefined ? (
            <Button key={`work-act-${k}`} variant="primary" label={ACTION_LABEL[d.action]} onPress={() => hd.act(it.key)} />
          ) : null}
        </Box>
        <Box key="work-fields" flexDirection="column">
          {field('Type', <Text>{typeName}</Text>)}
          {field('Card', it.card !== undefined ? <Text>{it.card}</Text> : dash)}
          {field(
            'Worker',
            it.model !== undefined ? (
              <Box flexDirection="row">
                {badge(it) !== '' ? <Text>{`${badge(it)} `}</Text> : it.tier !== undefined ? <Text color={TIER_COLOR[it.tier]}>● </Text> : <Text dimColor>● </Text>}
                <Text>{it.model}</Text>
              </Box>
            ) : (
              dash
            ),
          )}
          {field('Attempt', it.attempt !== undefined && it.attempt !== '' ? <Text>{it.attempt}</Text> : dash)}
          {it.state === 'working' ? field('Running', it.running !== undefined ? <Text>{it.running}</Text> : dash) : null}
          {field('Cost', typeof it.usd === 'number' ? <Text>{`$${it.usd.toFixed(2)}`}</Text> : dash)}
          {it.state === 'blocked'
            ? field(
                'Blocked by',
                by.length > 0 ? (
                  <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
                    {by.map(id => {
                      const target = leafOfCard(v.model, id)
                      return target !== undefined ? press(`work-by-${keySlug(id)}`, id, () => hd.select(target.key)) : <Text key={`work-by-${keySlug(id)}`}>{id}</Text>
                    })}
                  </Box>
                ) : (
                  dash
                ),
              )
            : null}
          {field('Parent', parentItem !== undefined ? <Text>{parentItem.group ? 'No epic' : `#${parentItem.number} ${parentItem.title}`}</Text> : dash)}
        </Box>
        <Box key="work-activity" flexDirection="column">
          <Text bold>Activity</Text>
          {d.activity.length === 0 ? (
            <Text dimColor>{it.card !== undefined ? 'No activity recorded for this item.' : 'No card yet.'}</Text>
          ) : (
            d.activity.map((e, i) => (
              <Box key={`work-event-${i}`} flexDirection="row">
                <Text dimColor>● </Text>
                <Text>{e.text}</Text>
                <Text dimColor>{`  ${e.ago}`}</Text>
              </Box>
            ))
          )}
        </Box>
      </Box>
    )
  }

  // MOD-392 (#547): the desktop and vscode panes have their own close, so the footer is drawn on the terminal and on mobile only
  const footer =
    p.surface === 'desktop' || p.surface === 'vscode' ? null : (
      <Box key="work-footer" flexDirection="row">
        <Button key="work-close" label="Close" role="dismiss" onPress={hd.close} />
      </Box>
    )

  if (v.detail !== undefined && !side) {
    return (
      <Box key="work-pane" flexDirection="column" gap={1}>
        {detailNode(v.detail)}
        {footer}
      </Box>
    )
  }

  return (
    <Box key="work-pane" flexDirection="column" gap={1}>
      {toolbar}
      {v.notes.length > 0 ? (
        <Box flexDirection="column">
          {press('work-notes', v.notesOpen ? 'hide notes' : `${v.notes.length} note${v.notes.length === 1 ? '' : 's'} · show`, hd.notes, { dim: true })}
          {v.notesOpen
            ? v.notes.map((n, i) => (
                <Text key={`work-note-${i}`} dimColor wrap="wrap">
                  {n}
                </Text>
              ))
            : null}
        </Box>
      ) : null}
      {summary}
      {v.detail !== undefined ? (
        <Box flexDirection="row" columnGap={2}>
          {main()}
          {detailNode(v.detail)}
        </Box>
      ) : (
        main()
      )}
      {footer}
    </Box>
  )
}
