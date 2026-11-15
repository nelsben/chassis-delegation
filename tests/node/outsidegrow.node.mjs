// MOD-375 (#514): a root listed in full at dispatch is listed in full at hand-back, so a root that grew past 10000 files is still judged. Pure.
import { test, expect, describe } from './kit.mjs'
import { outsideCheck } from '../../hooks/lib/norepo.ts'

const fullOf = (root, paths) => ({ root, entries: paths.map((path, i) => ({ path, size: 1, mtimeMs: 10 + i })) })
const recorder = after => {
  const calls = []
  const list = async (root, since, full) => (calls.push({ root, since, full }), after(root))
  return { calls, list }
}

describe('MOD-375: the hand-back lists a root that was listed in full at dispatch in full', () => {
  test('outsideCheck asks for a full listing when the dispatch listing was full and not truncated', async () => {
    const before = [fullOf('/out', ['a.txt'])]
    const { calls, list } = recorder(root => fullOf(root, ['a.txt']))
    await outsideCheck(['/out/**'], [], { before, list })
    expect(calls.length).toBe(1)
    expect(calls[0].full).toBe(true)
    expect(calls[0].since).toBeUndefined()
  })
  test('a full after-listing that adds a path inside scope holds', async () => {
    const before = [fullOf('/out', ['a.txt'])]
    const { list } = recorder(root => fullOf(root, ['a.txt', 'new/b.txt']))
    const c = await outsideCheck(['/out/**'], ['/out/secret/**'], { before, list })
    expect(c?.status).toBe('held')
  })
  test('a full after-listing that adds a forbidden path fails and names it', async () => {
    const before = [fullOf('/out', ['a.txt'])]
    const { list } = recorder(root => fullOf(root, ['a.txt', 'secret/x.txt']))
    const c = await outsideCheck(['/out/**'], ['/out/secret/**'], { before, list })
    expect(c?.status).toBe('failed')
    expect(c?.detail).toContain('/out/secret/x.txt')
  })
  test('a truncated dispatch listing is not asked for a full one', async () => {
    const before = [{ ...fullOf('/out', ['a.txt']), truncated: true }]
    const { calls, list } = recorder(root => fullOf(root, ['a.txt']))
    const c = await outsideCheck(['/out/**'], [], { before, list })
    expect(calls[0].full).not.toBe(true)
    expect(c?.status).toBe('unchecked')
  })
  test('a watermark dispatch listing is still called with since and without full', async () => {
    const before = [{ root: '/out', since: 1000, files: 20000 }]
    const { calls, list } = recorder(root => ({ root, entries: [], dirs: [] }))
    await outsideCheck(['/out/**'], [], { before, list })
    expect(calls[0].since).toBe(1000)
    expect(calls[0].full).not.toBe(true)
  })
})
