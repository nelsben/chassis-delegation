// MOD-296 (#398): a spawn row recorded under a suffixed task id (`<id> <suffix>`) reads closed once a later row for the
// plain id is accepted, merged, or consistent or reviewed. Pure: rows.ts only.
import { test, expect, describe } from './kit.mjs'

describe('MOD-296: a suffixed open row closes on a later plain accept', () => {
  test('a suffixed open row with a later plain accept reads closed, with the reason', async () => {
    const { supersededRows } = await import('../../hooks/lib/rows.ts')
    const rows = [
      { task: 'TASK-20 a0cd00b3', attempt: 0, kind: 'spawn', verdict: 'pending' },
      { task: 'TASK-20', attempt: 1, kind: 'accept' },
    ]
    expect(supersededRows(rows).get(0)).toBe('superseded by TASK-20 attempt 1')
  })

  test('a consistent or reviewed verdict row on the plain id closes the suffixed row too', async () => {
    const { supersededRows } = await import('../../hooks/lib/rows.ts')
    const rows = [
      { task: 'TASK-21 b1ee2211', attempt: 0, verdict: 'pending' },
      { task: 'TASK-21', attempt: 2, verdict: 'consistent' },
    ]
    expect(supersededRows(rows).get(0)).toBe('superseded by TASK-21 attempt 2')
  })

  test('without a later plain accept the suffixed row stays open', async () => {
    const { supersededRows } = await import('../../hooks/lib/rows.ts')
    const rows = [
      { task: 'TASK-22 c2dd3322', attempt: 0, verdict: 'pending' },
      { task: 'TASK-22', attempt: 1, verdict: 'refuted' },
      { task: 'TASK-23', attempt: 1, kind: 'accept' },
    ]
    expect(supersededRows(rows).has(0)).toBe(false)
  })

  test('an earlier plain accept does not close a suffixed row written after it', async () => {
    const { supersededRows } = await import('../../hooks/lib/rows.ts')
    const rows = [
      { task: 'TASK-24', attempt: 1, kind: 'accept' },
      { task: 'TASK-24 d3ee4433', attempt: 0, verdict: 'pending' },
    ]
    expect(supersededRows(rows).has(1)).toBe(false)
  })

  test('a briefed spawn is keyed by the plain id: its row is not suffixed and is never superseded', async () => {
    const { supersededRows, plainTaskOf } = await import('../../hooks/lib/rows.ts')
    const rows = [
      { task: 'TASK-25', attempt: 1, verdict: 'pending' },
      { task: 'TASK-25', attempt: 1, kind: 'accept' },
    ]
    expect(plainTaskOf('TASK-25')).toBe(undefined)
    expect(supersededRows(rows).size).toBe(0)
  })
})
