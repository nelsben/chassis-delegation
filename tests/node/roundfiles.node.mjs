// MOD-294 (#388): a later round's files= is judged against the round's own delta or the cumulative branch delta. Pure.
import { test, expect, describe } from './kit.mjs'
import { filesBaseLine, filesClaimRound } from '../../hooks/lib/verify-native.ts'
import { roundBase } from '../../hooks/lib/attempts.ts'

const rec = (attempt, verdict, sha, over = {}) => ({ task: 'T', subtask: 'main', attempt, kind: attempt === 1 ? 'spawn' : 'resume', lineage: 1, tier: 'standard', alias: 'x', verdict, ...(sha ? { sha } : {}), ...over })
const BRANCH = ['a.ts', 'b.ts', 'c.ts']
const ROUND = ['c.ts']
const round = { base: 'abcdef1234567', delta: ROUND }
const branch = { delta: BRANCH, base: '1234567' }

describe('MOD-294: roundBase', () => {
  test('the newest earlier consistent attempt names the round base', () => {
    expect(roundBase([rec(1, 'consistent', 'aaa1111'), rec(2, 'refuted', 'bbb2222')], 'main', 3)).toBe('aaa1111')
    expect(roundBase([rec(1, 'consistent', 'aaa1111'), rec(2, 'consistent', 'bbb2222')], 'main', 3)).toBe('bbb2222')
  })
  test('no earlier consistent attempt, or the first attempt: none', () => {
    expect(roundBase([rec(1, 'refuted', 'aaa1111')], 'main', 2)).toBeUndefined()
    expect(roundBase([rec(1, 'consistent', 'aaa1111')], 'main', 1)).toBeUndefined()
  })
})

describe('MOD-294: filesClaimRound', () => {
  test('a round-2 partial list is held against the round delta', () => {
    expect(filesClaimRound(['c.ts'], branch, round)).toBe('claim files: held — files= matches the round delta since abcdef1 exactly')
  })
  test('a round-2 cumulative list is held against the branch delta', () => {
    expect(filesClaimRound(BRANCH, branch, round)).toBe('claim files: held — files= matches the branch delta since 1234567 exactly')
  })
  test('a round-2 list that omits a file of its own round is refuted naming the round base and the path', () => {
    const line = filesClaimRound(['a.ts'], branch, round)
    expect(line).toContain('claim files: failed')
    expect(line).toContain('omits c.ts')
    expect(line).toContain('invents a.ts')
    expect(line).toContain('round base abcdef1')
  })
  test('no prior attempt: filesClaim\'s line, every path in full, and the dispatch base named beside it', () => {
    const many = Array.from({ length: 30 }, (_, i) => `d/f${i}.ts`)
    const line = filesClaimRound([], { delta: many, base: '1234567' })
    for (const p of many) expect(line).toContain(p)
    expect(filesBaseLine(line, '1234567', false)).toBe('claim files: compared against dispatch base 1234567')
    expect(filesBaseLine(line, '1234567', true)).toBeUndefined()
    expect(filesBaseLine('claim files: held — x', '1234567', false)).toBeUndefined()
  })
})
