// Part 4A/4B and 3D, the drawing's data: the band's lines, the pane's six
// blocks and their sparklines, the open items, and the status tool's text.
// The trees themselves are band.tsx and pane.tsx. Pure: no `$`.
import type { BandItem, DashboardBlock } from '../types'
import { usdText } from './cost'
import { SERIES, type Metrics } from './metrics'

export type { BandItem } from '../types'

const ARROW = '▸'

/** `04:12` (mm:ss), `1:02:05` past the hour. */
export function elapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const two = (n: number) => String(n).padStart(2, '0')
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}:${two(m)}:${two(s % 60)}` : `${two(m)}:${two(s % 60)}`
}

/** Cut to `columns` cells, the last one an ellipsis. */
export function fit(text: string, columns: number): string {
  const cells = [...text]
  if (cells.length <= columns) return text
  return columns <= 1 ? cells.slice(0, Math.max(0, columns)).join('') : `${cells.slice(0, columns - 1).join('')}…`
}

const ADVICE: Record<string, string> = {
  resume: 'resume advised',
  respawn: 'respawn advised',
  exhausted: 'budget exhausted',
  check: 'check by hand',
  'fix-brief': 'fix the brief',
}

/**
 * A verdict that waits on a decision, in one clause: the verdict with its
 * claim (`refuted on scope`; a no-repo verdict keeps its why), then the
 * advice, or that an amend needs approval.
 */
export function decisionText(r: { verdict: string; reason?: string; advice?: string; approval?: boolean; noRepo?: boolean }): string {
  const claim = r.reason ? (r.noRepo ? `: ${r.reason}` : ` ${r.reason.replace(/ \(.*$/, '')}`) : ''
  const verdict = `${r.verdict}${r.noRepo ? ' (no repo)' : ''}${claim}`
  const advice = r.approval ? 'amend needs approval' : (r.advice && ADVICE[r.advice]) || r.advice
  return advice ? `${verdict} · ${advice}` : verdict
}

export type BandLine = { key: string; text: string; clear?: boolean }

/** Room the band keeps at a line's end for its `[ clear ]`. */
export const CLEAR_COLUMNS = 10

/**
 * One line per item, sized to the band's columns. The running workers'
 * fields are padded to one another so the numbers line up.
 */
export function bandLines(items: readonly BandItem[], now: number, columns: number): BandLine[] {
  const running = items.filter((i): i is Extract<BandItem, { kind: 'running' }> => i.kind === 'running')
  const width = (f: (i: Extract<BandItem, { kind: 'running' }>) => string) => Math.max(0, ...running.map(i => [...f(i)].length))
  const taskW = width(i => i.task)
  const tierW = width(i => `${i.tier}/${i.alias}`)
  const timeW = width(i => elapsed(now - i.at))
  const usdW = width(i => usdText(i.usd === undefined ? undefined : { usd: i.usd }))
  return items.map((item, n): BandLine => {
    switch (item.kind) {
      case 'running': {
        const cost = usdText(item.usd === undefined ? undefined : { usd: item.usd })
        const text = [
          `${ARROW} ${item.task.padEnd(taskW)}`,
          `${item.tier}/${item.alias}`.padEnd(tierW),
          elapsed(now - item.at).padStart(timeW),
          cost.padEnd(usdW),
          item.phase,
        ].join(' · ')
        return { key: `run-${item.task}-${n}`, text: fit(text, columns) }
      }
      case 'decision':
        return { key: `decide-${item.task}-${n}`, text: fit(`${ARROW} ${item.task} · ${item.text}`, columns) }
      case 'queued':
        return { key: `queued-${item.task}-${n}`, text: fit(`${ARROW} queued: ${item.task} (pos ${item.position})`, columns) }
      case 'eval-failed': {
        const score = item.total !== undefined && item.pass !== undefined ? ` ${item.pass}/${item.total}` : ' (no result block)'
        return { key: 'eval-failed', text: fit(`${ARROW} eval ${item.tier}${score} — see transcript`, Math.max(1, columns - CLEAR_COLUMNS)), clear: true }
      }
      case 'runner':
        return { key: `runner-${item.what}-${n}`, text: fit(`${ARROW} ${item.what} running · ${elapsed(now - item.at)}`, columns) }
    }
  })
}

/** The pane's "Open items": every band item with the exact next action. */
export function openItemLines(items: readonly BandItem[], now: number): string[] {
  return items.map(item => {
    switch (item.kind) {
      case 'running':
        return item.phase === 'verifying'
          ? `${item.task}: verifying ${item.tier}/${item.alias} ${elapsed(now - item.at)} — the verdict lands on its own`
          : `${item.task}: running ${item.tier}/${item.alias} ${elapsed(now - item.at)} — wait for the hand-back`
      case 'decision':
        return `${item.task}: ${item.next}`
      case 'queued':
        return `${item.task}: queued (position ${item.position}) — starts when a worker slot frees`
      case 'eval-failed': {
        const score = item.total !== undefined && item.pass !== undefined ? ` ${item.pass}/${item.total}` : ''
        return `eval ${item.tier}${score} at ${item.sha.slice(0, 8)}: read the failing names in the transcript, then press clear in the band`
      }
      case 'runner':
        return `${item.what}: running ${elapsed(now - item.at)} — nothing to do`
    }
  })
}

// ---- the pane's blocks ------------------------------------------------------------

export type Block = DashboardBlock

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const STEPS_PER_DISPATCH = 10

/**
 * The six blocks: a heading, one line of numbers for this session, and the
 * series over `history` (the last 14 sessions, oldest first, this one last).
 */
export function blocksFor(input: {
  current: Metrics
  history: readonly Metrics[]
  rateLimits?: readonly { kind: string; percentUsed: number }[]
  owedRows?: readonly string[]
}): Block[] {
  const m = input.current
  const series = (key: string) => {
    const s = SERIES.find(x => x.key === key)
    return s ? input.history.map(h => s.value(h)) : []
  }
  const window = input.rateLimits?.find(r => r.kind === 'five_hour') ?? input.rateLimits?.[0]
  const v = m.verdicts
  return [
    {
      key: 'steps',
      heading: 'Steps saved',
      number: `${plural(m.dispatches, 'dispatch', 'dispatches')} · ~${m.dispatches * STEPS_PER_DISPATCH} hand steps saved`,
      detail: [],
      series: series('steps'),
      alt: 'dispatches per session',
    },
    {
      key: 'verdicts',
      heading: 'Verdicts',
      number: `${v.verified} verified · ${v.unverified} unverified · ${v.refuted} refuted${v.falseRefuted > 0 ? ` (${v.falseRefuted} false)` : ''}`,
      detail: [],
      series: series('verdicts'),
      alt: 'refuted share per session',
    },
    {
      key: 'tiers',
      heading: 'Tiers',
      number: `haiku ${m.spawns.haiku} · sonnet ${m.spawns.sonnet} · opus ${m.spawns.opus} · resume ${m.escalations.resume} · respawn ${m.escalations.respawn}`,
      detail: [],
      series: series('tiers'),
      alt: 'share of spawns on the cheapest tier that verified, per session',
    },
    {
      key: 'owed',
      heading: 'Owed work that ran itself',
      number: `${plural(m.debriefs, 'debrief')} · ${plural(m.evals.run, 'eval')}${m.evals.failed > 0 ? ` (${m.evals.failed} failed)` : ''}`,
      detail: [...(input.owedRows ?? [])],
      series: series('owed'),
      alt: 'debriefs and evals per session',
    },
    {
      key: 'compaction',
      heading: 'Compaction',
      number: `${plural(m.compactions, 'compaction')} served, state block attached`,
      detail: [],
      series: series('compaction'),
      alt: 'compactions per session',
    },
    {
      key: 'spend',
      heading: 'Spend',
      number: `$${m.usd.toFixed(2)} on workers · ${window ? `${window.kind} window ${window.percentUsed}%` : 'window –'}`,
      detail: [],
      series: series('spend'),
      alt: 'worker dollars per session',
    },
  ]
}

// ---- sparklines ------------------------------------------------------------------

export const SPARK_POINTS = 14
export const SPARK_HEIGHT = 16
/** CSS pixels per column the Svg takes, and the most columns it spans. */
export const PX_PER_COLUMN = 8
export const SPARK_MAX_COLUMNS = 60

const r1 = (n: number) => Math.round(n * 10) / 10

/** The values drawn: nulls dropped, the last 14 kept. */
export const sparkValues = (values: readonly (number | null)[]): number[] =>
  values.filter((v): v is number => v !== null && Number.isFinite(v)).slice(-SPARK_POINTS)

/**
 * The polyline's points over a `width` × `height` box, 1 px inside it: zero at
 * the bottom, the largest value at the top; one value is a flat line across.
 */
export function sparkPoints(values: readonly (number | null)[], width: number, height: number): string {
  const v = sparkValues(values)
  if (v.length === 0) return ''
  const pad = 1
  const max = Math.max(0, ...v)
  const y = (n: number) => r1(max > 0 ? pad + (1 - n / max) * (height - 2 * pad) : height - pad)
  if (v.length === 1) return `${pad},${y(v[0] as number)} ${r1(width - pad)},${y(v[0] as number)}`
  const step = (width - 2 * pad) / (v.length - 1)
  return v.map((n, i) => `${r1(pad + i * step)},${y(n)}`).join(' ')
}

/**
 * The Svg sparkline: one polyline, no fill, 2 px, stroked in the surface's
 * foreground (`currentColor`, and the CSS system colour `CanvasText` where the
 * markup's style is kept), the viewBox sized to the column. Undefined when
 * there is nothing to draw.
 */
export function sparkSvg(values: readonly (number | null)[], columns: number): { source: string; width: number; height: number } | undefined {
  const width = Math.max(1, Math.min(columns, SPARK_MAX_COLUMNS)) * PX_PER_COLUMN
  const height = SPARK_HEIGHT
  const points = sparkPoints(values, width, height)
  if (!points) return undefined
  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">` +
    '<style>svg{color-scheme:light dark}polyline{stroke:CanvasText}</style>' +
    `<polyline points="${points}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>` +
    '</svg>'
  return { source, width, height }
}

