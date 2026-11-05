// MOD-300: a by-hand verify of an existing head is the brain judging work already there; it spends no attempt of budget=. Pure.
import { test, expect, describe } from './kit.mjs'

const A = () => import('../../hooks/lib/attempts.ts')
const rec = (over = {}) => ({ task: 'T-1', subtask: 'main', attempt: 1, kind: 'spawn', lineage: 1, tier: 'standard', alias: 'sonnet', verdict: 'refuted', at: 1, ...over })

describe('MOD-300: budgetCount and verify records', () => {
  test('a spawn and a verify count 1', async () => {
    const { budgetCount, attemptsFor } = await A()
    const records = [rec(), rec({ attempt: 2, kind: 'verify' })]
    expect(budgetCount(records, 'main')).toBe(1)
    expect(attemptsFor(records, 'main')).toHaveLength(2)
  })
  test('a spawn, a verify and a resume count 2', async () => {
    const { budgetCount } = await A()
    expect(budgetCount([rec(), rec({ attempt: 2, kind: 'verify' }), rec({ attempt: 3, kind: 'resume' })], 'main')).toBe(2)
  })
  test('a failed explore still does not count', async () => {
    const { budgetCount } = await A()
    expect(budgetCount([rec({ explore: true, exploreFrom: 'sonnet/medium' })], 'main')).toBe(0)
  })
  test('a rejudge verify (a verify record at the same sha) does not count', async () => {
    const { budgetCount } = await A()
    expect(budgetCount([rec({ sha: 'abc1234' }), rec({ attempt: 2, kind: 'verify', sha: 'abc1234', verdict: 'consistent' })], 'main')).toBe(1)
  })
  test('a verify record shows the counted number in the verdict row fraction', async () => {
    const { attemptFraction } = await import('../../hooks/lib/verify.ts')
    expect(attemptFraction({ attempt: 2, budget: 2, kind: 'verify', counted: 1 })).toBe('2 (verify, counted 1/2)')
    expect(attemptFraction({ attempt: 2, budget: 2, kind: 'resume', counted: 2 })).toBe('2/2')
    expect(attemptFraction({ attempt: 1, budget: 2 })).toBe('1/2')
  })
})
