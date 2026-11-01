// MOD-246: the adaptive wait step, pure: 5 s to 30 s, 15 s to 2 minutes, then 30 s.
import { test, expect, describe } from './kit.mjs'

const V = () => import('../../hooks/lib/verdicttool.ts')

describe('MOD-246: pollStep', () => {
  test('the three bands and their edges', async () => {
    const { pollStep } = await V()
    expect([0, 5000, 29_999].map(pollStep)).toEqual([5000, 5000, 5000])
    expect([30_000, 60_000, 119_999].map(pollStep)).toEqual([15_000, 15_000, 15_000])
    expect([120_000, 300_000, 900_000].map(pollStep)).toEqual([30_000, 30_000, 30_000])
  })
  test('a 600 s wait takes 28 steps and a 900 s wait 38', async () => {
    const { pollStep } = await V()
    const steps = total => { let t = 0; let n = 0; while (t < total) { t += Math.min(pollStep(t), total - t); n++ } return n }
    expect(steps(600_000)).toBe(28)
    expect(steps(900_000)).toBe(38)
    expect(steps(10_000)).toBe(2)
  })
})
