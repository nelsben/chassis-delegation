// MOD-328: a card whose scope overlaps an open sibling (or that names blockedBy) is written blocked,
// not refused; dispatch names the blockers. Pure: no engine.
import { test, expect, describe } from './kit.mjs'

const ctx = (over = {}) => ({
  domains: ['ops'],
  gateIds: ['test'],
  names: [],
  spendByTier: { economy: 2, standard: 6, frontier: 15 },
  ...over,
})
const input = (over = {}) => ({
  title: 'Export the report',
  why: 'The report cannot be exported yet.',
  doneWhen: ['export() returns the report'],
  scope: ['/repo/src/export/a.ts'],
  redTest: 'none',
  ...over,
})
const fieldOf = (text, key) => (text.split('\n').find(l => l.startsWith(`${key}:`)) ?? '')

describe('MOD-328: blockersOf', () => {
  test('explicit ids first, then every overlapping sibling; the disjoint one is neither', async () => {
    const { blockersOf } = await import('../../hooks/lib/blocked.ts')
    const r = blockersOf(['src/export/a.ts'], [{ id: 'OPS-3', scope: ['src/export/**'] }, { id: 'OPS-4', scope: ['lib/**'] }], ['OPS-9'])
    expect(r.blockers).toEqual(['OPS-9', 'OPS-3'])
    expect([...r.overlapping]).toEqual(['OPS-3'])
  })

  test('an explicit id that is also an overlapping sibling appears once', async () => {
    const { blockersOf } = await import('../../hooks/lib/blocked.ts')
    const r = blockersOf(['src/export/a.ts'], [{ id: 'OPS-3', scope: ['src/export/**'] }], ['OPS-3', 'OPS-3'])
    expect(r.blockers).toEqual(['OPS-3'])
  })

  test('nothing explicit and nothing overlapping: no blockers', async () => {
    const { blockersOf } = await import('../../hooks/lib/blocked.ts')
    const r = blockersOf(['src/a.ts'], [{ id: 'OPS-4', scope: ['lib/**'] }], [])
    expect(r.blockers).toEqual([])
    expect(r.overlapping.size).toBe(0)
  })

  test('blockedLine names the blockers and the release', async () => {
    const { blockedLine } = await import('../../hooks/lib/blocked.ts')
    expect(blockedLine('OPS-5', ['OPS-3', 'OPS-4'])).toBe('OPS-5 is blocked by OPS-3, OPS-4; merge --finish of its last blocker releases it (or set status: queued to dispatch it now)')
  })
})

