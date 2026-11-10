// MOD-354: the Work pane, the list view. A column of a toolbar (search, epic select, Show done, Refresh), the notes, the state
// chips, then the table: one row per item, parents with a toggle and a progress bar, leaves with a lozenge, a card, a worker and a
// cost. Drawn in character cells from the host's elements; no `$` here: register.ts builds the view and the handlers.
import type { RenderNode } from 'claude-code'

import type { Scheme } from './live'
import type { PaneTable } from './pane'
import { ACTION_LABEL, boardLayout, BOARD_COLS, BOARD_LABEL, keySlug, leafOfCard, LOZENGE, progressCells, SELECTED_BG, STATE_LABEL, SURFACE_BG, TIER_COLOR, TYPE_MARK, workLayout, WORK_STATES, type BoardCol, type BoardLane, type WorkAction, type WorkEvent, type WorkItem, type WorkModel, type WorkRow, type WorkState, type WorkUi } from './work'

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
  /** a read of the issues is running */
  reading: boolean
  /** owner/name, for the issue links */
  repo?: string
  /** MOD-357: the list (the table) or the board */
  view: 'list' | 'board'
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
  const { Box, Text, Button, Input, Select, Link } = p.t
  const side = v.columns >= 116
  const L = workLayout(v.detail !== undefined && side ? v.columns - 42 : v.columns)
  const filtered = v.ui.query.trim() !== '' || v.ui.states.size > 0 || v.ui.root !== undefined
  const narrowSurface = p.surface === 'mobile'
  const roots = v.model.roots

  const toolbar = (
    <Box key="work-toolbar" flexDirection="row" flexWrap="wrap" columnGap={2}>
      <Button key="work-view-list" label="List" {...(v.view === 'list' ? { variant: 'primary' as const } : { plain: true })} onPress={() => hd.view('list')} />
      <Button key="work-view-board" label="Board" {...(v.view === 'board' ? { variant: 'primary' as const } : { plain: true })} onPress={() => hd.view('board')} />
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
      <Button key="work-done" plain label={v.ui.showDone ? '☑ Show done' : '☐ Show done'} onPress={hd.showDone} />
      {v.reading ? <Text dimColor>Reading the issues…</Text> : v.updated ? <Text dimColor>{v.updated}</Text> : null}
      <Button key="work-refresh" label="Refresh" onPress={hd.refresh} />
    </Box>
  )

  const summary = (
    <Box key="work-summary" flexDirection="row" flexWrap="wrap" columnGap={2}>
      {WORK_STATES.map(s => {
        const on = v.ui.states.has(s)
        return (
          <Box key={`work-state-${s}`} flexDirection="row">
            <Text color={LOZENGE[s][v.scheme].fg}>■ </Text>
            <Button key={`work-chip-${s}`} label={`${STATE_LABEL[s]} ${v.model.counts[s]}`} {...(on ? { variant: 'primary' as const } : { plain: true })} onPress={() => hd.chip(s)} />
          </Box>
        )
      })}
      {filtered ? <Button key="work-clear" plain label="Clear filters" onPress={hd.clear} /> : null}
    </Box>
  )

  const header = (
    <Box key="work-header" flexDirection="row">
      <Text dimColor>{fit('Work', L.work)}</Text>
      <Text dimColor>{fit('Status', L.status)}</Text>
      {L.progress ? <Text dimColor>{fit('Progress', L.progress)}</Text> : null}
      {L.card ? <Text dimColor>{fit('Card', L.card)}</Text> : null}
      {L.worker ? <Text dimColor>{fit('Worker', L.worker)}</Text> : null}
      {L.cost ? <Text dimColor>{fit('Cost', L.cost)}</Text> : null}
    </Box>
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
    const hover = { backgroundColor: v.scheme === 'light' ? '#f1f2f4' : '#2c333a' }
    const selected = !parent && v.detail !== undefined && v.detail.item.key === it.key
    return (
      <Box key={`work-row-${k}`} flexDirection="row" hover={hover} {...(selected ? { backgroundColor: SELECTED_BG[v.scheme] } : {})}>
        <Box width={L.work} overflow="hidden" flexDirection="row">
          <Text>{indent}</Text>
          {parent ? <Button key={`work-toggle-${k}`} plain label={open ? '▾' : '▸'} onPress={() => hd.toggle(it.key)} /> : <Text>{'  '}</Text>}
          {parent ? <Text>{' '}</Text> : null}
          {mark ? <Text color={mark.color}>{mark.glyph} </Text> : <Text>{'  '}</Text>}
          {numText !== '' ? (
            v.repo !== undefined ? (
              <Link key={`work-issue-${k}`} href={`https://github.com/${v.repo}/issues/${it.number}`} label={numText} />
            ) : (
              <Text dimColor>{numText}</Text>
            )
          ) : null}
          {numText !== '' ? <Text>{' '}</Text> : null}
          {parent ? (
            <Text bold wrap="truncate-end">
              {cut(it.title, titleW)}
            </Text>
          ) : (
            <Button key={`work-open-${k}`} plain {...(doneLeaf ? { dimColor: true } : {})} label={cut(it.title, titleW)} onPress={() => hd.select(it.key)} />
          )}
        </Box>
        <Box width={L.status}>
          {lozenge ? (
            <Text bold color={lozenge.fg} backgroundColor={lozenge.bg}>
              {` ${STATE_LABEL[it.state].toUpperCase()} `}
            </Text>
          ) : L.mode === 'narrow' && parent ? (
            <Text dimColor>{`${it.done}/${it.leaves}`}</Text>
          ) : null}
        </Box>
        {L.progress ? (
          <Box width={L.progress} overflow="hidden" flexDirection="row">
            {parent ? (
              <Box flexDirection="row">
                <Text color={doneFg(v.scheme)}>{'█'.repeat(progressCells(it.done, it.leaves))}</Text>
                <Text dimColor>{'░'.repeat(8 - progressCells(it.done, it.leaves))}</Text>
                <Text>{` ${it.done}/${it.leaves}`}</Text>
              </Box>
            ) : (
              <Text>{' '.repeat(L.progress)}</Text>
            )}
          </Box>
        ) : null}
        {L.card ? (
          <Box width={L.card} overflow="hidden">
            <Text wrap="truncate-end">{parent ? '' : (it.card ?? '')}</Text>
          </Box>
        ) : null}
        {L.worker ? (
          <Box width={L.worker} overflow="hidden" flexDirection="row">
            {!parent ? workerCell(it) : null}
          </Box>
        ) : null}
        {L.cost ? (
          <Box width={L.cost} overflow="hidden">
            <Text>{!parent && typeof it.usd === 'number' ? `$${it.usd.toFixed(2)}` : ''}</Text>
          </Box>
        ) : null}
      </Box>
    )
  }

  const workerCell = (it: WorkItem): RenderNode => {
    if (it.model !== undefined) {
      const dot = it.tier !== undefined ? TIER_COLOR[it.tier] : undefined
      const text = [it.model, it.attempt].filter((x): x is string => x !== undefined && x !== '').join(' · ') + (it.state === 'working' && it.running !== undefined ? ` · ${it.running}` : '')
      return (
        <Box flexDirection="row">
          {dot ? <Text color={dot}>● </Text> : <Text dimColor>● </Text>}
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
          <Button key={`work-show-${k}`} plain dimColor label={`${r.n} done hidden · show`} onPress={() => hd.show(r.parent)} />
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
    return <Text>{filtered ? 'No work matches.' : 'Everything here is done.'}</Text>
  }

  const table = (
    <Box key="work-table" flexDirection="column">
      {header}
      {v.rows.map((r, i) => rowNode(r, i))}
      {v.rows.length === 0 ? empty() : null}
    </Box>
  )

  // MOD-357: the board: a lane per epic, a card per leaf in the column of its state.
  const board = (): RenderNode => {
    const B = boardLayout(v.detail !== undefined && side ? v.columns - 42 : v.columns)
    const lanes = v.lanes ?? []
    const stack = B.mode === 'stack'
    const card = (it: WorkItem): RenderNode => {
      const k = keySlug(it.key)
      const mark = TYPE_MARK[it.type]
      const selected = v.detail !== undefined && v.detail.item.key === it.key
      const lozenge = LOZENGE[it.state][v.scheme]
      const by = it.by ?? []
      const cost = typeof it.usd === 'number' ? ` · $${it.usd.toFixed(2)}` : ''
      return (
        <Box key={`work-card-${k}`} flexDirection="column" backgroundColor={selected ? SELECTED_BG[v.scheme] : SURFACE_BG[v.scheme]} paddingLeft={1} paddingRight={1}>
          <Button key={`work-open-${k}`} plain {...(it.state === 'done' ? { dimColor: true } : {})} label={cut(it.title, Math.max(4, B.col - 2))} onPress={() => hd.select(it.key)} />
          <Box flexDirection="row">
            <Text color={mark.color}>{mark.glyph} </Text>
            {it.number !== undefined ? (
              v.repo !== undefined ? (
                <Link key={`work-issue-${k}`} href={`https://github.com/${v.repo}/issues/${it.number}`} label={`#${it.number}`} />
              ) : (
                <Text dimColor>{`#${it.number}`}</Text>
              )
            ) : null}
            {it.number !== undefined ? <Text>{' '}</Text> : null}
            {it.card !== undefined ? <Text dimColor>{it.card}</Text> : null}
          </Box>
          {(it.state === 'working' || it.state === 'review') && it.model !== undefined ? (
            <Box flexDirection="row">
              {it.tier !== undefined ? <Text color={TIER_COLOR[it.tier]}>● </Text> : <Text dimColor>● </Text>}
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
        if (c === 'done' && l.doneHidden > 0) out.push(<Button key={`work-show-${k}`} plain dimColor label={`${l.doneHidden} done · show`} onPress={() => hd.show(r.key)} />)
        if (l.more[c] > 0) out.push(<Text key={`work-more-${k}-${c}`} dimColor>{`+${l.more[c]} more`}</Text>)
        return out
      }
      return (
        <Box key={`work-lane-${k}`} flexDirection="column" gap={1}>
          <Box flexDirection="row">
            <Button key={`work-toggle-${k}`} plain label={l.open ? '▾' : '▸'} onPress={() => hd.toggle(r.key)} />
            <Text>{' '}</Text>
            {mark ? <Text color={mark.color}>{mark.glyph} </Text> : null}
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
            <Text color={doneFg(v.scheme)}>{'█'.repeat(progressCells(r.done, r.leaves))}</Text>
            <Text dimColor>{'░'.repeat(8 - progressCells(r.done, r.leaves))}</Text>
            <Text>{` ${r.done}/${r.leaves}`}</Text>
          </Box>
          {!l.open ? null : stack ? (
            <Box flexDirection="column" gap={1}>
              {BOARD_COLS.map(c => {
                const nodes = body(c)
                if (nodes.length === 0) return null
                return (
                  <Box key={`work-colbox-${k}-${c}`} flexDirection="column">
                    <Text dimColor>{`${BOARD_LABEL[c].toUpperCase()} · ${l.cols[c].length}`}</Text>
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
                {fit(BOARD_LABEL[c].toUpperCase(), B.col)}
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
    const trailText = cut(d.trail.map(t => (t.group ? 'No epic' : t.title)).join(' / '), Math.max(4, v.columns - 20))
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
    const queuedNote = it.state === 'queued' && it.slot ? ' waiting for a slot' : it.state === 'queued' && it.onDisk ? ' worktree on disk' : ''
    return (
      <Box key="work-detail" flexDirection="column" gap={1} width={width}>
        <Box flexDirection="row" columnGap={1}>
          <Text dimColor wrap="wrap">
            {trailText}
          </Text>
          <Button key="work-detail-close" label={side ? 'Close' : v.view === 'board' ? '← Back to board' : '← Back to list'} onPress={() => hd.select(undefined)} />
        </Box>
        <Box flexDirection="row">
          {mark ? <Text color={mark.color}>{mark.glyph} </Text> : <Text>{'  '}</Text>}
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
        <Box key="work-detail-status" flexDirection="row">
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
                {it.tier !== undefined ? <Text color={TIER_COLOR[it.tier]}>● </Text> : <Text dimColor>● </Text>}
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
                      return target !== undefined ? <Button key={`work-by-${keySlug(id)}`} plain label={id} onPress={() => hd.select(target.key)} /> : <Text key={`work-by-${keySlug(id)}`}>{id}</Text>
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

  const footer = (
    <Box key="work-footer" flexDirection="row">
      <Button key="work-close" label="close" role="dismiss" onPress={hd.close} />
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
          {v.notes.map((n, i) => (
            <Text key={`work-note-${i}`} dimColor wrap="wrap">
              {n}
            </Text>
          ))}
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