const BLOCKS = '▁▂▃▄▅▆▇█'
/** The terminal's default colour (bit 24 alone), foreground and background. */
const DEFAULT_COLOUR = 0x01000000

/** The Raster sparkline: one row of block glyphs, one per session, in the terminal's own colours. */
export function sparkCells(values: readonly (number | null)[]): { cells: string; columns: number; rows: 1; glyphs: string } | undefined {
  const v = sparkValues(values)
  if (v.length === 0) return undefined
  const max = Math.max(0, ...v)
  const glyphs = v.map(n => BLOCKS[max > 0 ? Math.round((n / max) * (BLOCKS.length - 1)) : 0] as string)
  const words = new Uint32Array(v.length * 3)
  glyphs.forEach((g, i) => {
    words[i * 3] = g.codePointAt(0) as number
    words[i * 3 + 1] = DEFAULT_COLOUR
    words[i * 3 + 2] = DEFAULT_COLOUR
  })
  return { cells: base64(littleEndian(words)), columns: v.length, rows: 1, glyphs: glyphs.join('') }
}

/** u32 words as little-endian bytes, whatever the host's order. */
function littleEndian(words: Uint32Array): Uint8Array {
  const bytes = new Uint8Array(words.length * 4)
  words.forEach((w, i) => {
    bytes[i * 4] = w & 0xff
    bytes[i * 4 + 1] = (w >>> 8) & 0xff
    bytes[i * 4 + 2] = (w >>> 16) & 0xff
    bytes[i * 4 + 3] = (w >>> 24) & 0xff
  })
  return bytes
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** Standard padded base64 (the environment's Uint8Array may have no toBase64). */
export function base64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] as number
    const b = bytes[i + 1]
    const c = bytes[i + 2]
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0)
    out += B64[(n >> 18) & 63]
    out += B64[(n >> 12) & 63]
    out += b === undefined ? '=' : B64[(n >> 6) & 63]
    out += c === undefined ? '=' : B64[n & 63]
  }
  return out
}

