// MOD-407: the Testing section of a merged card and of the PR body: testingSection, isTestFile, testsAdded,
// markMerged with a section, prBody with a section. Pure.
import { test, expect, describe } from './kit.mjs'

const lib = () => import('../../hooks/lib/mergecmd.ts')

const full = {
  redTest: 'node --no-warnings tests/node/a.node.mjs',
  red: { path: '.delegation/MOD-9/red-1.txt', held: true },
  gates: [
    { id: 'validate', label: 'claude plugin validate', ok: true },
    { id: 'node', label: 'node run', ok: true },
    { id: 'test', label: 'claude plugin test', ok: true },
  ],
  notes: [
    { id: 'validate', ok: true, ms: 200, line: 'Validation passed' },
    { id: 'node', ok: true, ms: 61_400, line: '2074 pass, 0 fail', rerun: 'timeouts' },
    { id: 'test', ok: true, ms: 150_000, line: '88 pass, 0 fail', rerun: 'own' },
  ],
  reused: ['validate'],
  testFiles: ['tests/node/a.node.mjs', 'tests/b.test.ts'],
  testsAdded: 7,
  tried: 1,
  attempts: 2,
}

describe('MOD-407: testingSection', () => {
  test('a full input gives every line in order, word for word', async () => {
    const { testingSection } = await lib()
    expect(testingSection(full)).toEqual([
      '- Planned: node --no-warnings tests/node/a.node.mjs',
      '- Red test: failed before the change (.delegation/MOD-9/red-1.txt)',
      '- Gate validate: pass · Validation passed · 1 s · verify pass reused at merge',
      '- Gate node: pass · 2074 pass, 0 fail · 61 s · run again after timeouts',
      '- Gate test: pass · 88 pass, 0 fail · 2.5 min · green on a second run',
      '- Test files changed: 2 (tests/node/a.node.mjs, tests/b.test.ts); tests added: 7',
      '- Fix rounds before hand-back: 1',
      '- Attempts: 2',
    ])
  })
  test('a gate with no note gives the bare line', async () => {
    const { testingSection } = await lib()
    const out = testingSection({ ...full, notes: [full.notes[1]], reused: [] })
    expect(out).toContain('- Gate validate: pass')
    expect(out).toContain('- Gate test: pass')
  })
  test('times: 61 400 ms is 61 s, 150 000 ms is 2.5 min, 200 ms is 1 s', async () => {
    const { testingSection } = await lib()
    const one = (ms) => testingSection({ ...full, gates: [full.gates[0]], notes: [{ id: 'validate', ok: true, ms }], reused: [] }).find(l => l.startsWith('- Gate'))
    expect(one(61_400)).toBe('- Gate validate: pass · 61 s')
    expect(one(150_000)).toBe('- Gate validate: pass · 2.5 min')
    expect(one(200)).toBe('- Gate validate: pass · 1 s')
  })
  test('a failed gate reads fail', async () => {
    const { testingSection } = await lib()
    const out = testingSection({ ...full, gates: [{ id: 'node', label: 'n', ok: false }], notes: [], reused: [] })
    expect(out).toContain('- Gate node: fail')
  })
  test('10 test files show 8 names and , +2 more', async () => {
    const { testingSection } = await lib()
    const names = Array.from({ length: 10 }, (_, i) => `tests/t${i}.test.ts`)
    const line = testingSection({ ...full, testFiles: names, testsAdded: 0 }).find(l => l.startsWith('- Test files'))
    expect(line).toBe(`- Test files changed: 10 (${names.slice(0, 8).join(', ')}, +2 more)`)
  })
  test('no test files reads none; tests added still shows after it', async () => {
    const { testingSection } = await lib()
    expect(testingSection({ ...full, testFiles: [], testsAdded: 0 })).toContain('- Test files changed: none')
    expect(testingSection({ ...full, testFiles: [], testsAdded: 3 })).toContain('- Test files changed: none; tests added: 3')
  })
  test('tried 0 and attempts 1 add no line', async () => {
    const { testingSection } = await lib()
    const out = testingSection({ ...full, tried: 0, attempts: 1 })
    expect(out.some(l => l.startsWith('- Fix rounds'))).toBe(false)
    expect(out.some(l => l.startsWith('- Attempts'))).toBe(false)
    const none = testingSection({ ...full, attempts: 1 })
    expect(none.some(l => l.startsWith('- Fix rounds'))).toBe(true)
    const { tried: _t, ...noTried } = full
    expect(testingSection({ ...noTried, attempts: 1 }).some(l => l.startsWith('- Fix rounds'))).toBe(false)
  })
  test('redTest none with no red gives Planned: none and Red test: none; an unheld red is not confirmed', async () => {
    const { testingSection } = await lib()
    const { red: _r, ...noRed } = full
    const out = testingSection({ ...noRed, redTest: 'none' })
    expect(out[0]).toBe('- Planned: none')
    expect(out[1]).toBe('- Red test: none')
    expect(testingSection({ ...noRed, redTest: '' })[0]).toBe('- Planned: none')
    expect(testingSection({ ...full, red: { path: 'r.txt', held: false } })[1]).toBe('- Red test: reported at r.txt, not confirmed')
  })
})

