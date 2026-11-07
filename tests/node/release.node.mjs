// MOD-329: merge --finish releases the blocked cards whose last blocker it lands; tree shows blocked cards. Pure.
import { test, expect, describe } from './kit.mjs'

const card = (id, over = {}) => ({ id, status: 'queued', parent: 7, scope: [`/repo/${id}/**`], blockedBy: [], ...over })
const blocked = (id, blockedBy, over = {}) => card(id, { status: 'blocked', blockedBy, ...over })

describe('MOD-329: releasePlan', () => {
  test('a card blocked only by the merged id is released', async () => {
    const { releasePlan } = await import('../../hooks/lib/blocked.ts')
    expect(releasePlan('OPS-1', [card('OPS-1', { status: 'merged' }), blocked('OPS-2', ['OPS-1'])], new Set())).toEqual([{ id: 'OPS-2', action: 'release' }])
  })

  test('a card also blocked by an open id stays blocked by that id', async () => {
    const { releasePlan } = await import('../../hooks/lib/blocked.ts')
    const cards = [blocked('OPS-2', ['OPS-1', 'OPS-3']), card('OPS-3')]
    expect(releasePlan('OPS-1', cards, new Set())).toEqual([{ id: 'OPS-2', action: 'still', blockers: ['OPS-3'] }])
  })

  test('a blocker already in done counts as gone', async () => {
    const { releasePlan } = await import('../../hooks/lib/blocked.ts')
    const cards = [blocked('OPS-2', ['OPS-1', 'OPS-3']), card('OPS-3')]
    expect(releasePlan('OPS-1', cards, new Set(['OPS-3']))).toEqual([{ id: 'OPS-2', action: 'release' }])
  })

  test('two cards blocked by the same id with overlapping scopes: the lower id is released, the higher waits for it', async () => {
    const { releasePlan } = await import('../../hooks/lib/blocked.ts')
    const cards = [blocked('OPS-10', ['OPS-1'], { scope: ['/repo/x/a.ts'] }), blocked('OPS-9', ['OPS-1'], { scope: ['/repo/x/**'] })]
    expect(releasePlan('OPS-1', cards, new Set())).toEqual([
      { id: 'OPS-9', action: 'release' },
      { id: 'OPS-10', action: 'still', blockers: ['OPS-9'] },
    ])
  })

  test('a released card overlapping an open queued sibling stays blocked by that sibling', async () => {
    const { releasePlan } = await import('../../hooks/lib/blocked.ts')
    const cards = [blocked('OPS-2', ['OPS-1'], { scope: ['/repo/x/**'] }), card('OPS-4', { scope: ['/repo/x/b.ts'] }), card('OPS-5', { scope: ['/repo/y/**'], parent: 8 })]
    expect(releasePlan('OPS-1', cards, new Set())).toEqual([{ id: 'OPS-2', action: 'still', blockers: ['OPS-4'] }])
  })

  test('a card without a parent gets no sibling check', async () => {
    const { releasePlan } = await import('../../hooks/lib/blocked.ts')
    const { parent: _p, ...bare } = blocked('OPS-2', ['OPS-1'], { scope: ['/repo/x/**'] })
    const cards = [bare, card('OPS-4', { scope: ['/repo/x/b.ts'] })]
    expect(releasePlan('OPS-1', cards, new Set())).toEqual([{ id: 'OPS-2', action: 'release' }])
  })
})

describe('MOD-329: rewriteBlocked', () => {
  const text = '---\nid: OPS-2\nstatus: blocked\nblocked_by: [OPS-1, OPS-3]\nscope: [a]\n---\nbody status: blocked\n'

  test('no blockers: queued, and blocked_by dropped', async () => {
    const { rewriteBlocked } = await import('../../hooks/lib/blocked.ts')
    expect(rewriteBlocked(text)).toBe('---\nid: OPS-2\nstatus: queued\nscope: [a]\n---\nbody status: blocked\n')
  })

  test('with blockers: stays blocked, blocked_by rewritten', async () => {
    const { rewriteBlocked } = await import('../../hooks/lib/blocked.ts')
    expect(rewriteBlocked(text, ['OPS-3'])).toBe('---\nid: OPS-2\nstatus: blocked\nblocked_by: [OPS-3]\nscope: [a]\n---\nbody status: blocked\n')
  })

  test('a queued card comes back unchanged', async () => {
    const { rewriteBlocked } = await import('../../hooks/lib/blocked.ts')
    const q = '---\nid: OPS-2\nstatus: queued\nscope: [a]\n---\nbody\n'
    expect(rewriteBlocked(q)).toBe(q)
    expect(rewriteBlocked(q, ['OPS-3'])).toBe(q)
  })
})

describe('MOD-329: tree shows blocked cards', () => {
  const json = { number: 7, title: 'Epic', state: 'OPEN', labels: [{ name: 'type:epic' }], body: '', subIssues: [{ number: 11, title: 'A', state: 'OPEN' }, { number: 12, title: 'B', state: 'OPEN' }] }

  test('a blocked card gives a blocked row and a blocked count', async () => {
    const { treeOf, treeText } = await import('../../hooks/lib/tree.ts')
    const cards = [{ id: 'OPS-1', issue: 11, status: 'queued' }, { id: 'OPS-2', issue: 12, status: 'blocked', blockedBy: ['OPS-1', 'OPS-3'] }]
    const t = treeOf(json, cards, new Set())
    expect(t.counts.blocked).toBe(1)
    const out = treeText(t)
    expect(out).toContain('blocked #12 B OPS-2 (by OPS-1, OPS-3)')
    expect(out).toContain('0 done · 1 in flight · 0 planned · 1 blocked')
  })

  test('no blocked card: the counts line is as before', async () => {
    const { treeOf, treeText } = await import('../../hooks/lib/tree.ts')
    const out = treeText(treeOf(json, [{ id: 'OPS-1', issue: 11, status: 'queued' }], new Set()))
    expect(out).toContain('0 done · 1 in flight · 1 planned')
    expect(out.includes('blocked')).toBe(false)
  })
})