// ---- 3D: the status tool -----------------------------------------------------------

export const STATUS_TOOL = {
  name: 'status',
  description:
    'The chassis-delegation state, as the system prompt section renders it: running workers, pending verdicts, queued spawns and what is owed, then the last 10 verdict lines and the last eval and debrief. Call it instead of reading the store. Pass open: true only when the person asks to see the Delegation pane.',
  inputSchema: {
    type: 'object',
    properties: {
      open: { type: 'boolean', description: 'Also open the Delegation pane for the person (only when they asked to see it)' },
    },
    additionalProperties: false,
  },
} as const

/** The name the model calls it by: `mcp__<plugin>__<name>`. */
export const STATUS_TOOL_NAME = 'mcp__chassis-delegation__status'

export const STATUS_VERDICTS = 10
const NOTHING = 'Delegation state (chassis-delegation): nothing running, nothing owed.'

/** The compose section's text (or that nothing runs), then the tails: 10 verdicts, the last eval, the last debrief. */
export function statusToolText(section: string | undefined, tails: { verdicts: readonly string[]; eval?: string; debrief?: string }): string {
  const verdicts = tails.verdicts.slice(-STATUS_VERDICTS)
  return [
    section ?? NOTHING,
    ...(verdicts.length > 0 ? [`Last ${STATUS_VERDICTS} verdicts:`, ...verdicts.map(l => `- ${l}`)] : [`Last ${STATUS_VERDICTS} verdicts: none this session`]),
    `Last eval: ${tails.eval ?? 'none'}`,
    `Last debrief: ${tails.debrief ?? 'none this session'}`,
  ].join('\n')
}
