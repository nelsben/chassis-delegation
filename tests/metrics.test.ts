// 4C: per-session metrics bookkeeping and the sparkline series (pure).
import { test, expect, describe } from 'claude-code/testing'
import {
  applyMetric,
  emptyMetrics,
  isFalseRefute,
  lastSessions,
  noteSession,
  SERIES,
  type Metrics,
} from '../hooks/lib/metrics'

const T0 = 1_000_000

describe('4C: one session metrics object', () => {
  test('starts empty with its first-seen time', () => {
    expect(emptyMetrics(T0)).toEqual({
      firstSeen: T0,
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
  })
  test('each event increments its counter, nothing else', () => {
    let m: Metrics | undefined
    m = applyMetric(m, { kind: 'dispatch' }, T0)
    m = applyMetric(m, { kind: 'spawn', alias: 'sonnet' }, T0 + 1)
    m = applyMetric(m, { kind: 'spawn', alias: 'opus', respawn: true }, T0 + 2)
    m = applyMetric(m, { kind: 'spawn', alias: 'claude-haiku-4-5' }, T0 + 3)
    m = applyMetric(m, { kind: 'resume' }, T0)
    m = applyMetric(m, { kind: 'verdict', verdict: 'refuted', alias: 'sonnet' }, T0)
    m = applyMetric(m, { kind: 'verdict', verdict: 'verified', alias: 'sonnet', falseRefute: true }, T0)
    m = applyMetric(m, { kind: 'verdict', verdict: 'unverified', alias: 'opus' }, T0)
    m = applyMetric(m, { kind: 'verdict', verdict: 'no-report', alias: 'opus' }, T0)
    m = applyMetric(m, { kind: 'debrief' }, T0)
    m = applyMetric(m, { kind: 'eval' }, T0)
    m = applyMetric(m, { kind: 'eval-failed' }, T0)
    m = applyMetric(m, { kind: 'compaction' }, T0)
    m = applyMetric(m, { kind: 'usd', usd: 0.25 }, T0)
    m = applyMetric(m, { kind: 'usd', usd: 1.5 }, T0)
    expect(m).toEqual({
      firstSeen: T0,
      dispatches: 1,
      verdicts: { verified: 1, unverified: 1, refuted: 1, falseRefuted: 1 },
      spawns: { haiku: 1, sonnet: 1, opus: 1 },
      escalations: { resume: 1, respawn: 1 },
      debriefs: 1,
      evals: { run: 1, failed: 1 },
      compactions: 1,
      usd: 1.75,
      verifiedBy: { haiku: 0, sonnet: 1, opus: 0 },
    })
  })
  test('a refute is false when the same sha later verifies, or an amend made the difference', () => {
    expect(isFalseRefute({ verdict: 'refuted', reportSha: 'abc1234' }, { verdict: 'verified', reportSha: 'abc1234', amended: false })).toBe(true)
    expect(isFalseRefute({ verdict: 'refuted', reportSha: 'abc1234' }, { verdict: 'verified', reportSha: 'def5678', amended: true })).toBe(true)
    expect(isFalseRefute({ verdict: 'refuted', reportSha: 'abc1234' }, { verdict: 'verified', reportSha: 'def5678', amended: false })).toBe(false)
    expect(isFalseRefute({ verdict: 'verified', reportSha: 'abc1234' }, { verdict: 'verified', reportSha: 'abc1234', amended: false })).toBe(false)
    expect(isFalseRefute(undefined, { verdict: 'verified', reportSha: 'abc1234', amended: true })).toBe(false)
    expect(isFalseRefute({ verdict: 'refuted' }, { verdict: 'verified', amended: false })).toBe(false)
  })
})

describe('4C: the session index and the last 14 sessions', () => {
  test('a session is noted once, ordered by first-seen time', () => {
    let idx = noteSession([], 'b', 20)
    idx = noteSession(idx, 'a', 10)
    idx = noteSession(idx, 'b', 99)
    expect(idx).toEqual([{ id: 'a', firstSeen: 10 }, { id: 'b', firstSeen: 20 }])
  })
  test('the last 14 by first-seen, oldest first', () => {
    let idx: { id: string; firstSeen: number }[] = []
    for (let i = 0; i < 20; i++) idx = noteSession(idx, `s${i}`, i)
    const last = lastSessions(idx)
    expect(last).toHaveLength(14)
    expect(last[0]).toBe('s6')
    expect(last.at(-1)).toBe('s19')
  })
})

describe('4B: the six sparkline series', () => {
  const m = (over: Partial<Metrics>): Metrics => ({ ...emptyMetrics(T0), ...over })
  test('dispatches, refuted share, cheapest verified tier share, owed work, compactions, dollars', () => {
    const a = m({ dispatches: 3, verdicts: { verified: 3, unverified: 0, refuted: 1, falseRefuted: 0 }, spawns: { haiku: 0, sonnet: 4, opus: 2 }, verifiedBy: { haiku: 0, sonnet: 2, opus: 1 }, debriefs: 1, evals: { run: 2, failed: 1 }, compactions: 2, usd: 4.5 })
    const empty = m({})
    expect(SERIES.map(s => s.key)).toEqual(['steps', 'verdicts', 'tiers', 'owed', 'compaction', 'spend'])
    const values = (x: Metrics) => SERIES.map(s => s.value(x))
    expect(values(a)).toEqual([3, 0.25, 4 / 6, 3, 2, 4.5])
    // no verdict, no verified spawn: no share at all (not a zero)
    expect(values(empty)).toEqual([0, null, null, 0, 0, 0])
  })
})