describe('MOD-328: cardFromFields writes a blocked card', () => {
  const tree = { parent: 7 }
  const siblings = [{ id: 'OPS-3', scope: ['/repo/src/export/**'] }, { id: 'OPS-4', scope: ['/repo/lib/**'] }]

  test('an overlapping open sibling blocks the card; its scope is not forbidden, the disjoint sibling scope is', async () => {
    const { cardFromFields } = await import('../../hooks/lib/card.ts')
    const r = cardFromFields(input(tree), ctx({ siblings }))
    expect('error' in r).toBe(false)
    const lines = r.text.split('\n')
    const at = lines.indexOf('status: blocked')
    expect(at).toBeGreaterThan(-1)
    expect(lines[at + 1]).toBe('blocked_by: [OPS-3]')
    expect(r.text).toContain('status: blocked')
    expect(lines.includes('status: queued')).toBe(false)
    expect(fieldOf(r.text, 'forbid')).toBe('forbid: [/repo/lib/**]')
    expect(r.forbid).toEqual(['/repo/lib/**'])
    expect(r.blockers).toEqual(['OPS-3'])
  })

  test('no overlap and no blockedBy: the card is as before (queued, no blocked_by)', async () => {
    const { cardFromFields } = await import('../../hooks/lib/card.ts')
    const r = cardFromFields(input(tree), ctx({ siblings: [{ id: 'OPS-4', scope: ['/repo/lib/**'] }] }))
    expect('error' in r).toBe(false)
    expect(r.text).toContain('\nstatus: queued\n')
    expect(r.text.includes('blocked_by')).toBe(false)
    expect(r.text.includes('status: blocked')).toBe(false)
    expect(fieldOf(r.text, 'forbid')).toBe('forbid: [/repo/lib/**]')
    expect(r.blockers ?? []).toEqual([])
  })

  test('blockedBy #12 resolves through the board to its card id', async () => {
    const { cardFromFields } = await import('../../hooks/lib/card.ts')
    const board = [{ id: 'OPS-12', status: 'queued', issue: 12 }, { id: 'OPS-13', status: 'queued', issue: 13 }]
    const r = cardFromFields(input({ blockedBy: ['#12', '13', 'OPS-12'] }), ctx({ board }))
    expect('error' in r).toBe(false)
    expect(r.text).toContain('\nstatus: blocked\nblocked_by: [OPS-12, OPS-13]\n')
    expect(r.blockers).toEqual(['OPS-12', 'OPS-13'])
  })

  test('an issue no board card names refuses', async () => {
    const { cardFromFields } = await import('../../hooks/lib/card.ts')
    const r = cardFromFields(input({ blockedBy: ['#99'] }), ctx({ board: [{ id: 'OPS-12', status: 'queued', issue: 12 }] }))
    expect(r).toEqual({ error: 'blockedBy #99: no card on the board names issue 99' })
  })

  test('an issue two board cards name refuses, naming the count and ids', async () => {
    const { cardFromFields } = await import('../../hooks/lib/card.ts')
    const board = [{ id: 'OPS-12', status: 'queued', issue: 12 }, { id: 'OPS-14', status: 'queued', issue: 12 }]
    const r = cardFromFields(input({ blockedBy: [12] }), ctx({ board }))
    expect(r).toEqual({ error: 'blockedBy #12: 2 cards name issue 12 (OPS-12, OPS-14)' })
  })

  test('a task id that is not on the board refuses', async () => {
    const { cardFromFields } = await import('../../hooks/lib/card.ts')
    const r = cardFromFields(input({ blockedBy: ['OPS-77'] }), ctx({ board: [{ id: 'OPS-12', status: 'queued' }] }))
    expect(r).toEqual({ error: 'blockedBy OPS-77: no card OPS-77 on the board' })
  })

  test('a blocker already merged (status or the ledger done set) is dropped with a note; the card is queued when none is left', async () => {
    const { cardFromFields } = await import('../../hooks/lib/card.ts')
    const board = [{ id: 'OPS-12', status: 'merged' }, { id: 'OPS-13', status: 'queued' }]
    const a = cardFromFields(input({ blockedBy: ['OPS-12'] }), ctx({ board }))
    expect('error' in a).toBe(false)
    expect(a.text).toContain('\nstatus: queued\n')
    expect(a.text.includes('blocked_by')).toBe(false)
    expect(a.notes).toEqual(['note: blockedBy OPS-12 already merged; not a blocker'])
    const b = cardFromFields(input({ blockedBy: ['OPS-13', 'OPS-12'] }), ctx({ board, done: new Set(['OPS-13']) }))
    expect('error' in b).toBe(false)
    expect(b.notes).toEqual(['note: blockedBy OPS-13 already merged; not a blocker', 'note: blockedBy OPS-12 already merged; not a blocker'])
  })

  test('the card tool schema describes blockedBy', async () => {
    const { CARD_TOOL } = await import('../../hooks/lib/card.ts')
    expect(CARD_TOOL.inputSchema.properties.blockedBy.description).toBe('task ids or issue numbers this card waits on; the card is written blocked, with no brief or worktree, until they merge')
  })
})

describe('MOD-328: dispatch reads a blocked card', () => {
  const text = (blockedBy) => `---\nid: OPS-5\ntitle: t\ndomain: ops\nstatus: blocked\n${blockedBy}scope: [a]\nforbid: []\nred_test: none\ngate: test\n---\nbody\n`

  test('parseCard reads blocked_by; checkStatus answers with the blocked line', async () => {
    const { parseCard, checkStatus } = await import('../../hooks/lib/dispatch.ts')
    const { blockedLine } = await import('../../hooks/lib/blocked.ts')
    const card = parseCard(text('blocked_by: [OPS-3, OPS-4]\n'))
    expect(card.blockedBy).toEqual(['OPS-3', 'OPS-4'])
    expect(checkStatus(card)).toBe(blockedLine('OPS-5', ['OPS-3', 'OPS-4']))
  })

  test('a blocked card with no blocked_by says to set status: queued', async () => {
    const { parseCard, checkStatus } = await import('../../hooks/lib/dispatch.ts')
    const card = parseCard(text(''))
    expect(card.blockedBy).toEqual([])
    expect(checkStatus(card)).toBe('OPS-5 is blocked; set status: queued to dispatch it')
  })
})
