// MOD-292 (#392): the verdict tool reads the branch before the ledger; a pause-cap charge does not decide the outcome. Pure.
import { test, expect, describe } from './kit.mjs'

const lib = () => import('../../hooks/lib/verdicttool.ts')
const row = (over = {}) => ({ task: 'T-9', subtask: 'main', attempt: 3, kind: 'spawn', lineage: 1, tier: 'standard', alias: 'sonnet', verdict: 'no-report', at: 1, ...over })

describe('MOD-292: a merged head reports merged', () => {
  test('a merged head with a no-report row reports merged at sha7 and never advises resume', async () => {
    const { mergedVerdict } = await lib()
    const d = mergedVerdict(true, [row()], 'abcdef0123456789')
    expect(d.kind).toBe('merged')
    expect(d.line).toBe('T-9: merged at abcdef0')
    expect(d.attempt).toBe(3)
    expect(d.line).not.toContain('resume')
    expect(d.line).not.toContain('agent')
    expect(d.line).not.toContain('$')
  })
  test('the sha defaults to the last row that names one', async () => {
    const { mergedVerdict } = await lib()
    expect(mergedVerdict(true, [row({ attempt: 1, sha: '1111111aaaa' }), row()]).line).toBe('T-9: merged at 1111111')
  })
  test('not an ancestor, or no rows: the rows decide', async () => {
    const { mergedVerdict } = await lib()
    expect(mergedVerdict(false, [row()], 'abcdef0').kind).toBe('rows')
    expect(mergedVerdict(true, [], 'abcdef0').kind).toBe('rows')
    expect(mergedVerdict(true, [row()]).kind).toBe('rows')
  })
  test('a subtask label names the subtask', async () => {
    const { mergedVerdict } = await lib()
    expect(mergedVerdict(true, [row({ subtask: 'ui' })], 'abcdef0').line).toBe('T-9/ui: merged at abcdef0')
  })
})

describe('MOD-292: a hand-back after a pause-cap charge is judged', () => {
  test('a charged pause-cap attempt reopens on a hand-back with a report, not on a second pause', async () => {
    const { reopensAfterPauseCap } = await lib()
    expect(reopensAfterPauseCap(true, true)).toBe(true)
    expect(reopensAfterPauseCap(true, false)).toBe(false)
    expect(reopensAfterPauseCap(undefined, true)).toBe(false)
  })
})

describe('MOD-316: the dispatch base never counts as landed', () => {
  const base = 'abcdef0123456789abcdef0123456789abcdef01'
  test('equal full shas: not landed', async () => {
    const { landedSha } = await lib()
    expect(landedSha(base, base)).toBe(false)
  })
  test('a short sha that is a prefix of the full base: not landed (either direction)', async () => {
    const { landedSha } = await lib()
    expect(landedSha('abcdef0', base)).toBe(false)
    expect(landedSha(base, 'abcdef0')).toBe(false)
  })
  test('different shas: landed', async () => {
    const { landedSha } = await lib()
    expect(landedSha('1234567890abcdef', base)).toBe(true)
  })
  test('no baseSha recorded: the old rule stands', async () => {
    const { landedSha } = await lib()
    expect(landedSha(base, undefined)).toBe(true)
    expect(landedSha(base, '')).toBe(true)
  })
})
