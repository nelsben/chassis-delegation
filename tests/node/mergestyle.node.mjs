// MOD-319: the merge style the printed `gh pr merge` line carries. Pure.
import { test, expect, describe } from './kit.mjs'

const lib = () => import('../../hooks/lib/mergecmd.ts')
const base = { worktree: '/w', branch: 'agent/x/A-1', ownerRepo: 'o/r', defaultBranch: 'main', title: 'T', prFile: '/p.md', id: 'A-1' }
const mergeLine = lines => lines.find(l => l.startsWith('gh pr merge'))

describe('MOD-319: pushLines mergeStyle', () => {
  test('the default is rebase', async () => {
    const { pushLines } = await lib()
    expect(mergeLine(pushLines(base))).toBe('gh pr merge --repo o/r agent/x/A-1 --rebase')
  })
  for (const style of ['rebase', 'merge', 'squash']) {
    test(`${style} prints --${style}`, async () => {
      const { pushLines } = await lib()
      expect(mergeLine(pushLines({ ...base, mergeStyle: style }))).toBe(`gh pr merge --repo o/r agent/x/A-1 --${style}`)
    })
  }
})

describe('MOD-319: squashIn', () => {
  test('a commit with the head tree and another sha; never the head itself', async () => {
    const { squashIn } = await lib()
    const log = 'h1\tT1\tmine\ns2\tT1\tsquashed (#3)\nx\tT2\tother'
    expect(squashIn(log, 'h1', 'T1')).toBe('s2')
    expect(squashIn('h1\tT1\tmine', 'h1', 'T1')).toBeUndefined()
    expect(squashIn(log, 'h1', '')).toBeUndefined()
  })
})
