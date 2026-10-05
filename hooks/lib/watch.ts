// Alias drift, new agent types, model probes and the status line. Pure: no `$`.

export const STATUS_IDLE_MS = 10 * 60 * 1000

/** A toast line when an alias now resolves to a different id; undefined for a first sighting or no change. */
export function driftMessage(alias: string, previous: string | undefined, now: string): string | undefined {
  if (!previous || previous === now || !/^claude-/.test(now)) return undefined
  return `${alias} now resolves to ${now} (was ${previous})`
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
