// MOD-291: a rebase of the task's branch is not an attempt. The pure helper that decides
// unchanged / rebased / new work from the judged sha and the head (and their trees).
import { test, expect, describe } from './kit.mjs'
import { headMove, rebasedText, unverifiedWorkLine } from '../../hooks/lib/rebase'

const OLD = '1234abcdef0123456789abcdef0123456789abcd'
const NEW = 'abc1234fedcba9876543210fedcba9876543210f'
const TREE = 'aaaa1111bbbb2222cccc3333dddd4444eeee5555'
const OTHER = 'ffff0000eeee1111dddd2222cccc3333bbbb4444'

describe('MOD-291: a moved head after a judged attempt', () => {
  test('the same sha is unchanged, whatever the trees say', () => {
    expect(headMove({ sha: OLD, tree: TREE }, { sha: OLD, tree: TREE })).toEqual({ kind: 'unchanged' })
    expect(headMove({ sha: OLD }, { sha: OLD.slice(0, 7) })).toEqual({ kind: 'unchanged' })
  })
  test('a new sha with the same tree is a rebase: the head is the one to report', () => {
    expect(headMove({ sha: OLD, tree: TREE }, { sha: NEW, tree: TREE })).toEqual({ kind: 'rebased', sha: NEW })
  })
  test('a new sha with a different tree is new work, with the paths that changed', () => {
    expect(headMove({ sha: OLD, tree: TREE }, { sha: NEW, tree: OTHER }, ['a.ts', 'b.ts'])).toEqual({ kind: 'new-work', sha: NEW, files: ['a.ts', 'b.ts'] })
  })
  test('without both trees a moved head is never called a rebase', () => {
    expect(headMove({ sha: OLD }, { sha: NEW, tree: TREE }).kind).toBe('new-work')
    expect(headMove({ sha: OLD, tree: TREE }, { sha: NEW }).kind).toBe('new-work')
  })
})

describe('MOD-291: the lines the verdict tool says', () => {
  test('the rebased clause sits before next= in the row, else at its end', () => {
    expect(rebasedText('MOD-1 attempt 2/3 consistent · next=accept', NEW)).toBe('MOD-1 attempt 2/3 consistent · rebased to abc1234 · next=accept')
    expect(rebasedText('MOD-1 attempt 2/3 consistent', NEW)).toBe('MOD-1 attempt 2/3 consistent · rebased to abc1234')
  })
  test('unverified work names the judged sha, the count, the first three paths and dispatch verify=<head>', () => {
    expect(unverifiedWorkLine(OLD, NEW, ['a.ts', 'b.ts', 'c.ts', 'd.ts'])).toBe('unverified work since 1234abc: 4 files (a.ts, b.ts, c.ts) · dispatch verify=abc1234')
    expect(unverifiedWorkLine(OLD, NEW, ['only.ts'])).toBe('unverified work since 1234abc: 1 file (only.ts) · dispatch verify=abc1234')
  })
})
