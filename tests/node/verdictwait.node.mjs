// MOD-301: a resumed worker is judged on its hand-back; the verdict tool names a missing verifier and the seconds it waited. Pure.
import { test, expect, describe } from './kit.mjs'

const lib = () => import('../../hooks/lib/verdicttool.ts')
const att = () => import('../../hooks/lib/attempts.ts')

describe('MOD-301: newerSpawn', () => {
  test('the record with the higher attempt wins, whichever side it is on', async () => {
    const { newerSpawn } = await att()
    const a = { key: 'toolu_1', attempt: 1 }
    const b = { key: 'verify-T-1-main-3', attempt: 3 }
    expect(newerSpawn(a, b)).toBe(b)
    expect(newerSpawn(b, a)).toBe(b)
  })
  test('equal attempts keep the first (the record the call names); a missing side yields the other', async () => {
    const { newerSpawn } = await att()
    const a = { key: 'x', attempt: 2 }
    const b = { key: 'y', attempt: 2 }
    expect(newerSpawn(a, b)).toBe(a)
    expect(newerSpawn(undefined, b)).toBe(b)
    expect(newerSpawn(a, undefined)).toBe(a)
    expect(newerSpawn(undefined, undefined)).toBe(undefined)
  })
})

describe('MOD-301: the verdict tool lines', () => {
  test('pending with no verifier running names the attempt and the sha to verify', async () => {
    const { noVerifierRunning } = await lib()
    expect(noVerifierRunning('MOD-299', 3, 'abc1234def')).toBe('MOD-299: attempt 3 pending, no verifier running; dispatch verify=abc1234def')
    expect(noVerifierRunning('MOD-299/ui', 3)).toBe('MOD-299/ui: attempt 3 pending, no verifier running; dispatch verify=none')
    expect(noVerifierRunning('T-1', 2, '')).toBe('T-1: attempt 2 pending, no verifier running; dispatch verify=none')
  })
  test('still verifying names the seconds waited, and a reason when the wait could not run', async () => {
    const { stillVerifying } = await lib()
    expect(stillVerifying('T-4', 600)).toBe('T-4: still verifying after 600s; call verdict again')
    expect(stillVerifying('T-4', 0, 'wait unavailable: sleep did not run')).toBe('T-4: still verifying after 0s; call verdict again (wait unavailable: sleep did not run)')
    expect(stillVerifying('T-4', 35, undefined, 'verifying (gate test running 3 min)')).toBe('T-4: still verifying after 35s; call verdict again · verifying (gate test running 3 min)')
  })
})
