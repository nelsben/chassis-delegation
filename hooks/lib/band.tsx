// Part 4A: the band above the prompt, as a tree. The hook draws it only while
// something runs, waits or is owed; otherwise it answers `next(e)` and the
// band is empty. One line per item, plain text in the surface's own colours;
// the only colour is the surface accent on the primary `[ details ]` Button.
// No `$` here: register.ts resolves the element table and hands in the
// handlers.
import type { Elements, RenderNode, RenderSurface } from 'claude-code'

import type { BandLine } from './dashboard'

export type BandHandlers = {
  /** `[ details ]` (hotkey d): opens the pane. */
  onDetails: () => void
  /** `[ clear ]` on the eval-failed line: clears it. */
  onClear: () => void
}

/** Lines past the band's rows fold into one `… n more` line; the Button keeps the last row. */
export function capLines(lines: readonly BandLine[], maxRows: number): BandLine[] {
  const room = Math.max(1, maxRows - 1)
  if (lines.length <= room) return [...lines]
  const keep = Math.max(0, room - 1)
  return [...lines.slice(0, keep), { key: 'more', text: `▸ … ${lines.length - keep} more — see details` }]
}

export function bandTree(t: Elements[RenderSurface], lines: readonly BandLine[], on: BandHandlers): RenderNode {
  const { Box, Text, Button } = t
  return (
    <Box flexDirection="column">
      {lines.map(line =>
        line.clear ? (
          <Box flexDirection="row" gap={1}>
            <Text wrap="truncate-end">{line.text}</Text>
            <Button key="clear" label="clear" hotkey="c" onPress={on.onClear} />
          </Box>
        ) : (
          <Text wrap="truncate-end">{line.text}</Text>
        ),
      )}
      <Box flexDirection="row">
        <Button key="details" label="details" hotkey="d" variant="primary" onPress={on.onDetails} />
      </Box>
    </Box>
  )
}
