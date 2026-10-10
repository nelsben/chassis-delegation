import { test, expect, describe } from 'claude-code/testing'
import { verifyTarget, type AttemptRecord } from '../hooks/lib/attempts'

const rec = (attempt: number, verdict: AttemptRecord['verdict'], sha?: string): AttemptRecord => ({
  task: 'T-1',
  subtask: 'main',
  attempt,
  kind: 'spawn',
  lineage: 1,
  tier: 'standard',
  alias: 'sonnet',
  verdict,
  at: attempt,
  ...(sha ? { sha } : {}),
})

describe('MOD-1: which attempt a --verify judges', () => {
  const X = '1234abcd'
  test('the last attempt, judged at sha X, is re-judged at X: same attempt, rejudge true', () => {
    expect(verifyTarget([rec(1, 'refuted', X)], 'main', X)).toEqual({ attempt: 1, rejudge: true })
    expect(verifyTarget([rec(1, 'refuted', 'ffff000'), rec(2, 'verified', X)], 'main', X.slice(0, 7))).toEqual({ attempt: 2, rejudge: true })
    for (const v of ['verified', 'unverified', 'refuted', 'no-report', 'refused', 'over-spend'] as const) expect(verifyTarget([rec(1, v, X)], 'main', X).rejudge).toBe(true)
  })
  test('a sha no attempt recorded opens the next attempt, rejudge false', () => {
    expect(verifyTarget([rec(1, 'refuted', X)], 'main', 'abcdef1')).toEqual({ attempt: 2, rejudge: false })
    expect(verifyTarget([], 'main', X)).toEqual({ attempt: 1, rejudge: false })
  })
  test('a pending last attempt is not re-judged', () => {
    expect(verifyTarget([rec(1, 'pending', X)], 'main', X)).toEqual({ attempt: 2, rejudge: false })
  })
  test('a work-present last record is the attempt, as before', () => {
    expect(verifyTarget([rec(1, 'no-report'), rec(2, 'work-present', X)], 'main', X)).toEqual({ attempt: 2, rejudge: false })
    expect(verifyTarget([rec(1, 'no-report'), rec(2, 'work-present', X)], 'main', 'abcdef1')).toEqual({ attempt: 2, rejudge: false })
  })
})
