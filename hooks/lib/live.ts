// GH-112: the live delegation model behind the band and the pane. Pure: no `$`.
// register.ts gathers the raw facts (the session cost, the attempt records, the
// queue, `git worktree list --porcelain`) and hands them in; everything the
// drawing shows is made here: the spend series, the events, the worktree rows,
// spend by model, the chart geometry (an Svg source, or Raster cells).
import type { AttemptRecord } from './attempts'
import { taskLabel } from './attempts'
import { base64, elapsed } from './dashboard'
import { brainSummary, brainTileText, type BrainRecord, type BrainSummary } from './brain'
import { worktreePath } from './paths'

// ---- the spend series -------------------------------------------------------------

export type SpendPoint = { t: number; usd: number }
export const SPEND_CAP = 240
export const SAMPLE_LIVE_MS = 15_000
export const SAMPLE_IDLE_MS = 60_000

/** How often to sample the session's dollars: fast while a worker is live or queued, slow otherwise. */
export const sampleEvery = (active: boolean): number => (active ? SAMPLE_LIVE_MS : SAMPLE_IDLE_MS)

/** The series with one more sample, the last `cap` kept; a sample that is no finite number is dropped. */
export function spendSeries(prev: readonly SpendPoint[] | undefined, point: SpendPoint, cap = SPEND_CAP): SpendPoint[] {
  const list = Array.isArray(prev) ? prev : []
  if (!Number.isFinite(point.usd) || !Number.isFinite(point.t)) return [...list]
  return [...list, point].slice(-cap)
}

// ---- model families ---------------------------------------------------------------

export type Family = 'haiku' | 'sonnet' | 'opus' | 'other'
export const FAMILIES: readonly Family[] = ['haiku', 'sonnet', 'opus', 'other']

/** The family of an alias or a resolved model id; anything not haiku, sonnet or opus is "other". */
export function familyOf(model: string | undefined): Family {
  const m = (model ?? '').toLowerCase()
  if (m.includes('haiku')) return 'haiku'
  if (m.includes('sonnet')) return 'sonnet'
  if (m.includes('opus')) return 'opus'
  return 'other'
}

const recordFamily = (r: Pick<AttemptRecord, 'alias' | 'resolvedModel'>): Family => {
  const f = familyOf(r.alias)
  return f === 'other' ? familyOf(r.resolvedModel) : f
}

const round4 = (n: number) => Math.round(n * 10000) / 10000

export type ModelSpend = { family: Family; usd: number; tokens: number; verified: number }

/** Dollars and tokens per family from the records' own spend, and how many cards each verified. */
export function spendByModel(records: readonly AttemptRecord[]): ModelSpend[] {
  const out = new Map<Family, { usd: number; tokens: number; cards: Set<string> }>(FAMILIES.map(f => [f, { usd: 0, tokens: 0, cards: new Set<string>() }]))
  for (const r of records) {
    const row = out.get(recordFamily(r)) as { usd: number; tokens: number; cards: Set<string> }
    row.usd += r.usd ?? 0
    row.tokens += r.tokens ?? 0
    if (r.verdict === 'verified') row.cards.add(taskLabel(r.task, r.subtask))
  }
  return FAMILIES.map(family => {
    const row = out.get(family) as { usd: number; tokens: number; cards: Set<string> }
    return { family, usd: round4(row.usd), tokens: row.tokens, verified: row.cards.size }
  })
}

/** Records of this session: those that began at or after `since`. */
export const sessionRecords = (records: readonly AttemptRecord[], since: number): AttemptRecord[] => records.filter(r => r.at >= since)

// ---- events -----------------------------------------------------------------------

export type LiveEvent = { t: number; kind: 'spawn' | 'verdict'; task: string; family: Family; verdict?: string }

/** Spawn and verdict times this session, oldest first (a spawn before a verdict at the same time). */
export function events(records: readonly AttemptRecord[], since: number): LiveEvent[] {
  const out: LiveEvent[] = []
  for (const r of records) {
    if (r.at < since || r.kind === 'verify') continue
    const task = taskLabel(r.task, r.subtask)
    const family = recordFamily(r)
    out.push({ t: r.at, kind: 'spawn', task, family })
    if (r.verdict !== 'pending' && r.verdictAt !== undefined) out.push({ t: r.verdictAt, kind: 'verdict', task, family, verdict: r.verdict })
  }
  return out.sort((a, b) => a.t - b.t || (a.kind === b.kind ? 0 : a.kind === 'spawn' ? -1 : 1))
}

