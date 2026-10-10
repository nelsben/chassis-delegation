import { test, expect, describe } from 'claude-code/testing'
import { verifyTarget, retireDue, retirePatch, cardReadsMerged, RETIRE_EVERY_MS, type AttemptRecord } from '../hooks/lib/attempts'

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

describe('MOD-4: an owed row retires when the work is on the default branch', () => {
  const NOW = 1_000_000_000
  const SHA = '1234abcd'
  const card = (status: string) => `---\nid: T-1\ntitle: x\nstatus: ${status}\n---\n## Why\nstatus: merged in the body is not the card's status\n`
  test('a sha reported an ancestor of origin/main retires: retired merged', () => {
    expect(retirePatch({ ancestor: true }, NOW)).toMatchObject({ retired: 'merged', retireTriedAt: NOW })
  })
  test('a card that reads status: merged retires; any other status, and a body line, does not', () => {
    expect(cardReadsMerged(card('merged'))).toBe(true)
    expect(cardReadsMerged(card('queued'))).toBe(false)
    expect(cardReadsMerged('## Why\nstatus: merged\n')).toBe(false)
    expect(retirePatch({ ancestor: false, card: card('merged') }, NOW)).toMatchObject({ retired: 'merged' })
  })
  test('a fresh one stays: checked, not retired', () => {
    const p = retirePatch({ ancestor: false, card: card('queued') }, NOW)
    expect(p.retired).toBeUndefined()
    expect(p).toMatchObject({ retireTriedAt: NOW, retireCheckedAt: NOW })
  })
  test('a failed check leaves the row as it is: tried, not checked', () => {
    const p = retirePatch({}, NOW)
    expect(p.retired).toBeUndefined()
    expect(p.retireCheckedAt).toBeUndefined()
    expect(p.retireTriedAt).toBe(NOW)
  })
  test('the check runs at most once per 15 minutes per task, on the last attempt only', () => {
    const r = [rec(1, 'refuted', SHA)]
    expect(retireDue(r, 'main', NOW)).toBe(true)
    const tried = [{ ...rec(1, 'refuted', SHA), retireTriedAt: NOW }]
    expect(retireDue(tried, 'main', NOW + RETIRE_EVERY_MS - 1)).toBe(false)
    expect(retireDue(tried, 'main', NOW + RETIRE_EVERY_MS)).toBe(true)
    expect(retireDue([{ ...rec(1, 'refuted', SHA), retired: 'merged' as const }], 'main', NOW)).toBe(false)
    expect(retireDue([], 'main', NOW)).toBe(false)
  })
})
