// Part 4B: the Delegation pane, as a tree. Opened only by the band's
// `[ details ]`, `/delegation`, or the status tool with `open: true`. Six
// blocks (a heading, this session's number line, a sparkline over the last 14
// sessions), then "Open items", then `[ close ]`, the one control. Sparklines
// are an Svg on vscode, desktop and mobile and a Raster on the terminal, which
// has no Svg. No `$` here: register.ts resolves the table and hands in the
// close handler.
import type { Elements, RenderNode } from 'claude-code'

import type { DashboardBlock } from '../types'
import { sparkCells, sparkSvg, sparkValues } from './dashboard'
import { chartCells, chartSvg, modelColor, modelLabel, tokText, verdictMark, type LiveView, type Scheme, type WorktreeRow } from './live'

/** The surface's table, narrowed: the terminal draws a Raster, the rest an Svg. */
export type PaneTable =
  | { surface: 'terminal'; t: Elements['terminal'] }
  | { surface: 'desktop'; t: Elements['desktop'] }
  | { surface: 'vscode'; t: Elements['vscode'] }
  | { surface: 'mobile'; t: Elements['mobile'] }

export type PaneView = {
  blocks: readonly DashboardBlock[]
  /** Every item the band would show, with its next action. */
  open: readonly string[]
  /** The pane body's width in cells (`e.props.bodyColumns`). */
  columns: number
  /** GH-112: the live model; absent, the pane draws only the cross-session blocks. */
  live?: LiveView
  scheme?: Scheme
}

const INDENT = 2

function spark(p: PaneTable, b: DashboardBlock, columns: number): RenderNode {
  const { Text } = p.t
  const shown = sparkValues(b.series)
  if (shown.length === 0) return <Text>{' '.repeat(INDENT)}no sessions measured yet</Text>
  const alt = `${b.alt}, last ${shown.length} session${shown.length === 1 ? '' : 's'}: ${shown.map(v => +v.toFixed(2)).join(', ')}`
  if (p.surface === 'terminal') {
    const cells = sparkCells(b.series)
    if (!cells) return <Text>{' '.repeat(INDENT)}no sessions measured yet</Text>
    const { Box, Raster } = p.t
    return (
      <Box flexDirection="row" paddingLeft={INDENT}>
        <Raster key={`spark-${b.key}`} columns={cells.columns} rows={1} cells={cells.cells} />
      </Box>
    )
  }
  const svg = sparkSvg(b.series, Math.max(1, columns - INDENT))
  if (!svg) return <Text>{' '.repeat(INDENT)}no sessions measured yet</Text>
  const { Box, Svg } = p.t
  return (
    <Box flexDirection="row" paddingLeft={INDENT}>
      <Svg source={svg.source} alt={alt} width={svg.width} height={svg.height} />
    </Box>
  )
}

// ---- GH-112: the live blocks, drawn by the band's card (the first three, compact) and the pane (all four) ----

const pad = (text: string, w: number) => (text.length >= w ? text.slice(0, Math.max(0, w - 1)) + (text.length > w ? '…' : '') : text.padEnd(w))
const usdCell = (n: number | undefined) => (n === undefined ? '$–' : `$${n.toFixed(2)}`)

/** Stat tiles: live workers, queued, spend this session (the hero), verified on first attempt. */
function kpiRow(p: PaneTable, v: LiveView): RenderNode {
  const { Box, Text } = p.t
  const tile = (key: string, label: string, value: string, hero?: boolean) => (
    <Box key={key} flexDirection="column" borderStyle="round" paddingX={1}>
      <Text dimColor>{label}</Text>
      <Text bold>{value}</Text>
      {hero ? <Text dimColor>whole session</Text> : null}
    </Box>
  )
  return (
    <Box key="dash-kpis" flexDirection="row" gap={1}>
      {tile('kpi-live', 'live', String(v.live))}
      {tile('kpi-queued', 'queued', String(v.queued))}
      {tile('kpi-spend', 'spend', `$${v.usd.toFixed(2)}`, true)}
      {tile('kpi-first', 'verified 1st try', `${v.firstTry.n} of ${v.firstTry.m}`)}
    </Box>
  )
}

