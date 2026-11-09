// MOD-351: a scope or forbid glob whose `**/` needs a folder (and so misses the files directly in it) is said at card time. Pure.
import { test, expect, describe } from './kit.mjs'
import { globGapWarnings } from '../../hooks/lib/card.ts'

const L = (list, entry, fill) => `warning: ${list} ${entry} needs a folder at every **/ here, so it misses ${fill}: add ${fill} to the ${list}`

describe('MOD-351: globGapWarnings', () => {
  test('a gap in scope gives one line', () => {
    expect(globGapWarnings(['tests/**/*.test.ts'], [])).toEqual([L('scope', 'tests/**/*.test.ts', 'tests/*.test.ts')])
  })
  test('the fill entry, or a glob that matches it, closes the gap', () => {
    expect(globGapWarnings(['tests/**/*.test.ts', 'tests/*.test.ts'], [])).toEqual([])
    expect(globGapWarnings(['tests/**/*.test.ts', 'tests/**'], [])).toEqual([])
  })
  test('a leading **/ fills to the bare name', () => {
    expect(globGapWarnings(['**/index.ts'], [])).toEqual([L('scope', '**/index.ts', 'index.ts')])
  })
  test('every /**/ is filled', () => {
    expect(globGapWarnings(['a/**/b/**/c.ts'], [])).toEqual([L('scope', 'a/**/b/**/c.ts', 'a/b/c.ts')])
  })
  test('entries with no gap warn nothing', () => {
    expect(globGapWarnings(['src/**', 'src/*.ts', 'docs/'], [])).toEqual([])
  })
  test('an absolute or home entry warns nothing', () => {
    expect(globGapWarnings(['~/out/**/x.md', '/abs/**/x.md'], [])).toEqual([])
  })
  test('a gap in forbid names the forbid', () => {
    expect(globGapWarnings(['hooks/lib/a.ts'], ['docs/**/secret.md'])).toEqual([L('forbid', 'docs/**/secret.md', 'docs/secret.md')])
  })
  test('scope first, then forbid', () => {
    expect(globGapWarnings(['tests/**/x.ts'], ['tests/**/x.ts'])).toEqual([L('scope', 'tests/**/x.ts', 'tests/x.ts'), L('forbid', 'tests/**/x.ts', 'tests/x.ts')])
  })
  test('the same entry twice gives one line', () => {
    expect(globGapWarnings(['tests/**/x.ts', 'tests/**/x.ts'], [])).toEqual([L('scope', 'tests/**/x.ts', 'tests/x.ts')])
  })
  test('empty entries are ignored', () => {
    expect(globGapWarnings(['', 'tests/**/x.ts'], [''])).toEqual([L('scope', 'tests/**/x.ts', 'tests/x.ts')])
  })
})
