// MOD-305 (#415): a command that never names a watched outside root is not charged for a change under it. Pure.
import { test, expect, describe } from './kit.mjs'
import { commandNamesRoot, attributeWrites, outsideClaim } from '../../hooks/lib/norepo.ts'

describe('MOD-305: commandNamesRoot', () => {
  test('a command that names no path under the root is false', () => {
    expect(commandNamesRoot('ssh host sampler.ps1', '/w/repo', '/w/other')).toBe(false)
    expect(commandNamesRoot('node gen.mjs', '/w/repo', '/w/other')).toBe(false)
    expect(commandNamesRoot('ls /w/otherness', '/w/repo', '/w/other')).toBe(false)
  })
  test('an absolute word under the root, or the root itself, is true', () => {
    expect(commandNamesRoot('git -C /w/other pull', '/w/repo', '/w/other')).toBe(true)
    expect(commandNamesRoot('touch /w/other/settings.json', '/w/repo', '/w/other')).toBe(true)
    expect(commandNamesRoot('node "/w/other/gen.mjs"', '/w/repo', '/w/other')).toBe(true)
    expect(commandNamesRoot("cat '/w/other'", '/w/repo', '/w/other')).toBe(true)
  })
  test('a relative word is resolved against cwd', () => {
    expect(commandNamesRoot('cat ../other/x', '/w/repo', '/w/other')).toBe(true)
    expect(commandNamesRoot('cat ../elsewhere/x', '/w/repo', '/w/other')).toBe(false)
  })
  test('a cwd under the root is true', () => {
    expect(commandNamesRoot('node gen.mjs', '/w/other/sub', '/w/other')).toBe(true)
    expect(commandNamesRoot('node gen.mjs', '/w/other', '/w/other')).toBe(true)
  })
  test('a leading ~ is expanded with home; with no home it never matches', () => {
    expect(commandNamesRoot('ls ~/other', '/w/repo', '/w/other', '/w')).toBe(true)
    expect(commandNamesRoot('ls ~/other', '/w/repo', '/w/other')).toBe(false)
    expect(commandNamesRoot('ls ~', '/w/repo', '/w/other', '/w')).toBe(false)
  })
})

describe('MOD-305: the foreign list in attribution', () => {
  test('a path in the foreign list is foreign even when the writes log is empty; another path is still the worker\'s', () => {
    const r = attributeWrites(['/o/settings.json', '/o/mine.txt'], [], ['/o/settings.json'])
    expect(r.mine).toEqual(['/o/mine.txt'])
    expect(r.foreign).toEqual(['/o/settings.json'])
    expect(r.snap).toEqual(['/o/settings.json'])
  })
  test('without a foreign list the result is unchanged', () => {
    expect(attributeWrites(['/o/a'], undefined)).toEqual({ mine: ['/o/a'], foreign: [] })
    expect(attributeWrites(['/o/a', '/o/b'], ['/o/a'])).toEqual({ mine: ['/o/a'], foreign: ['/o/b'] })
  })
  test('a path the worker also wrote through a command that names it stays the worker\'s', () => {
    expect(attributeWrites(['/o/a'], ['/o/a'], ['/o/a']).mine).toEqual(['/o/a'])
  })
  test('outsideClaim lists the foreign-log path, not judged, and still judges the rest', () => {
    const before = [{ root: '/o', entries: [] }]
    const after = [{ root: '/o', entries: [{ path: 'settings.json', size: 1, mtimeMs: 1 }, { path: 'bad.txt', size: 1, mtimeMs: 1 }] }]
    const c = outsideClaim({ before, after, scope: [], forbid: ['/o/**'], foreign: ['/o/settings.json'] })
    expect(c?.status).toBe('failed')
    expect(c?.detail).toContain('/o/bad.txt')
    const d = outsideClaim({ before, after: [{ root: '/o', entries: [after[0].entries[0]] }], scope: [], forbid: ['/o/**'], foreign: ['/o/settings.json'] })
    expect(d?.status).toBe('held')
    expect(d?.foreignRun).toEqual(['/o/settings.json'])
    expect(d?.foreign).toBeUndefined()
  })
})
