// MOD-310 (#399, the delta half): a repo=here worker's delta subtracts every in-flight
// sibling card's scope, not only the files the siblings have reported so far. Run by tests/node/run.mjs.
import { test, expect, describe } from './kit.mjs'
import { subtractDelta, ignoredLine } from '../../hooks/lib/verify-native.ts'

describe('MOD-310: a sibling scope claims what it has not reported yet', () => {
  test('a path under a sibling scope but not in its files is subtracted, and disclosed with (scope)', () => {
    const s = subtractDelta(['a.ts', 'docs/x.md', 'docs/y.md', 'docs/z.md'], [], [{ card: 'OPS-12', files: [], scope: ['docs/**'] }])
    expect(s.kept).toEqual(['a.ts'])
    expect(s.byCard).toEqual([{ card: 'OPS-12', paths: ['docs/x.md', 'docs/y.md', 'docs/z.md'], scope: true }])
    expect(ignoredLine(s)).toBe('ignored: 0 paths by ignore=, 3 paths belonging to OPS-12 (scope) (docs/x.md, docs/y.md, docs/z.md)')
  })
  test('the sibling files still claim first, and the group reads without (scope) when no path came from scope', () => {
    const s = subtractDelta(['lib/a.ts'], [], [{ card: 'OPS-7', files: ['lib/a.ts'], scope: ['lib/**'] }])
    expect(s.kept).toEqual([])
    expect(s.byCard).toEqual([{ card: 'OPS-7', paths: ['lib/a.ts'] }])
    expect(ignoredLine(s)).toBe('ignored: 0 paths by ignore=, 1 path belonging to OPS-7 (lib/a.ts)')
  })
  test('a path in the worker own scope and a sibling scope is kept, not subtracted', () => {
    const s = subtractDelta(['lib/a.ts', 'lib/b.ts'], [], [{ card: 'OPS-7', files: [], scope: ['lib/**'] }], { scope: ['lib/a.ts'] })
    expect(s.kept).toEqual(['lib/a.ts'])
    expect(s.byCard).toEqual([{ card: 'OPS-7', paths: ['lib/b.ts'], scope: true }])
  })
  test('a path in the worker write log inside a sibling scope is kept, and judged', () => {
    const s = subtractDelta(['lib/a.ts', 'lib/b.ts'], [], [{ card: 'OPS-7', files: [], scope: ['lib/**'] }], { writes: ['lib/b.ts'] })
    expect(s.kept).toEqual(['lib/b.ts'])
    expect(s.byCard).toEqual([{ card: 'OPS-7', paths: ['lib/a.ts'], scope: true }])
  })
  test('the order holds: ignore first, then the sibling files, then the worker own scope, then its write log, then a sibling scope', () => {
    const s = subtractDelta(
      ['out/x', 'lib/f.ts', 'lib/g.ts', 'lib/h.ts'],
      ['out/**'],
      [{ card: 'OPS-1', files: ['lib/f.ts'], scope: ['lib/**'] }],
      { scope: ['lib/g.ts'], writes: ['lib/h.ts'] },
    )
    expect(s.ignored).toEqual(['out/x'])
    expect(s.kept).toEqual(['lib/g.ts', 'lib/h.ts'])
    expect(s.byCard).toEqual([{ card: 'OPS-1', paths: ['lib/f.ts'] }])
  })
  test('a sibling without a scope field behaves as before: its files only', () => {
    const s = subtractDelta(['lib/a.ts'], [], [{ card: 'A-1', files: ['lib/'] }])
    expect(s).toEqual({ kept: [], ignored: [], byCard: [{ card: 'A-1', paths: ['lib/a.ts'] }] })
  })
})
