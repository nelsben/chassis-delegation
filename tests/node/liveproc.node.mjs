// MOD-317: the verdict row notes live processes whose command names the worktree at hand-back. Pure: no `$`.
import { test, expect, describe } from './kit.mjs'

const { liveInWorktree, liveProcessLine } = await import('../../hooks/lib/liveproc.ts')

const WT = '/Users/dev/repo-MOD-317'
const psOut = [
  `  101 node ${WT}/tests/a.js --flag`,
  `  102 sh -c cd ${WT}/sub && sleep 30`,
  `  103 node /Users/dev/repo-MOD-316/x`,
  `  104 ssh vm "${WT}"`,
  `  105 tail -f ${WT}`,
].join('\n')

describe('MOD-317: liveInWorktree', () => {
  test('two matching lines and one other give two entries, the command cut to 80 characters', () => {
    const long = `  201 printf ${WT}/${'x'.repeat(120)}`
    const found = liveInWorktree(`${psOut}\n${long}\n  202 node /elsewhere/y`, WT)
    expect(found.map(f => f.pid)).toEqual([101, 102, 104, 105, 201])
    const last = found[found.length - 1]
    expect(last.command.length).toBe(80)
    expect(last.command).toBe(`printf ${WT}/${'x'.repeat(120)}`.slice(0, 80))
  })
  test('a sibling worktree with the same prefix does not match', () => {
    const found = liveInWorktree(`  103 node /Users/dev/repo-MOD-316/x`, '/Users/dev/repo-MOD-31')
    expect(found).toEqual([])
    expect(liveInWorktree(`  103 node /Users/dev/repo-MOD-316/x`, '/Users/dev/repo-MOD-31/')).toEqual([])
  })
  test('a trailing slash on the worktree argument still matches', () => {
    expect(liveInWorktree(`  101 node ${WT}/tests/a.js`, `${WT}/`).map(f => f.pid)).toEqual([101])
  })
  test('a path followed by a quote matches', () => {
    expect(liveInWorktree(`  104 ssh vm "${WT}"`, WT).map(f => f.pid)).toEqual([104])
    expect(liveInWorktree(`  106 ssh vm '${WT}'`, WT).map(f => f.pid)).toEqual([106])
  })
})

describe('MOD-317: liveProcessLine', () => {
  const entry = (pid) => ({ pid, command: `cmd${pid}` })
  test('none is undefined', () => {
    expect(liveProcessLine([])).toBeUndefined()
  })
  test('one entry is singular', () => {
    expect(liveProcessLine([entry(1)])).toBe('note: 1 live process name the worktree: pid 1 cmd1')
  })
  test('three entries are plural and joined with a semicolon, no more-count', () => {
    expect(liveProcessLine([entry(1), entry(2), entry(3)])).toBe(
      'note: 3 live processes name the worktree: pid 1 cmd1; pid 2 cmd2; pid 3 cmd3',
    )
  })
  test('five entries name the first three and the count of the rest', () => {
    expect(liveProcessLine([1, 2, 3, 4, 5].map(entry))).toBe(
      'note: 5 live processes name the worktree: pid 1 cmd1; pid 2 cmd2; pid 3 cmd3 (+2 more)',
    )
  })
})
