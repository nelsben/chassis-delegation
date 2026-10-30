// MOD-190: /delegation land, the pure half: the arguments and the issue body.
import { test, expect, describe } from './kit.mjs'

const ABS = `/${'Users'}/someone/x.ts`
const lib = () => import('../../hooks/lib/land.ts')
const { redact } = await import('../../hooks/lib/redact.ts')

describe('MOD-190: parseLandArgs', () => {
  test('each of the six types is taken', async () => {
    const { parseLandArgs } = await lib()
    for (const t of ['feature', 'epic', 'story', 'task', 'bug', 'spike']) expect(parseLandArgs(`${t} Something broke`)).toEqual({ type: t, title: 'Something broke', paths: [] })
  })
  test('a double-quoted title is one title', async () => {
    const { parseLandArgs } = await lib()
    expect(parseLandArgs('bug "Export drops the last row" --parent 7')).toEqual({ type: 'bug', title: 'Export drops the last row', parent: 7, paths: [] })
  })
  test('--parent, --paths and --note', async () => {
    const { parseLandArgs } = await lib()
    expect(parseLandArgs('task Fix it --parent 12 --paths src/a.ts,docs/** --note "seen in the dashboard"')).toEqual({ type: 'task', title: 'Fix it', parent: 12, paths: ['src/a.ts', 'docs/**'], note: 'seen in the dashboard' })
    expect(parseLandArgs('story A b --note two words here').note).toBe('two words here')
  })
  test('a bad type, a missing title and a bad parent are refused with the usage line', async () => {
    const { parseLandArgs } = await lib()
    for (const bad of ['chore Do it', 'bug', '', 'bug "  "', 'bug T --parent 0', 'bug T --parent x', 'bug T --parent 1.5', 'bug T --parent -2', 'bug T --parent']) {
      const r = parseLandArgs(bad)
      expect('error' in r).toBe(true)
      expect(r.error).toContain('feature, epic, story, task, bug, spike')
      expect(r.error.includes('\n')).toBe(false)
    }
  })
})

describe('MOD-190: landedBody', () => {
  test('the scope block is present with paths and absent without', async () => {
    const { landedBody } = await lib()
    const withPaths = landedBody({ paths: ['src/a.ts', 'docs/**'], cards: [], defaultBranch: 'main' })
    expect(withPaths).toContain('## Scope\n\n```scope\nsrc/a.ts\ndocs/**\n```')
    const without = landedBody({ paths: [], cards: [], defaultBranch: 'main' })
    expect(without.includes('## Scope')).toBe(false)
    expect(without.includes('```')).toBe(false)
  })
  test('the note leads, the open cards are listed, none otherwise', async () => {
    const { landedBody } = await lib()
    const b = landedBody({ note: 'Seen twice.', paths: [], cards: [{ id: 'MOD-1', title: 'First' }, { id: 'MOD-2', title: 'Second' }], defaultBranch: 'main' })
    expect(b.startsWith('Seen twice.')).toBe(true)
    expect(b).toContain('## Landed from')
    expect(b).toContain('- MOD-1 First\n- MOD-2 Second')
    expect(b).toContain('main')
    expect(landedBody({ paths: [], cards: [], defaultBranch: 'main' })).toContain('none')
  })
  test('an absolute path in the note is scrubbed by the redact helper', async () => {
    const { landedBody } = await lib()
    const body = landedBody({ note: `See ${ABS}`, paths: [], cards: [], defaultBranch: 'main' })
    expect(redact(body, {})).toContain('See <home>/x.ts')
    expect(redact(body, {}).includes(ABS)).toBe(false)
  })
})

describe('MOD-190: open cards, parent hint, slug file', () => {
  test('openCards drops merged cards and cards with an accepted or merged ledger row', async () => {
    const { openCards, doneTasks } = await lib()
    const done = doneTasks('{"task":"A-2","kind":"accepted"}\nnot json\n{"task":"A-3","how":"merged"}\n{"task":"A-4","kind":"spawn"}')
    const cards = [1, 2, 3, 4].map(n => ({ id: `A-${n}`, title: `t${n}`, status: n === 1 ? 'merged' : 'queued', parent: undefined, scope: [] }))
    expect(openCards(cards, done).map(c => c.id)).toEqual(['A-4'])
  })
  test('parentHint names the parent of an open card whose scope holds a path', async () => {
    const { parentHint } = await lib()
    const cards = [{ id: 'A-1', title: 't', status: 'queued', parent: '9', scope: ['src/export/**'] }, { id: 'A-2', title: 't', status: 'queued', parent: undefined, scope: ['docs/**'] }]
    expect(parentHint(['docs/a.md'], cards)).toBe(undefined)
    expect(parentHint(['src/export/a.ts'], cards)).toEqual({ parent: 9, card: 'A-1' })
  })
  test('freeName adds -2, -3', async () => {
    const { freeName } = await lib()
    expect(freeName('fix-it', new Set())).toBe('fix-it.md')
    expect(freeName('fix-it', new Set(['fix-it.md']))).toBe('fix-it-2.md')
    expect(freeName('fix-it', new Set(['fix-it.md', 'fix-it-2.md']))).toBe('fix-it-3.md')
  })
})
