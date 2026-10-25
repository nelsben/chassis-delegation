// MOD-142: what merge --finish keeps for the brain to copy: the porcelain parse, the skip list, the folder collapsing. Pure.
import { test, expect, describe } from './kit.mjs'

const lib = () => import('../../hooks/lib/mergecmd.ts')

describe('MOD-142: finishLeftovers', () => {
  test('keeps ?? and !! paths, drops tracked changes', async () => {
    const { finishLeftovers } = await lib()
    expect(finishLeftovers(' M a.ts\n?? b.txt\n!! .local/run/log.txt\nA  c.ts\n')).toEqual(['b.txt', '.local/run/log.txt'])
  })
  test('the skip list: nested node_modules, a .pyc, .DS_Store, .delegation, folder entries', async () => {
    const { finishLeftovers, FINISH_SKIP } = await lib()
    expect(FINISH_SKIP).toContain('node_modules/')
    const out = finishLeftovers([
      '!! node_modules/',
      '!! pkg/node_modules/x/y.js',
      '!! src/a.pyc',
      '!! sub/.DS_Store',
      '!! .DS_Store',
      '!! .delegation/MOD-1/red-1.txt',
      '!! a/__pycache__/m.cpython.pyc',
      '!! dist/x.js',
      '!! keep/dist.js',
      '?? notes.txt',
    ].join('\n'))
    expect(out).toEqual(['keep/dist.js', 'notes.txt'])
  })
  test('quoted paths lose their quotes', async () => {
    const { finishLeftovers } = await lib()
    expect(finishLeftovers('?? "a b.txt"\n')).toEqual(['a b.txt'])
  })
})

describe('MOD-142: collapseLeftovers', () => {
  test('up to 3 files in a folder stay as paths; more collapse to the folder', async () => {
    const { collapseLeftovers } = await lib()
    expect(collapseLeftovers(['x/a', 'x/b', 'x/c', 'y.txt'])).toEqual(['x/a', 'x/b', 'x/c', 'y.txt'])
    expect(collapseLeftovers(['x/a', 'x/b', 'x/c', 'x/d/e', 'y.txt'])).toEqual(['x/ (4 files)', 'y.txt'])
  })
  test('the list caps at 20 with a count of the rest', async () => {
    const { finishStopLines } = await lib()
    const paths = Array.from({ length: 25 }, (_, i) => `f${String(i).padStart(2, '0')}.txt`)
    const lines = finishStopLines('MOD-1', '/w', paths)
    expect(lines).toHaveLength(1 + 20 + 1)
    expect(lines[0]).toBe('MOD-1: the worktree /w holds 25 untracked or ignored files the merge does not carry; copy what you need, then run /delegation merge MOD-1 --finish again, or add --discard to delete them:')
    expect(lines.at(-1)).toBe('… 5 more')
  })
})
