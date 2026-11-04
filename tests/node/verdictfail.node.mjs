// MOD-297 (#336): a throw inside the verdict tool comes back as one line naming the error and the band row. Pure.
import { test, expect, describe } from './kit.mjs'

const lib = () => import('../../hooks/lib/verdicttool.ts')

describe('MOD-297: the verdict tool never returns an empty result', () => {
  test('with no row the line names the error and the band', async () => {
    const { verdictFailLine } = await lib()
    expect(verdictFailLine('T-9', 'ledger read failed')).toBe('T-9: verdict failed: ledger read failed; the band line holds the row, or call verdict again')
  })
  test('with a row the line also names the verdict and next=', async () => {
    const { verdictFailLine } = await lib()
    const line = verdictFailLine('T-9', 'ledger read failed', { verdict: 'consistent', next: 'accept' })
    expect(line).toBe('T-9: verdict failed: ledger read failed; verdict consistent next=accept; the band line holds the row, or call verdict again')
  })
  test('only the first line of a multi-line error is named', async () => {
    const { verdictFailLine } = await lib()
    expect(verdictFailLine('T-9', 'boom\n    at stack frame')).toBe('T-9: verdict failed: boom; the band line holds the row, or call verdict again')
  })
  test('an empty error still names something', async () => {
    const { verdictFailLine } = await lib()
    expect(verdictFailLine('T-9', '')).toContain('verdict failed: unknown error')
  })
})
