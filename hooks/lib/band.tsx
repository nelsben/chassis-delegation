// Part 4A, as GH-112 wires it: the band above the prompt, one row, drawn only
// while a worker is live, a spawn is queued or a verdict is owed. The whole
// band is a hover scope: hovering it reveals the card (the KPI tiles, the spend
// chart, the worktree table) beneath the row. `[ details ]` opens the pane.
// MOD-133: the ration health bar draws here too, alone or above the live row.
// No `$` here: register.ts resolves the element table and hands in the handler.
import type { RenderNode } from 'claude-code'

import type { BandLine } from './dashboard'
import { sparkCells, sparkSvg } from './dashboard'
import { bandSummary, recentSpend, type LiveView, type Scheme } from './live'
import { liveBlocks, rationBar, type PaneTable, type PaneView } from './pane'

export const DASH_SCOPE = 'chassis-delegation-dash'

/** MOD-81: columns the sparkline, the details button and the gaps take beside the summary text. */
const BAND_RESERVED = 32

/** Lines past the band's rows fold into one `… n more` line; the Button keeps the last row. */
export function capLines(lines: readonly BandLine[], maxRows: number): BandLine[] {
  const room = Math.max(1, maxRows - 1)
  if (lines.length <= room) return [...lines]
  const keep = Math.max(0, room - 1)
  return [...lines.slice(0, keep), { key: 'more', text: `▸ … ${lines.length - keep} more — see details` }]
}

function sparkline(p: PaneTable, v: LiveView): RenderNode | null {
  const values = recentSpend(v.series, v.now)
  if (values.length < 2) return null
  const { Box } = p.t
  if (p.surface === 'terminal') {
    const cells = sparkCells(values)
    if (!cells) return null
    const { Raster } = p.t
    return (
      <Box flexDirection="row">
        <Raster key="band-spark" columns={cells.columns} rows={1} cells={cells.cells} />
      </Box>
    )
  }
  const svg = sparkSvg(values, 14)
  if (!svg) return null
  const { Svg } = p.t
  return (
    <Box flexDirection="row">
      <Svg source={svg.source} alt={`Session spend, last 30 minutes: ${values.map(n => `$${n.toFixed(2)}`).join(', ')}`} width={svg.width} height={svg.height} />
    </Box>
  )
}

type Ration = NonNullable<PaneView['ration']>

/** MOD-133: the coloured bar and `59% left · resets 2d 4h · today 6.2/8.4 · on pace`, the pane's own rationBar. */
function rationRow(p: PaneTable, r: Ration, scheme: Scheme): RenderNode {
  return rationBar(p, r, scheme, 0, r.tail ? `${r.text} · ${r.tail}` : r.text)
}

/** MOD-133: the band with the ration bar alone: the bar row, then `[ details ]`. No worker figures. */
export function rationBandTree(p: PaneTable, r: Ration, scheme: Scheme, onDetails: () => void): RenderNode {
  const { Box, Button } = p.t
  return (
    <Box key="dash-band" flexDirection="row" gap={1}>
      {rationRow(p, r, scheme)}
      <Button key="details" label="details" hotkey="d" variant="primary" onPress={onDetails} />
    </Box>
  )
}

export function bandTree(p: PaneTable, v: LiveView, scheme: Scheme, columns: number, onDetails: () => void, ration?: Ration): RenderNode {
  const { Box, Text, Button } = p.t
  return (
    <Box key="dash-band" flexDirection="column" hover={{ scope: DASH_SCOPE }}>
      {ration ? rationRow(p, ration, scheme) : null}
      <Box flexDirection="row" gap={1} hover={{ scope: DASH_SCOPE }}>
        <Text wrap="truncate-end">{bandSummary(v, Math.max(20, columns - BAND_RESERVED))} ·</Text>
        {sparkline(p, v)}
        <Button key="details" label="details" hotkey="d" variant="primary" onPress={onDetails} />
      </Box>
      <Box key="dash-card" flexDirection="column" display="none" hover={{ scope: DASH_SCOPE, display: 'flex' }}>
        {liveBlocks(p, v, scheme, Math.max(10, columns - 2), false)}
      </Box>
    </Box>
  )
}
