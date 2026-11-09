// MOD-342: the brain's running total stamped on a judged or merged ledger row. Pure.
import { test, expect, describe } from './kit.mjs'

const B = () => import('../../hooks/lib/brain.ts')
const turn = { model: 'claude-fable-5-1', input_tokens: 100_000, output_tokens: 10_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

describe('MOD-342: brainStamp', () => {
  test('no record, or a record with no turn, is no stamp', async () => {
    const { brainStamp, emptyBrain } = await B()
    expect(brainStamp(undefined, 5)).toBe(undefined)
    expect(brainStamp(emptyBrain(), 5)).toBe(undefined)
  })
  test('one priced turn gives the record usd, one turn, no edits', async () => {
    const { brainStamp, brainTurn } = await B()
    const rec = brainTurn(undefined, turn)
    expect(rec.usd).toBeGreaterThan(0)
    expect(brainStamp(rec, 5)).toEqual({ since: 5, usd: rec.usd, turns: 1, edits: 0 })
  })
  test('usd is rounded to four places', async () => {
    const { brainStamp, emptyBrain } = await B()
    expect(brainStamp({ ...emptyBrain(), usd: 1.234567, turns: 3, edits: 2 }, 9)).toEqual({ since: 9, usd: 1.2346, turns: 3, edits: 2 })
  })
  test('a since that is not a finite number is 0', async () => {
    const { brainStamp, emptyBrain } = await B()
    expect(brainStamp({ ...emptyBrain(), turns: 1 }, NaN)?.since).toBe(0)
  })
  test('the keys are exactly since, usd, turns, edits', async () => {
    const { brainStamp, brainTurn } = await B()
    expect(Object.keys(brainStamp(brainTurn(undefined, turn), 5) ?? {}).sort()).toEqual(['edits', 'since', 'turns', 'usd'])
  })
})
