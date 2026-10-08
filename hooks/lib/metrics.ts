// Part 4C: the dashboard's per-session numbers, `delegation.metrics.<sessionId>`
// in the store, updated by the hooks that already handle each event, and the
// six series the pane's sparklines draw over the last 14 sessions. Pure: no `$`.
import { aliasOf } from './tier'

type ByAlias = { haiku: number; sonnet: number; opus: number }

export type Metrics = {
  /** ms since the epoch when this session first counted anything. */
  firstSeen: number
  /** Dispatches made through the `dispatch` tool or `/dispatch` (spawned or queued). */
  dispatches: number
  verdicts: { verified: number; unverified: number; refuted: number; falseRefuted: number }
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
  /** Verified verdicts by alias: which tiers proved enough (the Tiers sparkline). */
  verifiedBy: ByAlias
}

export const emptyMetrics = (firstSeen: number): Metrics => ({
  firstSeen,
  dispatches: 0,
  verdicts: { verified: 0, unverified: 0, refuted: 0, falseRefuted: 0 },
  spawns: { haiku: 0, sonnet: 0, opus: 0 },
  escalations: { resume: 0, respawn: 0 },
  debriefs: 0,
  evals: { run: 0, failed: 0 },
  compactions: 0,
  usd: 0,
  verifiedBy: { haiku: 0, sonnet: 0, opus: 0 },
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

/** A stored object read back whole: fields an older release did not write start at zero. */
export function fillMetrics(m: Partial<Metrics> | undefined, now: number): Metrics {
  const base = emptyMetrics(m?.firstSeen ?? now)
  if (!m) return base
  return {
    ...base,
    ...m,
    verdicts: { ...base.verdicts, ...m.verdicts },
    spawns: { ...base.spawns, ...m.spawns },
    escalations: { ...base.escalations, ...m.escalations },
    evals: { ...base.evals, ...m.evals },
    verifiedBy: { ...base.verifiedBy, ...m.verifiedBy },
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
      if (ev.verdict !== 'verified' && ev.verdict !== 'unverified' && ev.verdict !== 'refuted') return m
      const verdicts = { ...m.verdicts, [ev.verdict]: m.verdicts[ev.verdict] + 1, falseRefuted: m.verdicts.falseRefuted + (ev.falseRefute ? 1 : 0) }
      const k = tierKey(ev.alias)
      const verifiedBy = ev.verdict === 'verified' && k ? { ...m.verifiedBy, [k]: m.verifiedBy[k] + 1 } : m.verifiedBy
      return { ...m, verdicts, verifiedBy }
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
 * A refute that was false: a refuted attempt whose task later verified at
 * the SAME report sha (the code did not change; a resume or a re-verify by
 * hand), or verified because an amend made the difference.
 */
export function isFalseRefute(prev: { verdict: string; reportSha?: string } | undefined, cur: { verdict: string; reportSha?: string; amended: boolean }): boolean {
  if (!prev || prev.verdict !== 'refuted' || cur.verdict !== 'verified') return false
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
 * tier any of its verdicts verified on (all spawns on sonnet, sonnet verified:
 * 1; half on opus while sonnet verified: 0.5).
 */
export const SERIES: readonly { key: string; value: (m: Metrics) => number | null }[] = [
  { key: 'steps', value: m => m.dispatches },
  {
    key: 'verdicts',
    value: m => {
      const total = m.verdicts.verified + m.verdicts.unverified + m.verdicts.refuted
      return total > 0 ? m.verdicts.refuted / total : null
    },
  },
  {
    key: 'tiers',
    value: m => {
      const cheapest = CHEAP_FIRST.find(k => m.verifiedBy[k] > 0)
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
    if (r.verdict === 'verified') {
      m.verdicts.verified += 1
      if (a) m.verifiedBy[a] += 1
    } else if (r.verdict === 'unverified') m.verdicts.unverified += 1
    else if (r.verdict === 'refuted') m.verdicts.refuted += 1
  }
  return m
}
