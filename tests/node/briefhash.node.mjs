// MOD-308 (#395): a brief's hash on the spawn and verdict rows, and the amend row's dedupe key. Pure.
import { test, expect, describe } from './kit.mjs'

describe('MOD-308: briefHash', () => {
  test('is the first 12 hex characters of sha256Text over the brief text', async () => {
    const { briefHash } = await import('../../hooks/lib/brief.ts')
    const { sha256Text } = await import('../../hooks/lib/land.ts')
    const text = '[[brief v=1 task=T-1 subtask=main purpose=build]]\nbody\n'
    expect(briefHash(text)).toBe(sha256Text(text).slice(0, 12))
  })
  test('is deterministic, twelve lowercase hex characters, and moves with the text', async () => {
    const { briefHash } = await import('../../hooks/lib/brief.ts')
    const a = briefHash('one brief')
    expect(briefHash('one brief')).toBe(a)
    expect(a).toMatch(/^[0-9a-f]{12}$/)
    expect(briefHash('one brief\n[[amend v=1 scope+=x reason=y]]\n')).not.toBe(a)
  })
})

describe('MOD-308: the amend row key', () => {
  test('one amend row per (task, subtask, briefHash), whatever the attempt', async () => {
    const { ledgerRowKey, ledgerHas } = await import('../../hooks/lib/attempts.ts')
    const row = { kind: 'amend', task: 'T-1', subtask: 'main', attempt: 2, briefHash: 'abcdef012345', tokens: 'scope+=x', source: 'brain', at: 1 }
    expect(ledgerRowKey(row)).toBe('amend|T-1|main|abcdef012345')
    expect(ledgerRowKey({ ...row, attempt: 3, at: 9 })).toBe('amend|T-1|main|abcdef012345')
    expect(ledgerHas([row], { ...row, attempt: 3 })).toBe(true)
    expect(ledgerHas([row], { ...row, briefHash: '000000000000' })).toBe(false)
  })
})
