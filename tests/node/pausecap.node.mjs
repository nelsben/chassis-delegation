// MOD-326: the pause cap is a repo option (pauseCap, default 3). Pure.
import { test, expect, describe } from './kit.mjs'

const repo = () => import('../../hooks/lib/repoconfig.ts')
const wait = () => import('../../hooks/lib/waitstate.ts')
const ERR = 'pauseCap: needs a whole number from 2 to 20 (ignored)'
const eff = async obj => {
  const { parseRepoConfig, mergeConfig } = await repo()
  const p = parseRepoConfig(JSON.stringify(obj))
  return { p, e: mergeConfig(p.config, {}) }
}

describe('MOD-326: pauseCap in the repo config', () => {
  test('5 is read as 5', async () => {
    const { p, e } = await eff({ pauseCap: 5 })
    expect(p.errors).toEqual([])
    expect(e.pauseCap).toBe(5)
  })
  test('absent reads 3', async () => {
    const { p, e } = await eff({})
    expect(p.errors).toEqual([])
    expect(e.pauseCap).toBe(3)
  })
  for (const bad of [1, 21, 'x', 2.5]) {
    test(`${JSON.stringify(bad)} is named and 3 is used`, async () => {
      const { p, e } = await eff({ pauseCap: bad })
      expect(p.errors.some(l => l.includes(ERR))).toBe(true)
      expect(e.pauseCap).toBe(3)
    })
  }
  test('2 and 20 are the bounds', async () => {
    expect((await eff({ pauseCap: 2 })).e.pauseCap).toBe(2)
    expect((await eff({ pauseCap: 20 })).e.pauseCap).toBe(20)
  })
})

describe('MOD-326: the cap in the pause rows', () => {
  test('pauseCapLine names the pause and the times for a cap of 5', async () => {
    const { pauseCapLine } = await wait()
    const l = pauseCapLine(5, 1, 5)
    expect(l.includes('pause 5')).toBe(true)
    expect(l.includes('4 times')).toBe(true)
  })
  test('pauseCapLine defaults to 3', async () => {
    const { pauseCapLine } = await wait()
    expect(pauseCapLine(3, 1).includes('2 times')).toBe(true)
  })
  test('pauseRow prints pause=2/4 for a cap of 5, 2/2 by default', async () => {
    const { pauseRow } = await wait()
    const p = { task: 'A-1', attempt: 1, budget: 2, n: 2, reason: 'r', waited: 0 }
    expect(pauseRow({ ...p, cap: 5 }).includes('pause=2/4')).toBe(true)
    expect(pauseRow(p).includes('pause=2/2')).toBe(true)
  })
})
