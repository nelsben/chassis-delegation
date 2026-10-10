// MOD-10: a breadcrumbs-mode debrief is bounded to its window and checked at hand-back.
// The window is (watermark, end] of the session's breadcrumb file; the check strips the
// evidence that is outside it, flags the kinds the window does not contain, and sets the
// findings about the host aside. Pure: no `$`.

/** The mod surfaces a mod_findings entry may be about. */
export const MOD_SURFACES = ['card', 'dispatch', 'brief', 'verifier', 'gate', 'dashboard', 'debrief', 'update', 'accept', 'config', 'allowlist', 'scheduler'] as const

/** The breadcrumb lines a debrief covers: (watermark, end], with the first and last timestamps and the kinds seen. */
export type DebriefWindow = { watermark: number; end: number; firstLine: number; lastLine: number; firstTs: string; lastTs: string; kinds: string[] }

/** The window of a breadcrumb file's text past `watermark`; undefined when no line is past it. */
export function windowOf(crumbs: string, watermark: number): DebriefWindow | undefined {
  const lines = crumbs.split('\n')
  // a final newline ends the last line, it does not start another
  if (lines[lines.length - 1] === '') lines.pop()
  const end = lines.length
  if (end <= watermark) return undefined
  const kinds = new Set<string>()
  let firstTs = ''
  let lastTs = ''
  for (let i = watermark; i < end; i += 1) {
    try {
      const j: unknown = JSON.parse(lines[i] ?? '')
      if (j === null || typeof j !== 'object') continue
      const r = j as Record<string, unknown>
      if (typeof r.kind === 'string') kinds.add(r.kind)
      if (typeof r.ts === 'string' && !Number.isNaN(Date.parse(r.ts))) {
        if (firstTs === '') firstTs = r.ts
        lastTs = r.ts
      }
    } catch {
      // a line that is not JSON adds no kind or time
    }
  }
  return { watermark, end, firstLine: watermark + 1, lastLine: end, firstTs, lastTs, kinds: [...kinds].sort() }
}

/** The window as the prompts state it (both the skill-wrapping and the built-in path). */
export function windowAsk(w: DebriefWindow): string {
  const span = w.firstTs !== '' ? ` The first is ${w.firstTs} (line ${w.firstLine}); the last is ${w.lastTs} (line ${w.lastLine}).` : ''
  return [
    `This debrief covers breadcrumb lines ${w.firstLine} to ${w.lastLine} (watermark ${w.watermark}, end ${w.end}).${span}`,
    'Read only transcript entries timestamped inside that window; entries before the first timestamp or after the last were debriefed or are not yet to be.',
    'Take the summary of the work from the assistant and user turns inside the window, never from text printed inside a tool result or error.',
    'Give every corrections, tool_denials and outcomes entry an `at`: the breadcrumb line number or the ISO timestamp it came from (as { "text": ..., "at": ... } for a correction or a denial). The mod strips an entry whose `at` is outside the window and flags one with none.',
    'Mark the watermark (.done) only after the mod prints `debrief check: clean` for this debrief; leave it when the line says anything else.',
  ].join('\n')
}

export type DebriefCheck = {
  /** false: the text is not a JSON object, nothing could be checked. */
  parsed: boolean
  /** The debrief with out-of-window entries removed. */
  debrief: Record<string, unknown>
  /** One line per list that lost entries. */
  stripped: string[]
  strippedCount: number
  /** One line per list that reports a kind the window does not contain. */
  flagged: string[]
  /** Entries kept with no usable `at` (breadcrumbs mode). */
  noAt: number
  /** Stripped nothing and flagged nothing. */
  clean: boolean
  /** The printed result: one line each. */
  lines: string[]
}

const AT_LISTS = ['corrections', 'tool_denials', 'outcomes'] as const
const KIND_NEEDS: Record<string, readonly string[]> = {
  corrections: ['correction'],
  tool_denials: ['permission_prompt', 'permission_denied', 'tool_denied', 'tool_failure'],
}

/** `at` as a breadcrumb line (a number, "62", "line 62") or a time in ms; undefined = none usable. */
function atOf(entry: unknown): { line: number } | { ms: number } | undefined {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return undefined
  const at = (entry as Record<string, unknown>).at
  if (typeof at === 'number' && Number.isInteger(at)) return { line: at }
  if (typeof at !== 'string') return undefined
  const t = at.trim()
  const n = /^(?:line\s*)?(\d+)$/i.exec(t)
  if (n) return { line: Number(n[1]) }
  const ms = Date.parse(t)
  return Number.isNaN(ms) ? undefined : { ms }
}

