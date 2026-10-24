// MOD-128: the rationing meter. Pure: no `$`. The host reports each rate-limit window as
// {kind, percentUsed, resetsAt}; the mod keeps one record per local day and window kind and draws
// a health bar (one cell per day of the week, or per hour of the five-hour window), today's share
// of what is left, and whether today is on pace. Every time here is in milliseconds; the host's
// resetsAt (epoch seconds) is converted where the reading enters the mod.

const HOUR = 3_600_000
const DAY = 24 * HOUR
/** A change of resetsAt under this is the host rounding, not a window that reset. */
const RESET_JITTER_MS = 60_000

/** A window reading, resetsAt in ms. */
export type Reading = { percentUsed: number; resetsAt: number }
export type Window = Reading & { kind: string }

/** One local day of one window kind, as kept under `delegation.ration.<kind>.<YYYY-MM-DD>`. */
export type DayRecord = {
  /** The window's points at the day's first reading, or 0 from the moment the window reset today. */
  startPct: number
  startAt: number
  resetsAt: number
  lastPct: number
  lastAt: number
  /** lastPct - startPct, never negative. */
  used: number
}

export type RationOption = { rationDaily: number }

export type DaySegment = {
  used: number
  share: number
  state: 'under' | 'near' | 'over' | 'today' | 'future'
  /** False for a day before the mod had a record. */
  known: boolean
}

const round1 = (n: number): number => Math.round(n * 10) / 10
const round2 = (n: number): number => Math.round(n * 100) / 100
const one = (n: number): string => n.toFixed(1)
const startOfDay = (ms: number): number => new Date(ms).setHours(0, 0, 0, 0)

/** The local date, `YYYY-MM-DD`. */
export function dayKey(now: number): string {
  const d = new Date(now)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** A moment `days` local calendar days from `now` (noon of that day, so a clock change cannot move its date). */
const shiftDays = (now: number, days: number): number => {
  const d = new Date(now)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, 12).getTime()
}

/** Today's record after a reading at `now`; `prev` is today's record so far, if any. Idempotent for the same reading. */
export function dayRecord(prev: DayRecord | undefined, reading: Reading, now: number): DayRecord {
  const { percentUsed, resetsAt } = reading
  if (!prev) return { startPct: percentUsed, startAt: now, resetsAt, lastPct: percentUsed, lastAt: now, used: 0 }
  if (Math.abs(prev.resetsAt - resetsAt) > RESET_JITTER_MS) {
    // the window reset today: its points count from 0 from this moment
    return { startPct: 0, startAt: now, resetsAt, lastPct: percentUsed, lastAt: now, used: Math.max(0, round2(percentUsed)) }
  }
  return { ...prev, resetsAt: prev.resetsAt, lastPct: percentUsed, lastAt: now, used: Math.max(0, round2(percentUsed - prev.startPct)) }
}

/** Today's allowance in window points: rationDaily when set, else what is left over the days left, from the day's start. */
export function allowance(record: Pick<DayRecord, 'startPct' | 'startAt' | 'resetsAt'>, option: RationOption): number {
  if (option.rationDaily > 0) return option.rationDaily
  const daysLeft = Math.max(1, Math.ceil((record.resetsAt - startOfDay(record.startAt)) / DAY - 1e-9))
  return Math.max(0, round1((100 - record.startPct) / daysLeft))
}

/** Points earlier days of this window left unspent under a fixed daily allowance; 0 with none set. */
export function surplus(records: readonly Pick<DayRecord, 'used'>[], rationDaily: number): number {
  if (!(rationDaily > 0)) return 0
  return Math.max(0, round2(records.reduce((n, r) => n + (rationDaily - r.used), 0)))
}

/** `on pace`, `ahead by x` or `over by x`. */
export function pace(record: Pick<DayRecord, 'used'>, allow: number, now: number): string {
  const elapsed = Math.min(1, Math.max(0, (now - startOfDay(now)) / DAY))
  const used = record.used
  if (used > 0 && used >= allow) return `over by ${one(used - allow)}`
  if (used <= allow * elapsed + 0.5) return 'on pace'
  return `ahead by ${one(used - allow * elapsed)}`
}

/** The cells of a window's bar: one per day of the seven-day windows, one per hour of the five-hour one. */
export const segments = (kind: string): number => (kind === 'five_hour' ? 5 : 7)
/** What one cell of a bar of `segs` cells spans. */
const cellMs = (segs: number): number => (segs === 5 ? HOUR : DAY)

const EIGHTHS = ['▏', '▎', '▍', '▌', '▋', '▊', '▉']

