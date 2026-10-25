// MOD-146 (#234): a red_test path that holds an <…> placeholder gets a warning naming it. Pure.
import { test, expect, describe } from './kit.mjs'
import { redTestWarnings } from '../../hooks/lib/card.ts'

const PH = (p, ph) => `warning: red_test names ${p}, which holds a placeholder ${ph}; name the real file or command`

describe('MOD-146: a placeholder path in red_test', () => {
  test('a placeholder path warns with the exact line, and gets no outside-scope line of its own', () => {
    const out = redTestWarnings('node test/core/<module>_test.cjs --run', ['test/**'], [])
    expect(out).toContain(PH('test/core/<module>_test.cjs', '<module>'))
    expect(out.some(l => l.includes('which is outside scope'))).toBe(false)
  })
  test('a placeholder path outside scope gives only the placeholder line', () => {
    expect(redTestWarnings('node test/core/<module>_test.cjs --run', [], [])).toEqual([PH('test/core/<module>_test.cjs', '<module>')])
  })
  test('a placeholder path warns once, the other path still gets its own warning', () => {
    expect(redTestWarnings('tests/<name>.test.ts and tests/other.test.ts', ['tests/**'], [])).toEqual([PH('tests/<name>.test.ts', '<name>')])
  })
  test('a prose placeholder not joined to a path gives no warning', () => {
    expect(redTestWarnings('resetsAt: <3 days after the day start>', [], [])).toEqual([])
    expect(redTestWarnings('a pure test of the advice, resetsAt: <3 days after the day start>', [], [])).toEqual([])
  })
  test('a red test of none gives no warning', () => {
    expect(redTestWarnings('none', [], [])).toEqual([])
  })
})
