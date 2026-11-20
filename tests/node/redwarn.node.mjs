// MOD-408: dispatch warns when a card that changes code has red_test none; it never refuses. Pure.
import { test, expect, describe } from './kit.mjs'

const D = () => import('../../hooks/lib/dispatch.ts')
const code = ['hooks/lib/a.ts', 'tests/a.test.ts', 'CHANGELOG.md']
const base = { redTest: 'none', kind: 'feature', scope: code }

describe('MOD-408: redTestWarning', () => {
  test('fires for none on a feature card and counts source paths', async () => {
    const { redTestWarning } = await D()
    expect(redTestWarning(base)).toBe('warning: red_test is none on a card that changes code (1 source paths in scope): name a test that fails before the change')
  })
  test('fires for none (test-only) and for an empty value', async () => {
    const { redTestWarning } = await D()
    expect(redTestWarning({ ...base, redTest: 'none (test-only)' })).toContain('1 source paths')
    expect(redTestWarning({ ...base, redTest: '' })).toContain('1 source paths')
  })
  test('does not fire with a red test command', async () => {
    const { redTestWarning } = await D()
    expect(redTestWarning({ ...base, redTest: 'node tests/x.mjs' })).toBe(undefined)
  })
  test('does not fire for docs, release, test or spike kinds', async () => {
    const { redTestWarning } = await D()
    for (const kind of ['docs', 'release', 'test', 'spike']) expect(redTestWarning({ ...base, kind })).toBe(undefined)
  })
  test('does not fire for purpose spike', async () => {
    const { redTestWarning } = await D()
    expect(redTestWarning({ ...base, purpose: ' Spike ' })).toBe(undefined)
  })
  test('does not fire for a scope of only docs, changelog and the manifest', async () => {
    const { redTestWarning } = await D()
    expect(redTestWarning({ ...base, scope: ['docs/**', 'CHANGELOG.md', '.claude-plugin/plugin.json'] })).toBe(undefined)
  })
})
