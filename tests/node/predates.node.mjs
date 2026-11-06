// MOD-324: a commit made before the attempt was spawned can never be that attempt's work.
import { test, expect, describe } from './kit.mjs'

describe('MOD-324: predatesSpawn - a commit older than the spawn is no landing', () => {
  test('one second before the spawn: true', async () => {
    const { predatesSpawn } = await import('../../hooks/lib/verdicttool.ts')
    expect(predatesSpawn(999, 1000 * 1000 + 500)).toBe(true)
    expect(predatesSpawn(999, 1000 * 1000)).toBe(true)
  })

  test('same second as a spawn 500 ms into it, or a minute after: false', async () => {
    const { predatesSpawn } = await import('../../hooks/lib/verdicttool.ts')
    expect(predatesSpawn(1000, 1000 * 1000 + 500)).toBe(false)
    expect(predatesSpawn(1060, 1000 * 1000)).toBe(false)
  })

  test('non-finite inputs: false', async () => {
    const { predatesSpawn } = await import('../../hooks/lib/verdicttool.ts')
    expect(predatesSpawn(NaN, 1000)).toBe(false)
    expect(predatesSpawn(1, NaN)).toBe(false)
  })
})
