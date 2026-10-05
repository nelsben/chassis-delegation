// 3B: honest per-worker cost, from each turn's usage (pure).
import { test, expect, describe } from 'claude-code/testing'
import { addTurn, priceFor, usdOf, usdText, PRICES, tokensOf, type Spend } from '../hooks/lib/cost'

const turn = (model: string, input: number, output: number, read = 0, write = 0) => ({
  model,
  input_tokens: input,
  output_tokens: output,
  cache_read_input_tokens: read,
  cache_creation_input_tokens: write,
})

describe('3B: the price table', () => {
  test('per MTok in/out, matched by model id prefix, longest first', () => {
    const lengths = PRICES.map(([p]) => p.length)
    expect(lengths).toEqual([...lengths].sort((a, b) => b - a))
    expect(PRICES.map(([p]) => p).sort()).toEqual(['haiku-4-5', 'opus-5', 'opus-5-5', 'sonnet-5', 'sonnet-5-5'])
    expect(priceFor('claude-opus-5-5')).toEqual({ in: 4, out: 20 })
    expect(priceFor('claude-opus-5')).toEqual({ in: 5, out: 25 })
    expect(priceFor('claude-opus-5-20260101')).toEqual({ in: 5, out: 25 })
    expect(priceFor('claude-sonnet-5-5')).toEqual({ in: 2, out: 10 })
    expect(priceFor('claude-sonnet-5-5[1m]')).toEqual({ in: 2, out: 10 })
    expect(priceFor('claude-sonnet-5')).toEqual({ in: 3, out: 15 })
    expect(priceFor('claude-haiku-4-5')).toEqual({ in: 1, out: 5 })
    expect(priceFor('us.anthropic.claude-haiku-4-5-v1:0')).toEqual({ in: 1, out: 5 })
    expect(priceFor('claude-fable-1')).toBeUndefined()
    expect(priceFor(undefined)).toBeUndefined()
  })
  test('cache read is 10% of the input price, cache write 125%', () => {
    // 1M each at sonnet-5-5: 2 + 10 + 0.2 + 2.5
    expect(Math.round(usdOf({ in: 1e6, out: 1e6, cacheRead: 1e6, cacheWrite: 1e6 }, { in: 2, out: 10 }) * 1e6) / 1e6).toBe(14.7)
  })
  test('a TurnUsage reads as the four counts', () => {
    expect(tokensOf(turn('m', 1, 2, 3, 4))).toEqual({ in: 1, out: 2, cacheRead: 3, cacheWrite: 4 })
  })
})

describe('3B: a worker cost is the sum of its turns', () => {
  test('three turn.complete usages on sonnet-5-5 sum to the expected dollars', () => {
    let s: Spend | undefined
    s = addTurn(s, turn('claude-sonnet-5-5', 100_000, 10_000, 500_000, 20_000))
    s = addTurn(s, turn('claude-sonnet-5-5', 50_000, 5_000, 800_000, 0))
    s = addTurn(s, turn('claude-sonnet-5-5', 10_000, 2_000, 900_000, 20_000))
    // in 160k*2 = 0.32; out 17k*10 = 0.17; read 2.2M*0.2 = 0.44; write 40k*2.5 = 0.10
    expect(s.tokens).toEqual({ in: 160_000, out: 17_000, cacheRead: 2_200_000, cacheWrite: 40_000 })
    expect(Math.round((s.usd ?? 0) * 1e6) / 1e6).toBe(1.03)
    expect(s.turns).toBe(3)
    expect(s.models).toEqual(['claude-sonnet-5-5'])
    expect(usdText(s)).toBe('$1.03')
  })
  test('an unknown model leaves tokens only: usd=?', () => {
    let s = addTurn(undefined, turn('claude-sonnet-5-5', 1000, 1000))
    s = addTurn(s, turn('claude-mystery-9', 1000, 1000))
    expect(s.usd).toBeNull()
    expect(s.tokens).toEqual({ in: 2000, out: 2000, cacheRead: 0, cacheWrite: 0 })
    expect(usdText(s)).toBe('$?')
    expect(usdText(undefined)).toBe('$–')
  })
})
