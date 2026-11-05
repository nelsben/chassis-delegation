// MOD-322: a refusal the tool.call chain never returned through (classic PostToolUseFailure) bumps n and not attempted,
// so the blocked-by-environment test is n at or above attempted, not equal.
import { test, expect, describe } from './kit.mjs'

describe('MOD-322: allRefused - every counted refusal is an attempt the host refused, or more', () => {
  test('one refusal seen by both paths, one refusal seen only by classic.PostToolUseFailure, both: true', async () => {
    const { allRefused } = await import('../../hooks/lib/identity.ts')
    expect(allRefused(1, 1)).toBe(true)
    expect(allRefused(2, 1)).toBe(true)
    expect(allRefused(1, 0)).toBe(true)
  })

  test('no refusal, or fewer refusals than attempts: false', async () => {
    const { allRefused } = await import('../../hooks/lib/identity.ts')
    expect(allRefused(0, 0)).toBe(false)
    expect(allRefused(1, 2)).toBe(false)
  })
})
