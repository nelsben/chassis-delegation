// Part 4C: the dashboard's per-session numbers, `delegation.metrics.<sessionId>`
// in the store, updated by the hooks that already handle each event, and the
// six series the pane's sparklines draw over the last 14 sessions. Pure: no `$`.
import { RETIRED_VERDICT, readVerdict } from './attempts'
import { aliasOf } from './tier'

type ByAlias = { haiku: number; sonnet: number; opus: number }

export type Metrics = {
  /** ms since the epoch when this session first counted anything. */
  firstSeen: number
  /** Dispatches made through the `dispatch` tool or `/dispatch` (spawned or queued). */
  dispatches: number
  verdicts: { consistent: number; unverified: number; refuted: number; falseRefuted: number }
  /** Briefed spawns by alias. */
  spawns: ByAlias
  escalations: { resume: number; respawn: number }
  /** Background debriefs started. */
  debriefs: number
  evals: { run: number; failed: number }
  /** `session.compact` hooks served (the state block attached). */
  compactions: number
  /** Dollars the briefed workers spent (3B), summed as their turns complete. */
  usd: number
  /** Consistent verdicts by alias: which tiers proved enough (the Tiers sparkline). */
  consistentBy: ByAlias
}

export const emptyMetrics = (firstSeen: number): Metrics => ({
  firstSeen,
  dispatches: 0,
  verdicts: { consistent: 0, unverified: 0, refuted: 0, falseRefuted: 0 },
  spawns: { haiku: 0, sonnet: 0, opus: 0 },
  escalations: { resume: 0, respawn: 0 },
  debriefs: 0,
  evals: { run: 0, failed: 0 },
  compactions: 0,
  usd: 0,
  consistentBy: { haiku: 0, sonnet: 0, opus: 0 },
})

export type MetricEvent =
  | { kind: 'dispatch' }
  | { kind: 'spawn'; alias: string; respawn?: boolean }
  | { kind: 'resume' }
  | { kind: 'verdict'; verdict: string; alias: string; falseRefute?: boolean }
  | { kind: 'debrief' }
  | { kind: 'eval' }
  | { kind: 'eval-failed' }
  | { kind: 'compaction' }
  | { kind: 'usd'; usd: number }

const tierKey = (alias: string): keyof ByAlias | undefined => {
  const a = aliasOf(alias)
  return a === 'haiku' || a === 'sonnet' || a === 'opus' ? a : undefined
}

/** A metrics object written before the rename (MOD-19): its retired-word counts fold into `consistent`; an object already in the new shape is returned as it was. */
function foldRetired(stored: unknown): unknown {
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return stored
  const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
  const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  const BY = `${RETIRED_VERDICT}By`
  const out: Record<string, unknown> = { ...(stored as Record<string, unknown>) }
  const verdicts = out.verdicts
  if (isRecord(verdicts) && RETIRED_VERDICT in verdicts) {
    const { [RETIRED_VERDICT]: old, ...rest } = verdicts
    out.verdicts = { ...rest, consistent: count(rest.consistent) + count(old) }
  }
  const by = out[BY]
  if (by !== undefined) {
    delete out[BY]
    if (isRecord(by)) {
      const now: Record<string, unknown> = isRecord(out.consistentBy) ? out.consistentBy : {}
      const merged: Record<string, number> = {}
      for (const k of new Set([...Object.keys(by), ...Object.keys(now)])) merged[k] = count(now[k]) + count(by[k])
      out.consistentBy = merged
    }
  }
  return out
}

/**
 * A stored object read back whole: fields an older release did not write start
 * at zero, and one written before the rename (MOD-19, see foldRetired) folds
 * its counts into `consistent`.
 */
export function fillMetrics(stored: Partial<Metrics> | undefined, now: number): Metrics {
  const m = foldRetired(stored) as Partial<Metrics> | undefined
  const base = emptyMetrics(m?.firstSeen ?? now)
  if (!m) return base
  return {
    ...base,
    ...m,
    verdicts: { ...base.verdicts, ...m.verdicts },
    spawns: { ...base.spawns, ...m.spawns },
    escalations: { ...base.escalations, ...m.escalations },
    evals: { ...base.evals, ...m.evals },
    consistentBy: { ...base.consistentBy, ...m.consistentBy },
  }
}