describe('MOD-407: isTestFile', () => {
  test('true for test folders and test file names', async () => {
    const { isTestFile } = await lib()
    for (const p of ['tests/node/a.node.mjs', 'test/x.js', 'src/__tests__/a.ts', 'a.test.ts', 'pkg/foo_test.go', 'src/a.spec.js', 'test_x.py', 'lib/test_y.py', 'pkg/sub/tests/z.rb']) expect(isTestFile(p)).toBe(true)
  })
  test('false for contest.ts and docs/testing.md', async () => {
    const { isTestFile } = await lib()
    for (const p of ['hooks/lib/contest.ts', 'docs/testing.md', 'hooks/register.ts', 'latest.ts']) expect(isTestFile(p)).toBe(false)
  })
})

describe('MOD-407: testsAdded', () => {
  test('counts added test, it.each and def test_ lines; not removed or context lines', async () => {
    const { testsAdded } = await lib()
    const diff = [
      'diff --git a/t.mjs b/t.mjs',
      '--- a/t.mjs',
      '+++ b/t.mjs',
      '@@ -1,3 +1,6 @@',
      " test('ctx', () => {})",
      "-test('gone', () => {})",
      "+  test('a', async () => {})",
      '+it.each([1, 2])(',
      '+    def test_x(self):',
      '+  async def test_y():',
      '+const contest = 1',
    ].join('\n')
    expect(testsAdded(diff)).toBe(4)
    expect(testsAdded('')).toBe(0)
  })
})

describe('MOD-407: markMerged with a Testing section', () => {
  const CARD = ['---', 'id: X-1', 'status: queued', '---', '## Why', '', 'Because.', ''].join('\n')
  test('the section sits above ## Review; with no review it is at the end', async () => {
    const { markMerged } = await lib()
    const out = markMerged(CARD, 'fine', ['- Planned: none', '- Red test: none'])
    expect(out.indexOf('## Testing')).toBeGreaterThan(out.indexOf('Because.'))
    expect(out.indexOf('## Testing')).toBeLessThan(out.indexOf('## Review'))
    expect(out).toContain('## Testing\n\n- Planned: none\n- Red test: none\n\n## Review\n\nfine\n')
    const end = markMerged(CARD, undefined, ['- Planned: none'])
    expect(end.endsWith('## Testing\n\n- Planned: none\n')).toBe(true)
    expect(end).toContain('status: merged')
  })
  test('a second call replaces the section and leaves one heading; the review stays', async () => {
    const { markMerged } = await lib()
    const once = markMerged(CARD, 'fine', ['- Planned: a'])
    const twice = markMerged(once, undefined, ['- Planned: b'])
    expect(twice.match(/^## Testing$/gm)).toHaveLength(1)
    expect(twice).toContain('- Planned: b')
    expect(twice).not.toContain('- Planned: a')
    expect(twice).toContain('## Review\n\nfine\n')
    expect(twice.indexOf('## Testing')).toBeLessThan(twice.indexOf('## Review'))
  })
  test('without testing the card is as before; an empty list adds nothing', async () => {
    const { markMerged } = await lib()
    expect(markMerged(CARD, 'ok')).toBe(markMerged(CARD, 'ok', []))
    expect(markMerged(CARD)).not.toContain('## Testing')
  })
  test('cardDiff lets the finish pass a merged card that gained a Testing section', async () => {
    const { markMerged, cardDiff } = await lib()
    expect(cardDiff(markMerged(CARD, 'ok', ['- Planned: none']), CARD)).toEqual([])
    expect(cardDiff(markMerged(CARD, undefined, ['- Planned: none']), CARD)).toEqual([])
  })
})

describe('MOD-407: prBody with a Testing section', () => {
  const base = { body: '## Done when\n\n- It works.\n', verdictLine: 'X-1 attempt 1: consistent', gates: [{ id: 'node', label: 'node', ok: true }], folders: [] }
  test('## Testing follows the gates section; a home path in a line is scrubbed', async () => {
    const { prBody } = await lib()
    const out = prBody({ ...base, testing: ['- Planned: none', '- Red test: reported at /Users/someone/w/red-1.txt, not confirmed'], rebase: 'rebase: kept both' })
    expect(out.indexOf('## Gates')).toBeLessThan(out.indexOf('## Testing'))
    expect(out.indexOf('## Testing')).toBeLessThan(out.indexOf('## Rebase'))
    expect(out).toContain('## Testing\n\n- Planned: none\n')
    expect(out).not.toContain('/Users/someone')
    expect(out).toContain('~/w/red-1.txt')
  })
  test('without testing the body has no Testing heading', async () => {
    const { prBody } = await lib()
    expect(prBody(base)).not.toContain('## Testing')
  })
})
