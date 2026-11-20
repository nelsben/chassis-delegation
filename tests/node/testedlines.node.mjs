// MOD-411: the `tested:` lines a worker lists in its hand-back, kept on the verdict row and shown in the Testing section. Pure.
import { test, expect, describe } from './kit.mjs'

const H = () => import('../../hooks/lib/handback.ts')
const M = () => import('../../hooks/lib/mergecmd.ts')
const R = '[[report v=1 task=T-1 subtask=main branch=none pr=none sha=none gate=pass red=none files=none]]'

describe('MOD-411: handbackTested', () => {
  test('two tested lines above the report', async () => {
    const { handbackTested } = await H()
    expect(handbackTested(`tested: tsc -> clean\ntested: could not run the editor (no display)\n${R}`)).toEqual({ count: 2, lines: ['tsc -> clean', 'could not run the editor (no display)'] })
  })
  test('a line below the last report is not read', async () => {
    const { handbackTested } = await H()
    expect(handbackTested(`tested: a -> b\n${R}\ntested: c -> d`)).toEqual({ count: 1, lines: ['a -> b'] })
  })
  test('a duplicate counts once', async () => {
    const { handbackTested } = await H()
    expect(handbackTested(`tested: a -> b\ntested: a -> b\n${R}`).count).toBe(1)
  })
  test('a list item with its body in backticks is read as the body', async () => {
    const { handbackTested } = await H()
    expect(handbackTested(`- \`tested: x\`\n${R}`)).toEqual({ count: 1, lines: ['x'] })
    expect(handbackTested(`* tested: y\n${R}`)).toEqual({ count: 1, lines: ['y'] })
  })
  test('eight lines count 8 and keep six', async () => {
    const { handbackTested } = await H()
    const t = handbackTested(Array.from({ length: 8 }, (_, i) => `tested: n${i} -> ok`).join('\n') + `\n${R}`)
    expect(t.count).toBe(8)
    expect(t.lines).toHaveLength(6)
    expect(t.lines[0]).toBe('n0 -> ok')
  })
  test('a 200-character body is cut to 160', async () => {
    const { handbackTested } = await H()
    expect(handbackTested(`tested: ${'a'.repeat(200)}\n${R}`).lines[0]).toHaveLength(160)
  })
  test('none gives count 0; empty bodies are skipped', async () => {
    const { handbackTested } = await H()
    expect(handbackTested(`I ran the gate.\n${R}`)).toEqual({ count: 0, lines: [] })
    expect(handbackTested(`tested:\ntested:   \n${R}`)).toEqual({ count: 0, lines: [] })
  })
})

const base = {
  redTest: 'none',
  gates: [{ id: 'node', label: 'node run', ok: true }],
  testFiles: ['tests/a.test.ts'],
  testsAdded: 0,
  attempts: 1,
}

describe('MOD-411: testingSection shows the tested lines', () => {
  test('Worker ran follows the test-files line', async () => {
    const { testingSection } = await M()
    const out = testingSection({ ...base, tried: 1, tested: ['tsc -> clean', 'could not run the editor (no display)'] })
    const at = out.findIndex(l => l.startsWith('- Test files changed'))
    expect(out.slice(at + 1, at + 4)).toEqual(['- Worker ran:', '  - tsc -> clean', '  - could not run the editor (no display)'])
    expect(out[at + 4]).toBe('- Fix rounds before hand-back: 1')
  })
  test('empty or absent leaves the output as it was', async () => {
    const { testingSection } = await M()
    const plain = testingSection(base)
    expect(testingSection({ ...base, tested: [] })).toEqual(plain)
    expect(plain.some(l => l.startsWith('- Worker ran'))).toBe(false)
  })
})

describe('MOD-411: the ledger reader fills testedLines', () => {
  test('a verdict row with testedLines; non-strings dropped', async () => {
    const { latestVerdictRow } = await M()
    const row = (extra) => JSON.stringify({ task: 'T-9', verdict: 'verified', attempt: 1, ...extra })
    expect(latestVerdictRow(row({ testedLines: ['a -> b', 3, null, 'c'] }), 'T-9')?.testedLines).toEqual(['a -> b', 'c'])
    expect(latestVerdictRow(row({}), 'T-9')?.testedLines).toBeUndefined()
    expect(latestVerdictRow(row({ testedLines: 'x' }), 'T-9')?.testedLines).toBeUndefined()
  })
})
