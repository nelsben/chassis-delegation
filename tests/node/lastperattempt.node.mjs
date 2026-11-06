// MOD-325: a re-verify of the same attempt is one attempt's spend, not two: lastPerAttempt keeps one row per (kind, subtask, attempt).
import { test, expect, describe } from './kit.mjs'

const row = (over) => ({ task: 'T', kind: 'spawn', attempt: 1, verdict: 'consistent', effort: 'medium', alias: 'sonnet', usd: 1.46, ...over })

describe('MOD-325: lastPerAttempt - one row per kind, subtask and attempt', () => {
  test('an earlier row with the same kind, subtask and attempt is dropped for the later one', async () => {
    const { lastPerAttempt } = await import('../../hooks/lib/choice.ts')
    const a = row({ verdict: 'refuted' })
    const b = row({ verdict: 'consistent' })
    expect(lastPerAttempt([a, b])).toEqual([b])
  })

  test('subtask absent reads as main: a missing subtask and an explicit main are one attempt', async () => {
    const { lastPerAttempt } = await import('../../hooks/lib/choice.ts')
    const a = row({ verdict: 'refuted' })
    const b = row({ verdict: 'consistent', subtask: 'main' })
    expect(lastPerAttempt([a, b])).toEqual([b])
  })

  test('kept rows are in the order of their last appearance', async () => {
    const { lastPerAttempt } = await import('../../hooks/lib/choice.ts')
    const a1 = row({ attempt: 1, verdict: 'refuted' })
    const b2 = row({ attempt: 2, verdict: 'refuted' })
    const a1again = row({ attempt: 1, verdict: 'consistent' })
    expect(lastPerAttempt([a1, b2, a1again])).toEqual([b2, a1again])
  })

  test('rows without a numeric attempt are kept as they are', async () => {
    const { lastPerAttempt } = await import('../../hooks/lib/choice.ts')
    const x = row({ attempt: undefined, kind: 'review' })
    const y = row({ attempt: undefined, kind: 'review' })
    expect(lastPerAttempt([x, y])).toEqual([x, y])
  })
})

describe('MOD-325: cardOutcomes sums usd once per attempt', () => {
  test('a refuted spawn at attempt 1 and a later consistent spawn at attempt 1, 1.46 each: usd 1.46, not 2.92', async () => {
    const { cardOutcomes } = await import('../../hooks/lib/choice.ts')
    const rows = [row({ verdict: 'refuted' }), row({ verdict: 'consistent' })]
    const [c] = cardOutcomes(rows)
    expect(c.usd).toBeCloseTo(1.46)
    expect(c.confirmed).toBe(true)
  })

  test('attempts 1 and 2 each once: both summed', async () => {
    const { cardOutcomes } = await import('../../hooks/lib/choice.ts')
    const rows = [row({ attempt: 1, verdict: 'refuted' }), row({ attempt: 2, verdict: 'consistent' })]
    const [c] = cardOutcomes(rows)
    expect(c.usd).toBeCloseTo(2.92)
  })

  test('a review row and a spawn row on the same attempt: both kept', async () => {
    const { cardOutcomes } = await import('../../hooks/lib/choice.ts')
    const rows = [row({ verdict: 'consistent', usd: 1.46 }), row({ kind: 'review', verdict: 'consistent', usd: 0.5 })]
    const [c] = cardOutcomes(rows)
    expect(c.usd).toBeCloseTo(1.96)
  })

  test('a subtask a row and a subtask main row on the same attempt: both kept', async () => {
    const { cardOutcomes } = await import('../../hooks/lib/choice.ts')
    const rows = [row({ verdict: 'consistent', usd: 1.46 }), row({ verdict: 'consistent', subtask: 'a', usd: 0.5 })]
    const [c] = cardOutcomes(rows)
    expect(c.usd).toBeCloseTo(1.96)
  })
})