/** Cumulative session dollars over time: an Svg line on desktop, vscode and mobile; a Raster on the terminal. */
function spendChart(p: PaneTable, v: LiveView, columns: number): RenderNode {
  const { Box, Text } = p.t
  const alt = `Session spend over time: $${v.usd.toFixed(2)} now, ${v.series.length} samples, ${v.events.length} spawn and verdict ticks`
  let chart: RenderNode = <Text dimColor>collecting samples…</Text>
  if (p.surface === 'terminal') {
    const c = chartCells(v.series, v.events, v.now, Math.max(8, columns - 2))
    if (c) {
      const { Raster } = p.t
      chart = <Raster key="spend-raster" columns={c.columns} rows={c.rows} cells={c.cells} />
    }
  } else {
    const svg = chartSvg(v.series, v.events, v.now, Math.max(8, columns - 2))
    if (svg) {
      const { Svg } = p.t
      chart = <Svg source={svg.source} alt={alt} width={svg.width} height={svg.height} isInteractive />
    }
  }
  return (
    <Box key="dash-spend" flexDirection="column">
      <Text bold>Spend over time</Text>
      <Text dimColor>cumulative dollars, this session · ticks: spawn ┬ verdict ┴ · hover for time, $ and event</Text>
      {chart}
    </Box>
  )
}

function stateCell(p: PaneTable, r: WorktreeRow, w: number): RenderNode {
  const { Box, Text } = p.t
  const mark = verdictMark(r.verdict)
  return (
    <Box flexDirection="row" width={w}>
      {mark ? <Text color={mark.color}>{mark.icon} </Text> : null}
      <Text wrap="truncate-end">{r.state}</Text>
    </Box>
  )
}

/** One row per task: task · model (a chip in the model's colour, its name in ink) · state · worktree · tokens · cost · attempt. */
function worktreeTable(p: PaneTable, v: LiveView, scheme: Scheme, columns: number, max: number): RenderNode {
  const { Box, Text } = p.t
  const rows = v.rows.slice(0, max)
  const w = (f: (r: WorktreeRow) => string, floor: number, cap: number) => Math.min(cap, Math.max(floor, ...rows.map(r => [...f(r)].length)))
  const taskW = w(r => r.task, 4, 14)
  const modelW = w(r => (r.model === r.family || r.model === '–' ? r.family : `${r.family} ${r.model}`), 5, 28) + 2
  const stateW = w(r => r.state, 5, 16) + 2
  const folderW = w(r => (r.branch ? `${r.folder} ${r.branch}` : r.folder), 8, 40)
  const wide = columns >= taskW + modelW + stateW + folderW + 26
  return (
    <Box key="dash-worktrees" flexDirection="column">
      <Text bold>Worktrees</Text>
      {rows.length === 0 ? <Text dimColor>no worker has run this session</Text> : null}
      {rows.length > 0 ? (
        <Box flexDirection="row">
          <Text dimColor>{pad('task', taskW + 1)}</Text>
          <Text dimColor>{pad('model', modelW + 1)}</Text>
          <Text dimColor>{pad('state', stateW + 1)}</Text>
          {wide ? <Text dimColor>{pad('worktree · branch', folderW + 1)}</Text> : null}
          <Text dimColor>{pad('tok', 7)}</Text>
          <Text dimColor>{pad('cost', 8)}</Text>
          <Text dimColor>att</Text>
        </Box>
      ) : null}
      {rows.map(r => {
        const c = modelColor(r.family, scheme)
        const name = r.model === r.family || r.model === '–' ? r.family : `${r.family} ${r.model}`
        return (
          <Box flexDirection="row">
            <Text wrap="truncate-end">{pad(r.task, taskW + 1)}</Text>
            <Box flexDirection="row" width={modelW + 1}>
              {c ? <Text color={c}>■ </Text> : <Text dimColor>■ </Text>}
              <Text wrap="truncate-end">{name}</Text>
            </Box>
            {stateCell(p, r, stateW + 1)}
            {wide ? <Text wrap="truncate-end">{pad(r.branch ? `${r.folder} ${r.branch}` : r.folder, folderW + 1)}</Text> : null}
            <Text>{pad(r.tokens === undefined ? '–' : tokText(r.tokens), 7)}</Text>
            <Text>{pad(usdCell(r.usd), 8)}</Text>
            <Text>{r.attempt}</Text>
          </Box>
        )
      })}
      {v.rows.length > max ? <Text dimColor>… {v.rows.length - max} more in the pane</Text> : null}
      <Text dimColor>tokens and cost update when a run ends</Text>
    </Box>
  )
}