// ---- verdict marks and colours ----------------------------------------------------

export type Scheme = 'light' | 'dark'

/** Light or dark from what the render input reports of the surface; dark when it reports none. */
export function pickScheme(e: unknown): Scheme {
  const seen = (o: unknown): string | undefined => {
    if (!o || typeof o !== 'object') return undefined
    for (const k of ['colorScheme', 'theme', 'scheme', 'appearance']) {
      const v = (o as Record<string, unknown>)[k]
      if (typeof v === 'string') return v.toLowerCase()
    }
    return undefined
  }
  const v = seen(e) ?? seen((e as { props?: unknown } | undefined)?.props) ?? seen((e as { viewport?: unknown } | undefined)?.viewport)
  return v?.includes('light') ? 'light' : 'dark'
}

/** A model family's chip colour; "other" has none (the surface's secondary ink). */
export const MODEL_COLORS: Record<Exclude<Family, 'other'>, Record<Scheme, string>> = {
  haiku: { light: '#2a78d6', dark: '#3987e5' },
  sonnet: { light: '#eb6834', dark: '#d95926' },
  opus: { light: '#1baf7a', dark: '#199e70' },
}
/** The brain's colour on a premium model (GH-113). */
export const FABLE_COLOR: Record<Scheme, string> = { light: '#7c4dcc', dark: '#9a73e0' }
export const modelColor = (family: Family, scheme: Scheme): string | undefined => (family === 'other' ? undefined : MODEL_COLORS[family][scheme])

export const SURFACE: Record<Scheme, string> = { light: '#fcfcfb', dark: '#1a1a19' }

export type Mark = { icon: string; color: string; word: string }

/** Verdict status: an icon, a colour and the word, never a colour alone. Undefined for a state that is no verdict. */
export function verdictMark(verdict: string | undefined): Mark | undefined {
  switch (verdict) {
    case 'verified':
      return { icon: '✓', color: '#0ca30c', word: 'verified' }
    case 'unverified':
    case 'over-spend':
      return { icon: '!', color: '#fab219', word: verdict }
    case 'refuted':
    case 'no-report':
    case 'refused':
      return { icon: '✗', color: '#d03b3b', word: verdict }
    default:
      return undefined
  }
}

// ---- the worktree rows ------------------------------------------------------------

export type RowKind = 'live' | 'queued' | 'verdict' | 'owed' | 'disk'
export type WorktreeRow = {
  task: string
  family: Family
  /** The resolved model id when the record has one, else the alias. */
  model: string
  state: string
  kind: RowKind
  verdict?: string
  /** The worktree's folder name, or an en dash when it has none on disk. */
  folder: string
  branch: string
  tokens?: number
  usd?: number
  /** `n/b`: the latest attempt over the budget. */
  attempt: string
}

export type WorktreeInput = {
  root: string
  worktreeRoot?: string
  /** `git worktree list --porcelain`. */
  porcelain: string
  /** This session's attempt records, all tasks. */
  records: readonly AttemptRecord[]
  /** Queued spawns, front first. */
  queue: readonly { task: string; subtask?: string }[]
  /** Task label to the ms since the epoch its live worker started or resumed. */
  liveAt: Readonly<Record<string, number>>
  now: number
  /** The attempt budget shown after the slash. */
  budget: number
}

