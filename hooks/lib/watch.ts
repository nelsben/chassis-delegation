// Alias drift, new agent types, model probes and the status line. Pure: no `$`.

export const STATUS_IDLE_MS = 10 * 60 * 1000

/** A toast line when an alias now resolves to a different id; undefined for a first sighting or no change. */
export function driftMessage(alias: string, previous: string | undefined, now: string): string | undefined {
  if (!previous || previous === now || !/^claude-/.test(now)) return undefined
  return `${alias} now resolves to ${now} (was ${previous})`
}

/** GH-114: what the store keeps per alias. `seen` is the last time a spawn resolved to `id`. */
export type AliasSighting = { id: string; since: number; seen?: number; previous?: { id: string; until: number } }

/** The stored value (the old plain id, or the record) as a sighting; a plain id has no known start. */
export function parseSighting(raw: unknown): AliasSighting | undefined {
  if (typeof raw === 'string') return raw ? { id: raw, since: 0 } : undefined
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  if (typeof r.id !== 'string' || !r.id) return undefined
  const prev = r.previous as Record<string, unknown> | undefined
  return {
    id: r.id,
    since: typeof r.since === 'number' ? r.since : 0,
    ...(typeof r.seen === 'number' ? { seen: r.seen } : {}),
    ...(prev && typeof prev.id === 'string' && typeof prev.until === 'number' ? { previous: { id: prev.id, until: prev.until } } : {}),
  }
}

/** The record after a spawn resolved `alias` to `id` at `now`: the same id keeps its start; a new id keeps the old one as `previous`. */
export function nextSighting(prev: unknown, id: string, now: number): AliasSighting {
  const old = parseSighting(prev)
  if (!old) return { id, since: now, seen: now }
  if (old.id === id) return { ...old, seen: now }
  return { id, since: now, seen: now, previous: { id: old.id, until: old.seen ?? old.since } }
}

const day = (ms: number): string => {
  const d = new Date(ms)
  return `${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}
const ALIAS_ORDER = ['haiku', 'sonnet', 'opus']
const ALIAS_TIER: Record<string, string> = { haiku: 'economy', sonnet: 'standard', opus: 'frontier' }
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/** `claude-haiku-5-5` → `Haiku 5.5`; an id it cannot read stays as it is. */
export function modelName(id: string): string {
  const m = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/.exec(id)
  if (!m) return id
  return `${m[1]![0]!.toUpperCase()}${m[1]!.slice(1)} ${m[2]}${m[3] ? `.${m[3]}` : ''}`
}

/**
 * GH-114: the `/delegation` lines for the aliases seen (alias → stored value):
 * one line of ids with when each moved, and, when an alias moved in the last
 * seven days, one line saying so.
 */
export function aliasLines(store: Record<string, unknown>, now: number): string[] {
  const seen = Object.keys(store)
    .sort((a, b) => (ALIAS_ORDER.indexOf(a) + 1 || 99) - (ALIAS_ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b))
    .flatMap(alias => {
      const s = parseSighting(store[alias])
      return s ? [{ alias, s }] : []
    })
  if (seen.length === 0) return []
  const part = ({ alias, s }: (typeof seen)[number]) =>
    `${alias} → ${s.id}${s.previous ? ` (since ${day(s.since)}; was ${s.previous.id} until ${day(s.previous.until)})` : ''}`
  const moved = seen.filter(({ s }) => s.previous && s.since > 0 && now - s.since < WEEK_MS)
  return [
    `aliases: ${seen.map(part).join(' · ')}`,
    ...moved.map(({ alias, s }) => `${alias} moved on ${day(s.since)}: ${ALIAS_TIER[alias] ?? alias} cards now run on ${modelName(s.id)}; re-run the ${ALIAS_TIER[alias] ?? alias} cases of tests/eval/classifier-cases.jsonl`),
  ]
}

/** Agent type names seen against the stored list: the first look seeds silently. */
export function newAgentTypes(known: readonly string[] | undefined, seen: readonly string[]): { added: string[]; next: string[]; seeded: boolean } {
  const unique = [...new Set(seen)]
  if (!known) return { added: [], next: unique, seeded: true }
  const added = unique.filter(name => !known.includes(name))
  return { added, next: [...known, ...added], seeded: false }
}

export const parseCandidateIds = (s: string | undefined): string[] =>
  (s ?? '').split(',').map(x => x.trim()).filter(Boolean)

export function statusText(s: { running: number; usd: number | undefined; pct: number | undefined }): string {
  const workers = `${s.running} worker${s.running === 1 ? '' : 's'}`
  const usd = s.usd === undefined ? '$–' : `$${s.usd.toFixed(2)}`
  const ctx = s.pct === undefined ? 'ctx –' : `ctx ${Math.round(s.pct)}%`
  return `${workers} · ${usd} · ${ctx}`
}

export const shouldClearStatus = (s: { running: number; now: number; lastCostChangeAt: number }): boolean =>
  s.running === 0 && s.now - s.lastCostChangeAt >= STATUS_IDLE_MS
