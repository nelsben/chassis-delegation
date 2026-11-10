// MOD-354: the Work pane, the list view. A column of a toolbar (search, epic select, Show done, Refresh), the notes, the state
// chips, then the table: one row per item, parents with a toggle and a progress bar, leaves with a lozenge, a card, a worker and a
// cost. Drawn in character cells from the host's elements; no `$` here: register.ts builds the view and the handlers.
import type { RenderNode } from 'claude-code'

import type { Scheme } from './live'
import type { PaneTable } from './pane'
import { keySlug, LOZENGE, progressCells, STATE_LABEL, TIER_COLOR, TYPE_MARK, workLayout, WORK_STATES, type WorkItem, type WorkModel, type WorkRow, type WorkState, type WorkUi } from './work'

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
}

export type WorkHandlers = {
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
  const L = workLayout(v.columns)
  const filtered = v.ui.query.trim() !== '' || v.ui.states.size > 0 || v.ui.root !== undefined
  const narrowSurface = p.surface === 'mobile'
  const roots = v.model.roots

  const toolbar = (
    <Box key="work-toolbar" flexDirection="row" flexWrap="wrap" columnGap={2}>
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
    return (
      <Box key={`work-row-${k}`} flexDirection="row" hover={hover}>
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
          <Text bold={parent} dimColor={doneLeaf} wrap="truncate-end">
            {cut(it.title, titleW)}
          </Text>
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
      {table}
      <Box key="work-footer" flexDirection="row">
        <Button key="work-close" label="close" role="dismiss" onPress={hd.close} />
      </Box>
    </Box>
  )
}
