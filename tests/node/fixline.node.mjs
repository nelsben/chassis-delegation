// MOD-141: the `fix: forbid=` line after the forbid/done-when warning. Pure.
import { test, expect, describe } from './kit.mjs'

const lib = () => import('../../hooks/lib/card.ts')

describe('MOD-141: forbidFix fix line', () => {
  test('globs that cover a named path are removed, the rest kept in order', async () => {
    const { forbidFix } = await lib()
    expect(forbidFix(['vendor/**', 'docs/**', 'tests/**'], ['Writes `docs/guide.md` and `tests/a.test.ts`.'])).toBe('fix: forbid=vendor/**')
    expect(forbidFix(['docs/**', 'vendor/**', 'lib/**', 'tests/**'], ['Edits `docs/guide.md`.'])).toBe('fix: forbid=vendor/**,lib/**,tests/**')
  })
  test('every glob goes: none left', async () => {
    const { forbidFix } = await lib()
    expect(forbidFix(['docs/**'], ['Update `docs/guide.md`.'])).toBe('fix: forbid= (none left)')
  })
  test('no collision, no fix line', async () => {
    const { forbidFix } = await lib()
    expect(forbidFix(['vendor/**'], ['Update `docs/guide.md`.'])).toBeUndefined()
    expect(forbidFix([], ['Update `docs/guide.md`.'])).toBeUndefined()
    expect(forbidFix(['docs/**'], ['all the tests pass'])).toBeUndefined()
  })
})

describe('MOD-141: rewriteReasonsOf', () => {
  const head = (scope, forbid) => `[[brief v=1 task=T-1 subtask=main purpose=build tier=standard model=sonnet scope=${scope} forbid=${forbid} gate=test budget=2-attempts report=chassis.report.v1]]\n\nBody.\n`
  test('names a flag only when its field changed, and the card when the rest differs', async () => {
    const { rewriteReasonsOf } = await import('../../hooks/lib/dispatch.ts')
    expect(rewriteReasonsOf(head('a/**', 'b/**'), head('c/**', 'd/**'), true, true)).toBe('--scope applied, --forbid applied')
    expect(rewriteReasonsOf(head('a/**', 'b/**'), head('c/**', 'b/**'), true, true)).toBe('--scope applied')
    expect(rewriteReasonsOf(head('a/**', 'b/**'), head('c/**', 'b/**'), false, false)).toBe('the card changed')
    expect(rewriteReasonsOf(head('a/**', 'b/**'), head('c/**', 'b/**').replace('Body.', 'Other.'), true, false)).toBe('the card changed, --scope applied')
    expect(rewriteReasonsOf(head('a b, c', ''), head('x/**', ''), true, true)).toBe('--scope applied')
  })
})
