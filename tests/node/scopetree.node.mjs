// MOD-188: a child's scope globs against the parent's scope block. Pure.
import { test, expect, describe } from './kit.mjs'
import { contained, strayGlob, openSiblings } from '../../hooks/lib/scopetree.ts'

describe('MOD-188: contained', () => {
  test('an equal glob is contained', () => {
    expect(contained('src/export/**', ['src/export/**'])).toBe(true)
    expect(contained('tests/a.ts', ['docs/**', 'tests/a.ts'])).toBe(true)
  })
  test('a parent /** contains what sits under its folder, including a narrower glob', () => {
    expect(contained('src/export/a.ts', ['src/export/**'])).toBe(true)
    expect(contained('src/export/sub/**', ['src/export/**'])).toBe(true)
  })
  test('a sibling folder with the same prefix is not contained', () => {
    expect(contained('src/exporter.ts', ['src/export/**'])).toBe(false)
  })
  test('a literal path is contained when a parent glob matches it', () => {
    expect(contained('docs/a/b.md', ['docs/*.md'])).toBe(true)
    expect(contained('lib/b.md', ['docs/*.md'])).toBe(false)
  })
  test('a child glob wider than the parent is not contained', () => {
    expect(contained('src/**', ['src/export/**'])).toBe(false)
    expect(contained('src/export/*.ts', ['src/export/a.ts'])).toBe(false)
  })
})

describe('MOD-188: strayGlob', () => {
  test('names the first glob that is not contained, or nothing', () => {
    expect(strayGlob(['src/export/a.ts', 'src/other/**', 'x/**'], ['src/export/**'])).toBe('src/other/**')
    expect(strayGlob(['src/export/a.ts'], ['src/export/**'])).toBe(undefined)
  })
})

describe('MOD-188: openSiblings', () => {
  const cards = [
    { id: 'OPS-1', status: 'queued', parent: '7', scope: ['a/**'] },
    { id: 'OPS-2', status: 'merged', parent: '7', scope: ['b/**'] },
    { id: 'OPS-3', status: 'queued', parent: '7', scope: ['c/**'] },
    { id: 'OPS-4', status: 'queued', parent: '8', scope: ['d/**'] },
    { id: 'OPS-5', status: 'queued', parent: undefined, scope: ['e/**'] },
  ]
  test('same parent, not merged on the card, no accepted or merged ledger row', () => {
    expect(openSiblings(cards, 7, new Set(['OPS-3'])).map(c => c.id)).toEqual(['OPS-1'])
    expect(openSiblings(cards, 7, new Set()).map(c => c.id)).toEqual(['OPS-1', 'OPS-3'])
  })
})
