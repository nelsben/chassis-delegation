// MOD-382 (#515): merge refuses a baseRef that is a local branch with no copy on origin. Pure.
import { test, expect, describe } from './kit.mjs'

const lib = () => import('../../hooks/lib/mergecmd.ts')

describe('MOD-382: mergeTarget with a local-only baseRef', () => {
  test('a local-only name is refused with the push line naming the branch', async () => {
    const { mergeTarget, localBaseLine } = await lib()
    const t = mergeTarget('work', false, true)
    expect(t.refuse).toBe(localBaseLine('work'))
    expect(t.refuse).toContain('git push -u origin work')
    expect(t.baseRef).toBe('origin/main')
    expect(t.def).toBe('main')
  })
  test('the same name on origin is the target, with no refuse', async () => {
    const { mergeTarget } = await lib()
    const t = mergeTarget('work', true, true)
    expect(t).toEqual({ baseRef: 'origin/work', def: 'work' })
    expect('refuse' in t).toBe(false)
  })
  test('origin/<name> behaves the same as the bare name', async () => {
    const { mergeTarget, localBaseLine } = await lib()
    expect(mergeTarget('origin/work', false, true).refuse).toBe(localBaseLine('work'))
    expect(mergeTarget('origin/work', true)).toEqual({ baseRef: 'origin/work', def: 'work' })
  })
  test('a name that is neither, and the empty value, keep today\'s result', async () => {
    const { mergeTarget } = await lib()
    expect(mergeTarget('v1.2', false, false)).toEqual({ baseRef: 'origin/main', def: 'main', note: 'baseRef v1.2 is not a branch; merging onto main' })
    expect(mergeTarget('v1.2', false)).toEqual({ baseRef: 'origin/main', def: 'main', note: 'baseRef v1.2 is not a branch; merging onto main' })
    expect(mergeTarget('', false, true)).toEqual({ baseRef: 'origin/main', def: 'main' })
  })
})
