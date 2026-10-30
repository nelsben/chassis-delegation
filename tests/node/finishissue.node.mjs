// MOD-189: a card with issue: / parent: gets Refs in pr.md and a printed gh issue close line at finish. Pure.
import { test, expect, describe } from './kit.mjs'

const lib = () => import('../../hooks/lib/mergecmd.ts')

describe('MOD-189: finishLines with an issue', () => {
  test('issue and pr: the close line comes first, the comment names the PR', async () => {
    const { finishLines } = await lib()
    expect(finishLines({ branch: 'agent/mod/MOD-1', issue: 12, ownerRepo: 'acme/widgets', pr: 34, sha: 'abcdef0123456789' })).toEqual([
      'gh issue close 12 --repo acme/widgets --comment \'merged in #34\'',
      'git push origin --delete agent/mod/MOD-1',
    ])
  })
  test('issue and no pr: the comment names the first 7 of the sha', async () => {
    const { finishLines } = await lib()
    expect(finishLines({ branch: 'b', issue: 12, ownerRepo: 'acme/widgets', sha: 'abcdef0123456789' })[0]).toBe("gh issue close 12 --repo acme/widgets --comment 'merged at abcdef0'")
  })
  test('issue and parent: the parent pointer is the last line, after release lines', async () => {
    const { finishLines } = await lib()
    const out = finishLines({ branch: 'b', version: '1.2.3', issue: 12, parent: 7, ownerRepo: 'acme/widgets', pr: 34 })
    expect(out[0]).toBe("gh issue close 12 --repo acme/widgets --comment 'merged in #34'")
    expect(out[1]).toBe('git push origin --delete b')
    expect(out.at(-1)).toBe('# parent #7: gh issue view 7 --repo acme/widgets --json subIssuesSummary; close it by hand when every task is done')
  })
  test('neither: unchanged', async () => {
    const { finishLines } = await lib()
    expect(finishLines({ branch: 'b' })).toEqual(['git push origin --delete b'])
    expect(finishLines({ branch: 'b', issue: 12 })).toEqual(['git push origin --delete b'])
  })
  test('MOD-195: siblings all closed but the task: the parent close line follows the task close line', async () => {
    const { finishLines } = await lib()
    const out = finishLines({ branch: 'b', issue: 12, parent: 7, ownerRepo: 'acme/widgets', pr: 34, siblings: [{ number: 11, state: 'closed' }, { number: 12, state: 'OPEN' }] })
    expect(out).toEqual([
      "gh issue close 12 --repo acme/widgets --comment 'merged in #34'",
      "gh issue close 7 --repo acme/widgets --comment 'all 2 tasks done'",
      'git push origin --delete b',
    ])
  })
  test('MOD-195: a sibling still open: the comment names the open ones, no close line', async () => {
    const { finishLines } = await lib()
    const out = finishLines({ branch: 'b', issue: 12, parent: 7, ownerRepo: 'acme/widgets', pr: 34, siblings: [{ number: 10, state: 'OPEN' }, { number: 11, state: 'OPEN' }, { number: 12, state: 'OPEN' }] })
    expect(out.at(-1)).toBe('# parent #7: 2 of 3 tasks still open (#10, #11)')
    expect(out.some(l => l.startsWith('gh issue close 7 '))).toBe(false)
  })
  test('MOD-195: no siblings given: today\'s comment line', async () => {
    const { finishLines } = await lib()
    expect(finishLines({ branch: 'b', issue: 12, parent: 7, ownerRepo: 'acme/widgets', pr: 34 }).at(-1)).toBe('# parent #7: gh issue view 7 --repo acme/widgets --json subIssuesSummary; close it by hand when every task is done')
  })
})