/** The worktrees `git worktree list --porcelain` names: path and branch. */
export function parsePorcelain(text: string): { path: string; branch: string }[] {
  const out: { path: string; branch: string }[] = []
  for (const block of text.split(/\n\s*\n/)) {
    let path = ''
    let branch = ''
    for (const line of block.split('\n')) {
      if (line.startsWith('worktree ')) path = line.slice('worktree '.length).trim()
      else if (line.startsWith('branch ')) branch = line.slice('branch '.length).trim().replace(/^refs\/heads\//, '')
    }
    if (path) out.push({ path, branch })
  }
  return out
}

const base = (p: string) => p.slice(p.lastIndexOf('/') + 1)

/** One row per task this session, per queued task, and per worktree on disk under the mod's naming. */
export function worktreeRows(input: WorktreeInput): WorktreeRow[] {
  const prefix = worktreePath(input.root, '', false, input.worktreeRoot)
  const disk = new Map<string, { path: string; branch: string }>()
  for (const w of parsePorcelain(input.porcelain)) {
    if (!w.path.startsWith(prefix) || w.path.length === prefix.length) continue
    disk.set(w.path.slice(prefix.length).replace(/-replay$/, ''), w)
  }
  const byLabel = new Map<string, AttemptRecord[]>()
  for (const r of [...input.records].sort((a, b) => a.at - b.at)) {
    const label = taskLabel(r.task, r.subtask)
    byLabel.set(label, [...(byLabel.get(label) ?? []), r])
  }
  const queued = input.queue.map(q => taskLabel(q.task, q.subtask ?? 'main'))
  const rows: WorktreeRow[] = []
  const seen = new Set<string>()
  const labels = [...byLabel.keys(), ...queued.filter(l => !byLabel.has(l))]
  for (const label of labels) {
    seen.add(label)
    const recs = byLabel.get(label) ?? []
    const latest = recs.reduce<AttemptRecord | undefined>((a, r) => (a === undefined || r.attempt >= a.attempt ? r : a), undefined)
    const id = (latest?.task ?? label.split('/')[0]) as string
    const wt = disk.get(id)
    const usds = recs.flatMap(r => (r.usd === undefined ? [] : [r.usd]))
    const toks = recs.flatMap(r => (r.tokens === undefined ? [] : [r.tokens]))
    const resolved = [...recs].reverse().find(r => r.resolvedModel)?.resolvedModel
    const q = queued.indexOf(label)
    let state: string
    let kind: RowKind
    let verdict: string | undefined
    if (input.liveAt[label] !== undefined) {
      state = `live ${elapsed(input.now - (input.liveAt[label] as number))}`
      kind = 'live'
    } else if (q >= 0) {
      state = `queued #${q + 1}`
      kind = 'queued'
    } else if (latest && latest.verdict !== 'pending') {
      state = latest.verdict
      kind = 'verdict'
      verdict = latest.verdict
    } else {
      state = 'verdict owed'
      kind = 'owed'
    }
    rows.push({
      task: label,
      family: latest ? recordFamily(latest) : 'other',
      model: latest ? (resolved ?? latest.alias) : '–',
      state,
      kind,
      ...(verdict ? { verdict } : {}),
      folder: wt ? base(wt.path) : '–',
      branch: wt?.branch ?? '',
      ...(toks.length > 0 ? { tokens: toks.reduce((a, b) => a + b, 0) } : {}),
      ...(usds.length > 0 ? { usd: round4(usds.reduce((a, b) => a + b, 0)) } : {}),
      attempt: `${latest?.attempt ?? 0}/${input.budget}`,
    })
  }
  for (const [id, wt] of disk) {
    if (seen.has(id) || [...seen].some(l => l.split('/')[0] === id)) continue
    rows.push({ task: id, family: 'other', model: '–', state: 'on disk', kind: 'disk', folder: base(wt.path), branch: wt.branch, attempt: `0/${input.budget}` })
  }
  const rank: Record<RowKind, number> = { live: 0, owed: 1, queued: 2, verdict: 3, disk: 4 }
  return rows.map((r, i) => ({ r, i })).sort((a, b) => rank[a.r.kind] - rank[b.r.kind] || a.i - b.i).map(x => x.r)
}

// ---- the view both drawings read --------------------------------------------------

export type LiveView = {
  now: number
  live: number
  queued: number
  owed: number
  usd: number
  series: SpendPoint[]
  events: LiveEvent[]
  rows: WorktreeRow[]
  byModel: ModelSpend[]
  firstTry: { n: number; m: number }
  /** GH-113: the brain's own spend beside the workers'; absent before the brain's first turn. */
  brain?: BrainSummary
}

/** Cards judged on their first attempt this session: how many verified. */
export function firstTry(records: readonly AttemptRecord[]): { n: number; m: number } {
  const first = new Map<string, AttemptRecord>()
  for (const r of records) if (r.attempt === 1 && r.kind !== 'verify') first.set(taskLabel(r.task, r.subtask), r)
  const judged = [...first.values()].filter(r => r.verdict !== 'pending')
  return { n: judged.filter(r => r.verdict === 'verified').length, m: judged.length }
}

export type ViewInput = WorktreeInput & { since: number; usd: number; series: readonly SpendPoint[]; owed: number; brain?: BrainRecord }

export function liveView(i: ViewInput): LiveView {
  const records = sessionRecords(i.records, i.since)
  return {
    now: i.now,
    live: Object.keys(i.liveAt).length,
    queued: i.queue.length,
    owed: i.owed,
    usd: i.usd,
    series: [...i.series],
    events: events(records, i.since),
    rows: worktreeRows({ ...i, records }),
    byModel: spendByModel(records),
    firstTry: firstTry(records),
    ...(i.brain && i.brain.turns > 0 ? { brain: brainSummary(i.brain, workersUsd(records), attempts(records), i.usd > 0 ? i.usd : undefined) } : {}),
  }
}

/** Dollars the session's worker attempts spent (the brain's own turns are not among them). */
export const workersUsd = (records: readonly AttemptRecord[]): number => round4(records.reduce((a, r) => a + (r.usd ?? 0), 0))

/** Worker attempts this session (a verify pass is no attempt). */
export const attempts = (records: readonly AttemptRecord[]): number => records.filter(r => r.kind !== 'verify').length

/** The band shows while a worker is live, a spawn is queued or a verdict is owed. */
export const isActive = (v: Pick<LiveView, 'live' | 'queued' | 'owed'>): boolean => v.live + v.queued + v.owed > 0

// ---- the band's line --------------------------------------------------------------

const dollars = (n: number) => `$${n.toFixed(2)}`

export function bandSummary(v: LiveView): string {
  return ['delegation', `${v.live} live`, `${v.queued} queued`, ...(v.owed > 0 ? [`${v.owed} owed`] : []), dollars(v.usd)].join(' · ')
}

/** The last 30 minutes of cumulative dollars, thinned to at most `n` values: the band's sparkline. */
export function recentSpend(series: readonly SpendPoint[], now: number, windowMs = 30 * 60_000, n = 14): number[] {
  const inside = series.filter(p => p.t >= now - windowMs)
  if (inside.length <= n) return inside.map(p => p.usd)
  return Array.from({ length: n }, (_, i) => (inside[Math.round((i * (inside.length - 1)) / (n - 1))] as SpendPoint).usd)
}

/** `1.2k`, `412k`, `3.4M`. */
export function tokText(n: number): string {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${Math.round(n / 100) / 10 >= 100 ? Math.round(n / 1000) : +(n / 1000).toFixed(1)}k`
  return String(n)
}

/** `sonnet · $3.10 · 412k tok · 4 verified`. */
export const modelLabel = (m: ModelSpend): string => `${m.family} · ${dollars(m.usd)} · ${tokText(m.tokens)} tok · ${m.verified} verified`

/** `brain · fable · $2.25 · 630k tok · 3 turns`: the brain's row of spend by model, labelled so Fable is never mistaken for a worker's. */
export const brainModelLabel = (b: BrainSummary): string =>
  `brain · ${b.family} · ${dollars(b.brain)}${b.unpriced ? '+' : ''} · ${tokText(b.tokens)} tok · ${b.turns} ${b.turns === 1 ? 'turn' : 'turns'}`

// ---- the dashboard as text (a screen that shows no panes) --------------------------

const BARS = '▁▂▃▄▅▆▇█'

/** `▁▃▅█`: values scaled to eight glyph heights; empty under two values. */
export function sparkText(values: readonly number[]): string {
  if (values.length < 2) return ''
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  return values.map(v => BARS[hi === lo ? 0 : Math.round(((v - lo) / (hi - lo)) * 7)]).join('')
}

const cell = (s: string) => s.replace(/\|/g, '\\|')

/**
 * The dashboard as markdown, for a screen that shows no mod panes (the VS Code
 * extension): the headline, the spend over the session, the worktree table and
 * spend by model.
 */
export function dashboardText(v: LiveView): string {
  const ft = v.firstTry.m > 0 ? ` · ${v.firstTry.n} of ${v.firstTry.m} verified on the first attempt` : ''
  const lines = [`**Delegation** · ${v.live} live · ${v.queued} queued${v.owed > 0 ? ` · ${v.owed} owed` : ''} · ${dollars(v.usd)} this session${ft}`]
  const series = v.series
  if (series.length >= 2) {
    const first = series[0] as SpendPoint
    const mins = Math.max(1, Math.round((v.now - first.t) / 60_000))
    lines.push(`Spend: ${dollars(first.usd)} → ${dollars(v.usd)} over the last ${mins} min ${sparkText(recentSpend(series, v.now, Number.MAX_SAFE_INTEGER, 24))}`)
  }
  lines.push('')
  if (v.rows.length === 0) lines.push('No worktrees or tasks this session.')
  else {
    lines.push('| Task | Model | State | Worktree | Tokens | Cost | Attempt |', '| --- | --- | --- | --- | --- | --- | --- |')
    for (const r of v.rows) {
      const mark = r.verdict ? verdictMark(r.verdict) : undefined
      const state = mark ? `${mark.icon} ${r.state}` : r.state
      const where = r.folder === '–' ? '–' : `${r.folder}${r.branch ? ` · ${r.branch}` : ''}`
      lines.push(`| ${cell(r.task)} | ${cell(r.family === 'other' ? r.model : `${r.family} (${r.model})`)} | ${cell(state)} | ${cell(where)} | ${r.tokens !== undefined ? tokText(r.tokens) : '–'} | ${r.usd !== undefined ? dollars(r.usd) : '–'} | ${r.attempt} |`)
    }
  }
  if (v.brain) lines.push('', `Spend split: ${brainTileText(v.brain)}${v.brain.edits > 0 ? ` · ${v.brain.edits} brain ${v.brain.edits === 1 ? 'edit' : 'edits'}` : ''}`)
  if (v.byModel.length > 0 || v.brain) lines.push(...(v.brain ? [] : ['']), `By model: ${[...(v.brain ? [brainModelLabel(v.brain)] : []), ...v.byModel.map(modelLabel)].join('; ')}`)
  lines.push('', 'Tokens and cost for a worker update when its run ends.')
  return lines.join('\n')
}

// ---- the spend chart --------------------------------------------------------------

type Geo = { t0: number; t1: number; max: number }
const geo = (series: readonly SpendPoint[], now: number): Geo | undefined => {
  if (series.length === 0) return undefined
  const t0 = (series[0] as SpendPoint).t
  const t1 = Math.max(now, (series.at(-1) as SpendPoint).t, t0 + 1)
  return { t0, t1, max: Math.max(0.01, ...series.map(p => p.usd)) }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const r1 = (n: number) => Math.round(n * 10) / 10
const agoText = (ms: number) => (ms < 60_000 ? 'now' : `${Math.round(ms / 60_000)}m ago`)

/** The nearest event to `t`, within `within` ms. */
export function nearestEvent(evs: readonly LiveEvent[], t: number, within = 30_000): LiveEvent | undefined {
  let best: LiveEvent | undefined
  for (const e of evs) if (Math.abs(e.t - t) <= within && (best === undefined || Math.abs(e.t - t) < Math.abs(best.t - t))) best = e
  return best
}

export const CHART_HEIGHT = 96
const TICKS = 10

/**
 * The Svg: cumulative session dollars as a 2 px line over a light area in the
 * surface's text ink (CanvasText: the total is no model's colour), 1 px event
 * ticks on the time axis (short for a spawn, long for a verdict), no second y
 * axis. Interactive: a crosshair and a tooltip (time, dollars so far, the
 * nearest event) at the pointer, by `:hover` and `<title>`.
 */
export function chartSvg(series: readonly SpendPoint[], evs: readonly LiveEvent[], now: number, columns: number): { source: string; width: number; height: number } | undefined {
  const g = geo(series, now)
  if (!g) return undefined
  const width = Math.max(8, Math.min(columns, 120)) * 8
  const height = CHART_HEIGHT
  const top = 6
  const base = height - TICKS - 2
  const x = (t: number) => r1(1 + ((t - g.t0) / (g.t1 - g.t0)) * (width - 2))
  const y = (usd: number) => r1(base - (usd / g.max) * (base - top))
  const pts = series.map(p => `${x(p.t)},${y(p.usd)}`)
  const line = series.length === 1 ? `1,${y((series[0] as SpendPoint).usd)} ${width - 1},${y((series[0] as SpendPoint).usd)}` : pts.join(' ')
  const area = `M1,${base} L${line.replace(/ /g, ' L')} L${series.length === 1 ? width - 1 : x((series.at(-1) as SpendPoint).t)},${base} Z`
  const ticks = evs
    .filter(e => e.t >= g.t0 && e.t <= g.t1)
    .map(e => `<line x1="${x(e.t)}" x2="${x(e.t)}" y1="${base}" y2="${base + (e.kind === 'verdict' ? TICKS : TICKS / 2)}" stroke="currentColor" stroke-width="1"/>`)
    .join('')
  const step = series.length > 1 ? (width - 2) / (series.length - 1) : width
  const hits = series
    .map((p, i) => {
      const ev = nearestEvent(evs, p.t)
      const tip = `${agoText(now - p.t)} · ${dollars(p.usd)} so far${ev ? ` · ${ev.kind} ${ev.task} ${ev.family}${ev.verdict ? ` ${ev.verdict}` : ''}` : ''}`
      return `<g class="h"><rect x="${r1(x(p.t) - step / 2)}" y="0" width="${r1(step)}" height="${height}" fill="transparent"/><line class="x" x1="${x(p.t)}" x2="${x(p.t)}" y1="${top}" y2="${base}" stroke="currentColor" stroke-width="1"/><title>${esc(tip)}</title></g>`
    })
    .join('')
  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" color="CanvasText">` +
    '<style>svg{color-scheme:light dark}.h .x{opacity:0}.h:hover .x{opacity:.6}</style>' +
    `<path d="${area}" fill="currentColor" fill-opacity="0.12" stroke="none"/>` +
    `<polyline points="${line}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>` +
    `<line x1="1" x2="${width - 1}" y1="${base}" y2="${base}" stroke="currentColor" stroke-width="1" stroke-opacity="0.4"/>` +
    ticks +
    hits +
    '</svg>'
  return { source, width, height }
}

const BLOCKS = ' ▁▂▃▄▅▆▇█'
const DEFAULT_COLOUR = 0x01000000

/**
 * The terminal's chart: a Raster, one column per `columns`, `rows` high, the
 * area under the line filled with block glyphs in the terminal's own ink, and
 * one row of event ticks beneath (`┬` a spawn, `┴` a verdict). No Svg here.
 */
export function chartCells(series: readonly SpendPoint[], evs: readonly LiveEvent[], now: number, columns: number, rows = 4): { cells: string; columns: number; rows: number; glyphs: string[] } | undefined {
  const g = geo(series, now)
  if (!g) return undefined
  const cols = Math.max(4, Math.min(columns, 120))
  const total = rows + 1
  const valueAt = (c: number): number => {
    const t = g.t0 + (c / (cols - 1)) * (g.t1 - g.t0)
    let v = 0
    for (const p of series) if (p.t <= t) v = p.usd
    return series.length === 1 || t < (series[0] as SpendPoint).t ? (series[0] as SpendPoint).usd : v
  }
  const grid: string[][] = Array.from({ length: total }, () => Array.from({ length: cols }, () => ' '))
  for (let c = 0; c < cols; c++) {
    const eighths = Math.round((valueAt(c) / g.max) * rows * 8)
    for (let r = 0; r < rows; r++) {
      const fill = Math.max(0, Math.min(8, eighths - (rows - 1 - r) * 8))
      ;(grid[r] as string[])[c] = BLOCKS[fill] as string
    }
  }
  for (const e of evs) {
    if (e.t < g.t0 || e.t > g.t1) continue
    const c = Math.min(cols - 1, Math.round(((e.t - g.t0) / (g.t1 - g.t0)) * (cols - 1)))
    const cur = (grid[rows] as string[])[c]
    ;(grid[rows] as string[])[c] = e.kind === 'verdict' || cur === '┴' ? '┴' : '┬'
  }
  const glyphs = grid.map(r => r.join(''))
  const words = new Uint32Array(cols * total * 3)
  grid.forEach((row, r) =>
    row.forEach((ch, c) => {
      const i = (r * cols + c) * 3
      words[i] = ch.codePointAt(0) as number
      words[i + 1] = DEFAULT_COLOUR
      words[i + 2] = DEFAULT_COLOUR
    }),
  )
  const bytes = new Uint8Array(words.length * 4)
  words.forEach((w, i) => {
    bytes[i * 4] = w & 0xff
    bytes[i * 4 + 1] = (w >>> 8) & 0xff
    bytes[i * 4 + 2] = (w >>> 16) & 0xff
    bytes[i * 4 + 3] = (w >>> 24) & 0xff
  })
  return { cells: base64(bytes), columns: cols, rows: total, glyphs }
}