/** The health bar: the used points fill the cells left to right, `█` whole, an eighth block for the cell they run out in, `░` for the rest. */
export function bar(percentUsed: number, segs: number): string {
  const filled = (Math.min(100, Math.max(0, percentUsed)) * segs) / 100
  let out = ''
  for (let i = 0; i < segs; i++) {
    const left = filled - i
    if (left >= 1 - 1e-9) {
      out += '█'
      continue
    }
    const eighths = left > 0 ? Math.round(left * 8) : 0
    out += eighths >= 8 ? '█' : eighths <= 0 ? '░' : EIGHTHS[eighths - 1]
  }
  return out
}

/** The 1-based cell `now` falls in; the window starts `segs` cells before it resets. */
export function dayIndex(now: number, resetsAt: number, segs: number): number {
  const start = resetsAt - segs * cellMs(segs)
  return Math.min(segs, Math.max(1, Math.floor((now - start) / cellMs(segs)) + 1))
}

/** The cells' states for the pane: one per cell, `records` in cell order, `today` the 1-based cell of now. */
export function daySegments(records: readonly (DayRecord | undefined)[], today: number, share: number | ((r: DayRecord | undefined) => number)): DaySegment[] {
  return records.map((r, i): DaySegment => {
    const cell = i + 1
    const s = typeof share === 'number' ? share : share(r)
    const used = r?.used ?? 0
    const known = r !== undefined
    if (cell > today) return { used, share: s, state: 'future', known }
    if (cell === today) return { used, share: s, state: 'today', known }
    return { used, share: s, state: used <= s ? 'under' : used <= s * 1.1 ? 'near' : 'over', known }
  })
}

/** `<bar> <pct>% · day <d>/<n> · today <used>/<allowance> · <pace>`; `(+x)` after the allowance when a surplus is in it. */
export function rationText(window: Window, record: Pick<DayRecord, 'used'>, allow: number, paceText: string, now: number, extra = 0): string {
  const segs = segments(window.kind)
  const pct = Math.round(window.percentUsed)
  const unit = segs === 5 ? 'hour' : 'day'
  const plus = extra > 0 ? ` (+${one(extra)})` : ''
  return `${bar(window.percentUsed, segs)} ${pct}% · ${unit} ${dayIndex(now, window.resetsAt, segs)}/${segs} · today ${one(record.used)}/${one(allow)}${plus} · ${paceText}`
}

/** `2d 4h`, `3h 20m` or `12m`. */
export function resetsIn(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000))
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m % 60}m`
  return `${m}m`
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/**
 * The /delegation ration text: the bar line with the reset, today's line, and (for a seven-day
 * window) the days so far from the stored records, `records` in cell order from the first cell.
 */
export function rationReport(window: Window, record: DayRecord, allow: number, paceText: string, now: number, records: readonly (DayRecord | undefined)[], extra = 0): string {
  const segs = segments(window.kind)
  const idx = dayIndex(now, window.resetsAt, segs)
  const lines = [
    `${rationText(window, record, allow, paceText, now, extra)} · resets ${resetsIn(window.resetsAt - now)}`,
    `today: ${one(record.used)} of ${one(allow)}${extra > 0 ? ` (+${one(extra)})` : ''} window points used, ${paceText}`,
  ]
  if (segs === 7) {
    const days: string[] = []
    for (let cell = 1; cell <= idx; cell++) {
      const r = cell === idx ? record : records[cell - 1]
      const name = WEEKDAYS[new Date(shiftDays(now, cell - idx)).getDay()]
      days.push(`${name} ${r ? one(r.used) : '–'}${cell === idx ? '*' : ''}`)
    }
    lines.push(`days: ${days.join(' · ')}`)
  }
  return lines.join('\n')
}

/** The calendar day (`YYYY-MM-DD`) a cell of a seven-day window stands for, anchored on today's cell. */
export const cellDay = (now: number, today: number, cell: number): string => dayKey(shiftDays(now, cell - today))

/** The record that belongs to this window: the same resetsAt, within the host's rounding. */
export const inWindow = (r: DayRecord | undefined, resetsAt: number): r is DayRecord => r !== undefined && Math.abs(r.resetsAt - resetsAt) <= RESET_JITTER_MS

/** A stored value as a DayRecord, or undefined when it is not one. */
export function parseRecord(v: unknown): DayRecord | undefined {
  if (!v || typeof v !== 'object') return undefined
  const r = v as Record<string, unknown>
  const num = (k: string): number | undefined => (typeof r[k] === 'number' && Number.isFinite(r[k]) ? (r[k] as number) : undefined)
  const [startPct, startAt, resetsAt, lastPct, lastAt, used] = ['startPct', 'startAt', 'resetsAt', 'lastPct', 'lastAt', 'used'].map(num)
  if ([startPct, startAt, resetsAt, lastPct, lastAt, used].some(x => x === undefined)) return undefined
  return { startPct: startPct!, startAt: startAt!, resetsAt: resetsAt!, lastPct: lastPct!, lastAt: lastAt!, used: used! }
}

/** The store key of a window kind's day. */
export const rationKey = (kind: string, now: number): string => `delegation.ration.${kind}.${dayKey(now)}`
