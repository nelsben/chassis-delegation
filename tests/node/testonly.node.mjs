// MOD-313: red_test "none (test-only)" holds only when the delta is tests and docs.
import { test, expect, describe } from './kit.mjs'
import { testOnlyRed, briefWantsRed } from '../../hooks/lib/verify-native.ts'

const TO = 'none (test-only)'
describe('MOD-313: red_test none (test-only)', () => {
  test('a tests-only delta is held', () => {
    expect(testOnlyRed(TO, ['tests/a.test.ts', 'tests/node/b.node.mjs'])).toEqual({ status: 'held', detail: 'red_test none (test-only): the delta is tests and docs only (2 paths)' })
  })
  test('tests plus CHANGELOG and docs are held', () => {
    expect(testOnlyRed('None (Test-Only)', ['src/x.spec.ts', 'CHANGELOG.md', 'docs/contracts.md']).status).toBe('held')
  })
  test('a source path is refuted, with the paths named (at most 5)', () => {
    expect(testOnlyRed(TO, ['tests/a.test.ts', 'hooks/lib/x.ts'])).toEqual({ status: 'failed', detail: 'red_test none (test-only) but the delta changes hooks/lib/x.ts' })
    const many = testOnlyRed(TO, ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts'])
    expect(many.detail).toBe('red_test none (test-only) but the delta changes a.ts, b.ts, c.ts, d.ts, e.ts')
  })
  test('an unknown delta is unchecked', () => {
    expect(testOnlyRed(TO, undefined)?.status).toBe('unchecked')
  })
  test('none and none (docs only) make no claim', () => {
    for (const r of ['none', 'none (docs only)', '', 'npm test', undefined]) expect(testOnlyRed(r, ['hooks/x.ts'])).toBeUndefined()
    expect(briefWantsRed(TO)).toBe(false)
  })
})