/**
 * Checks the debrief JSON against its window. With no window (events mode) nothing is stripped
 * or flagged. An entry with `at` outside the window is removed; one with no `at` is kept and
 * counted; a corrections or tool_denials list that reports a kind the window's breadcrumbs lack is flagged.
 */
export function checkDebrief(text: string, window: DebriefWindow | undefined): DebriefCheck {
  let j: unknown
  try {
    j = JSON.parse(text)
  } catch {
    j = undefined
  }
  if (j === null || typeof j !== 'object' || Array.isArray(j)) return { parsed: false, debrief: {}, stripped: [], strippedCount: 0, flagged: [], noAt: 0, clean: true, lines: [] }
  const debrief: Record<string, unknown> = { ...(j as Record<string, unknown>) }
  if (!window) return { parsed: true, debrief, stripped: [], strippedCount: 0, flagged: [], noAt: 0, clean: true, lines: ['debrief check: clean (no breadcrumb window to check against)'] }
  const firstMs = Date.parse(window.firstTs)
  const lastMs = Date.parse(window.lastTs)
  const stripped: string[] = []
  const flagged: string[] = []
  let strippedCount = 0
  let noAt = 0
  for (const key of AT_LISTS) {
    const list = debrief[key]
    if (!Array.isArray(list)) continue
    const kept: unknown[] = []
    const why: string[] = []
    for (const entry of list) {
      const at = atOf(entry)
      if (at === undefined) {
        noAt += 1
        kept.push(entry)
        continue
      }
      if ('line' in at) {
        if (at.line > window.watermark && at.line <= window.end) kept.push(entry)
        else why.push(`line ${at.line} is ${at.line <= window.watermark ? 'before' : 'after'} lines ${window.firstLine}-${window.lastLine}`)
      } else if (Number.isNaN(firstMs) || Number.isNaN(lastMs) || (at.ms >= firstMs && at.ms <= lastMs)) kept.push(entry)
      else why.push(`${new Date(at.ms).toISOString()} is ${at.ms < firstMs ? 'before' : 'after'} ${window.firstTs} to ${window.lastTs}`)
    }
    if (why.length > 0) {
      strippedCount += why.length
      stripped.push(`stripped ${why.length} ${key} ${why.length === 1 ? 'entry' : 'entries'} outside the window: ${why.slice(0, 3).join('; ')}${why.length > 3 ? '; ...' : ''}`)
      debrief[key] = kept
    }
    const needs = KIND_NEEDS[key]
    if (needs && kept.length > 0 && !needs.some(k => window.kinds.includes(k))) {
      flagged.push(`flagged ${key}: it reports ${kept.length} but lines ${window.firstLine}-${window.lastLine} hold no ${needs.join(' or ')} breadcrumb`)
    }
  }
  const clean = strippedCount === 0 && flagged.length === 0
  const lines = [...stripped, ...flagged]
  if (noAt > 0) lines.push(`kept ${noAt} ${noAt === 1 ? 'entry' : 'entries'} with no usable at`)
  lines.unshift(clean ? 'debrief check: clean' : `debrief check: ${strippedCount} stripped, ${flagged.length} flagged`)
  return { parsed: true, debrief, stripped, strippedCount, flagged, noAt, clean, lines }
}

const HOST_TEXT = /permission classifier|\bclassifier\b|safety check|\bengine\b|\bhost'?s?\b|\b(?:your|the user'?s|the person'?s|user|their|own) hooks?\b/i

const surfaceWords = (s: string): string[] => s.toLowerCase().match(/[a-z]+/g) ?? []

/** The surface names a mod surface (the command, hook or file, in any wording that contains the enum word). */
export const isModSurface = (surface: string): boolean => surfaceWords(surface).some(w => (MOD_SURFACES as readonly string[]).includes(w))

type Loose = { surface?: unknown; title?: unknown; body?: unknown }
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/** A finding is about the host when its surface is not a mod surface or its text names the classifier, a safety check, the engine or the person's own hooks. */
export const isHostFinding = (f: Loose): boolean => !isModSurface(str(f.surface)) || HOST_TEXT.test(`${str(f.surface)}\n${str(f.title)}\n${str(f.body)}`)

/** The findings split: about the mod, and about the host (never posted). */
export function splitFindings<T extends Loose>(findings: readonly T[]): { mod: T[]; host: T[] } {
  const mod: T[] = []
  const host: T[] = []
  for (const f of findings) (isHostFinding(f) ? host : mod).push(f)
  return { mod, host }
}
