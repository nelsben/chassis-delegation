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

export function paneTree(p: PaneTable, view: PaneView, onClose: () => void): RenderNode {
  const { Box, Text, Button } = p.t
  const pad = ' '.repeat(INDENT)
  return (
    <Box flexDirection="column" gap={1}>
      {view.blocks.length === 0 ? <Text>No delegation measured yet.</Text> : null}
      {view.blocks.map(b => (
        <Box flexDirection="column">
          <Text bold>{b.heading}</Text>
          <Text wrap="truncate-end">{pad + b.number}</Text>
          {b.detail.map(d => (
            <Text wrap="truncate-end">{pad + d}</Text>
          ))}
          {spark(p, b, view.columns)}
        </Box>
      ))}
      <Box flexDirection="column">
        <Text bold>Open items</Text>
        {view.open.length === 0 ? <Text>{pad}nothing open</Text> : view.open.map(o => <Text wrap="wrap">{pad + o}</Text>)}
      </Box>
      <Box flexDirection="row">
        <Button key="close" label="close" role="dismiss" onPress={onClose} />
      </Box>
    </Box>
  )
}
