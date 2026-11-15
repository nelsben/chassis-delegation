// MOD-380: a hand-back with a report after a no-report on the same attempt, from the same worker, is judged on that attempt.
import { test, expect, describe } from './kit.mjs'

const V = () => import('../../hooks/lib/verdicttool.ts')

const noReport = { verdict: 'no-report', agentId: 'agent-4', attempt: 1 }

describe('MOD-380: reopensAfterNoReport', () => {
  test('a no-report row of this worker and attempt, then a report with a sha: reopens the attempt', async () => {
    const { reopensAfterNoReport } = await V()
    expect(reopensAfterNoReport(noReport, 1, 'agent-4', 'cafe123')).toBe(true)
  })

  test('false when the last verdict is refuted', async () => {
    const { reopensAfterNoReport } = await V()
    expect(reopensAfterNoReport({ ...noReport, verdict: 'refuted' }, 1, 'agent-4', 'cafe123')).toBe(false)
  })

  test('false when the last record already has a sha (a by-hand re-judge)', async () => {
    const { reopensAfterNoReport } = await V()
    expect(reopensAfterNoReport({ ...noReport, sha: 'cafe123' }, 1, 'agent-4', 'cafe123')).toBe(false)
  })

  test('false when the agent differs', async () => {
    const { reopensAfterNoReport } = await V()
    expect(reopensAfterNoReport(noReport, 1, 'agent-9', 'cafe123')).toBe(false)
  })

  test('false when the attempt differs', async () => {
    const { reopensAfterNoReport } = await V()
    expect(reopensAfterNoReport(noReport, 2, 'agent-4', 'cafe123')).toBe(false)
  })

  test('false when the report has no sha', async () => {
    const { reopensAfterNoReport } = await V()
    expect(reopensAfterNoReport(noReport, 1, 'agent-4', undefined)).toBe(false)
    expect(reopensAfterNoReport(noReport, 1, 'agent-4', '')).toBe(false)
  })

  test('false when there is no last record', async () => {
    const { reopensAfterNoReport } = await V()
    expect(reopensAfterNoReport(undefined, 1, 'agent-4', 'cafe123')).toBe(false)
  })
})
