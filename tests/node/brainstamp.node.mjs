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
    expect(brainStamp(rec, 5)).toEqual({ since: 5, usd: rec.usd, turns: 1, edits: 0, pair: 'fable/default', compactions: 0 })
  })
  test('usd is rounded to four places', async () => {
    const { brainStamp, emptyBrain } = await B()
    expect(brainStamp({ ...emptyBrain(), usd: 1.234567, turns: 3, edits: 2 }, 9)).toEqual({ since: 9, usd: 1.2346, turns: 3, edits: 2, compactions: 0 })
  })
  test('a since that is not a finite number is 0', async () => {
    const { brainStamp, emptyBrain } = await B()
    expect(brainStamp({ ...emptyBrain(), turns: 1 }, NaN)?.since).toBe(0)
  })
  test('the keys of a record from before MOD-344 are since, usd, turns, edits, compactions', async () => {
    const { brainStamp, emptyBrain } = await B()
    const old = { ...emptyBrain(), usd: 1, turns: 2, edits: 0 }
    const s = brainStamp(old, 5) ?? {}
    expect(Object.keys(s).sort()).toEqual(['compactions', 'edits', 'since', 'turns', 'usd'])
    expect(s.compactions).toBe(0)
    expect(s.pair).toBe(undefined)
    expect(s.window).toBe(undefined)
    expect(s.compactTokens).toBe(undefined)
  })
})

describe('MOD-344: brainPair', () => {
  test('family and effort, lower-cased and trimmed; default when none', async () => {
    const { brainPair } = await B()
    expect(brainPair('claude-opus-5-5', 'medium')).toBe('opus/medium')
    expect(brainPair('claude-fable-5-1', ' High ')).toBe('fable/high')
    expect(brainPair('claude-sonnet-5-5', undefined)).toBe('sonnet/default')
    expect(brainPair(undefined, 3)).toBe('other/3')
    expect(brainPair('claude-opus-5-5', '   ')).toBe('opus/default')
  })
})

describe('MOD-344: brainTurn by pair', () => {
  test('a turn with an effort adds its dollars and one turn to its pair', async () => {
    const { brainTurn } = await B()
    const rec = brainTurn(undefined, turn, 'medium')
    expect(rec.byPair).toEqual({ 'fable/medium': { usd: rec.usd, turns: 1 } })
  })
  test('two turns at two efforts: two keys, the usd is the sum of the pair dollars', async () => {
    const { brainTurn } = await B()
    const r1 = brainTurn(undefined, turn, 'medium')
    const r2 = brainTurn(r1, turn, 'high')
    expect(Object.keys(r2.byPair ?? {}).sort()).toEqual(['fable/high', 'fable/medium'])
    expect((r2.byPair ?? {})['fable/high']?.turns).toBe(1)
    const sum = Object.values(r2.byPair ?? {}).reduce((a, p) => a + p.usd, 0)
    expect(Math.abs(r2.usd - sum) < 1e-4).toBe(true)
  })
  test('two arguments: the pair is default', async () => {
    const { brainTurn } = await B()
    expect(Object.keys(brainTurn(undefined, turn).byPair ?? {})).toEqual(['fable/default'])
  })
})

describe('MOD-344: brainCompacted and brainWindow', () => {
  test('a compaction counts and records the tokens before it', async () => {
    const { brainCompacted, emptyBrain } = await B()
    const r1 = brainCompacted(undefined, 240000)
    expect(r1.compactions).toBe(1)
    expect(r1.compactTokens).toBe(240000)
    const r2 = brainCompacted(r1, undefined)
    expect(r2.compactions).toBe(2)
    expect(r2.compactTokens).toBe(240000)
    expect(brainCompacted(emptyBrain(), 0).compactTokens).toBe(undefined)
  })
  test('a window above 0 is set; 0 or NaN returns the record itself', async () => {
    const { brainWindow, emptyBrain } = await B()
    const r = emptyBrain()
    expect(brainWindow(r, 1000000).window).toBe(1000000)
    expect(brainWindow(r, 0)).toBe(r)
    expect(brainWindow(r, NaN)).toBe(r)
  })
})

describe('MOD-344: brainStamp pair, window, compactions', () => {
  test('the pair with the most dollars, with the window and the compactions', async () => {
    const { brainStamp, emptyBrain } = await B()
    const rec = {
      ...emptyBrain(),
      usd: 5,
      turns: 6,
      byPair: { 'opus/medium': { usd: 2, turns: 5 }, 'fable/low': { usd: 3, turns: 1 } },
      window: 1000000,
      compactions: 2,
      compactTokens: 240000,
    }
    expect(brainStamp(rec, 1)).toEqual({ since: 1, usd: 5, turns: 6, edits: 0, pair: 'fable/low', window: 1000000, compactions: 2, compactTokens: 240000 })
  })
  test('a tie in dollars goes to the pair with more turns', async () => {
    const { brainStamp, emptyBrain } = await B()
    const rec = { ...emptyBrain(), turns: 6, byPair: { 'opus/high': { usd: 1, turns: 1 }, 'sonnet/low': { usd: 1, turns: 5 } } }
    expect(brainStamp(rec, 1)?.pair).toBe('sonnet/low')
  })
})