/** One event applied to the session's metrics (created at `now` when absent). */
export function applyMetric(prev: Partial<Metrics> | undefined, ev: MetricEvent, now: number): Metrics {
  const m = fillMetrics(prev, now)
  switch (ev.kind) {
    case 'dispatch':
      return { ...m, dispatches: m.dispatches + 1 }
    case 'spawn': {
      const k = tierKey(ev.alias)
      const spawns = k ? { ...m.spawns, [k]: m.spawns[k] + 1 } : m.spawns
      const escalations = ev.respawn ? { ...m.escalations, respawn: m.escalations.respawn + 1 } : m.escalations
      return { ...m, spawns, escalations }
    }
    case 'resume':
      return { ...m, escalations: { ...m.escalations, resume: m.escalations.resume + 1 } }
    case 'verdict': {
      const word = readVerdict(ev.verdict)
      if (word !== 'consistent' && word !== 'unverified' && word !== 'refuted') return m
      const verdicts = { ...m.verdicts, [word]: m.verdicts[word] + 1, falseRefuted: m.verdicts.falseRefuted + (ev.falseRefute ? 1 : 0) }
      const k = tierKey(ev.alias)
      const consistentBy = word === 'consistent' && k ? { ...m.consistentBy, [k]: m.consistentBy[k] + 1 } : m.consistentBy
      return { ...m, verdicts, consistentBy }
    }
    case 'debrief':
      return { ...m, debriefs: m.debriefs + 1 }
    case 'eval':
      return { ...m, evals: { ...m.evals, run: m.evals.run + 1 } }
    case 'eval-failed':
      return { ...m, evals: { ...m.evals, failed: m.evals.failed + 1 } }
    case 'compaction':
      return { ...m, compactions: m.compactions + 1 }
    case 'usd':
      return Number.isFinite(ev.usd) && ev.usd > 0 ? { ...m, usd: Math.round((m.usd + ev.usd) * 1e6) / 1e6 } : m
  }
}

/**
 * A refute that was false: a refuted attempt whose task later came back consistent at
 * the SAME report sha (the code did not change; a resume or a re-verify by
 * hand), or consistent because an amend made the difference.
 */
export function isFalseRefute(prev: { verdict: string; reportSha?: string } | undefined, cur: { verdict: string; reportSha?: string; amended: boolean }): boolean {
  if (!prev || prev.verdict !== 'refuted' || cur.verdict !== 'consistent') return false
  if (cur.amended) return true
  return prev.reportSha !== undefined && prev.reportSha !== '' && prev.reportSha === cur.reportSha
}

/** `delegation.metricsIndex`: every session the metrics have counted, oldest first. */
export type SessionIndex = { id: string; firstSeen: number }[]

const INDEX_CAP = 200

/** Notes a session once, in first-seen order (the oldest dropped past the cap). */
export function noteSession(idx: SessionIndex, id: string, firstSeen: number): SessionIndex {
  if (idx.some(s => s.id === id)) return idx
  return [...idx, { id, firstSeen }].sort((a, b) => a.firstSeen - b.firstSeen).slice(-INDEX_CAP)
}

export const SPARK_SESSIONS = 14

/** The ids of the last 14 sessions by first-seen time, oldest first. */
export const lastSessions = (idx: SessionIndex, n = SPARK_SESSIONS): string[] =>
  [...idx].sort((a, b) => a.firstSeen - b.firstSeen).slice(-n).map(s => s.id)

const CHEAP_FIRST: (keyof ByAlias)[] = ['haiku', 'sonnet', 'opus']

/**
 * The six blocks' series, one value per session (`null` where the session
 * has nothing to measure, so the line does not read a zero into it).
 *
 * Tiers: the share of the session's briefed spawns that went to the cheapest
 * tier any of its verdicts were consistent on (all spawns on sonnet, sonnet
 * consistent: 1; half on opus while sonnet was consistent: 0.5).
 */
export const SERIES: readonly { key: string; value: (m: Metrics) => number | null }[] = [
  { key: 'steps', value: m => m.dispatches },
  {
    key: 'verdicts',
    value: m => {
      const total = m.verdicts.consistent + m.verdicts.unverified + m.verdicts.refuted
      return total > 0 ? m.verdicts.refuted / total : null
    },
  },
  {
    key: 'tiers',
    value: m => {
      const cheapest = CHEAP_FIRST.find(k => m.consistentBy[k] > 0)
      const total = m.spawns.haiku + m.spawns.sonnet + m.spawns.opus
      return cheapest && total > 0 ? m.spawns[cheapest] / total : null
    },
  },
  { key: 'owed', value: m => m.debriefs + m.evals.run },
  { key: 'compaction', value: m => m.compactions },
  { key: 'spend', value: m => m.usd },
]

/**
 * GH-112: this session's numbers read from its attempt records (the dashboard's
 * "Across sessions" blocks draw the current session from what the store holds).
 */
export function metricsFromRecords(
  records: readonly { task: string; subtask: string; alias: string; kind: string; verdict: string; usd?: number }[],
  firstSeen: number,
): Metrics {
  const m = emptyMetrics(firstSeen)
  m.dispatches = new Set(records.map(r => `${r.task}/${r.subtask}`)).size
  for (const r of records) {
    const a = tierKey(r.alias)
    if (r.kind === 'spawn' && a) m.spawns[a] += 1
    if (r.kind === 'resume') m.escalations.resume += 1
    m.usd += r.usd ?? 0
    if (r.verdict === 'consistent') {
      m.verdicts.consistent += 1
      if (a) m.consistentBy[a] += 1
    } else if (r.verdict === 'unverified') m.verdicts.unverified += 1
    else if (r.verdict === 'refuted') m.verdicts.refuted += 1
  }
  return m
}