/** Up to three bars plus "other", each direct-labelled `sonnet · $3.10 · 412k tok · 4 verified`. */
function modelBars(p: PaneTable, v: LiveView, scheme: Scheme): RenderNode {
  const { Box, Text } = p.t
  const shown = v.byModel.filter(m => m.family !== 'other' || m.usd > 0 || m.tokens > 0)
  const top = Math.max(0.0001, ...shown.map(m => m.usd))
  return (
    <Box key="dash-models" flexDirection="column">
      <Text bold>Spend by model</Text>
      {shown.map(m => {
        const c = modelColor(m.family, scheme)
        const cells = m.usd > 0 ? Math.max(1, Math.round((m.usd / top) * 20)) : 0
        return (
          <Box flexDirection="row" gap={1}>
            <Box width={20}>{c ? <Text color={c}>{'█'.repeat(cells)}</Text> : <Text dimColor>{'█'.repeat(cells)}</Text>}</Box>
            <Text wrap="truncate-end">{modelLabel(m)}</Text>
          </Box>
        )
      })}
    </Box>
  )
}

/** The card (compact: tiles, chart, worktrees) and the pane (all four) draw these. */
export function liveBlocks(p: PaneTable, v: LiveView, scheme: Scheme, columns: number, full: boolean): RenderNode {
  const { Box } = p.t
  return (
    <Box flexDirection="column" gap={1}>
      {kpiRow(p, v)}
      {spendChart(p, v, columns)}
      {worktreeTable(p, v, scheme, columns, full ? 50 : 6)}
      {full ? modelBars(p, v, scheme) : null}
    </Box>
  )
}

export function paneTree(p: PaneTable, view: PaneView, onClose: () => void): RenderNode {
  const { Box, Text, Button } = p.t
  const gap = ' '.repeat(INDENT)
  return (
    <Box flexDirection="column" gap={1}>
      {view.live ? liveBlocks(p, view.live, view.scheme ?? 'dark', view.columns, true) : null}
      <Text bold>Across sessions</Text>
      {view.blocks.length === 0 ? <Text>No delegation measured yet.</Text> : null}
      {view.blocks.map(b => (
        <Box flexDirection="column">
          <Text bold>{b.heading}</Text>
          <Text wrap="truncate-end">{gap + b.number}</Text>
          {b.detail.map(d => (
            <Text wrap="truncate-end">{gap + d}</Text>
          ))}
          {spark(p, b, view.columns)}
        </Box>
      ))}
      <Box flexDirection="column">
        <Text bold>Open items</Text>
        {view.open.length === 0 ? <Text>{gap}nothing open</Text> : view.open.map(o => <Text wrap="wrap">{gap + o}</Text>)}
      </Box>
      <Box flexDirection="row">
        <Button key="close" label="close" role="dismiss" onPress={onClose} />
      </Box>
    </Box>
  )
}
