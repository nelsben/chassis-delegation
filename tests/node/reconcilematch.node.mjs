// MOD-303: a story is done elsewhere only in a card that names it (issue: or parent:), never on a scope overlap.
import { test, expect, describe } from './kit.mjs'

const lib = () => import('../../hooks/lib/reconcile.ts')
const sub = { number: 353, title: 'Feed story', state: 'OPEN', body: '```scope\nsrc/app/feed.js\n```', subIssues: [{ number: 400, state: 'CLOSED' }] }

describe('MOD-303: doneIn names, never overlaps', () => {
  test('a scope overlap alone is no match and shows the overlapping card', async () => {
    const { reconcileOf, reconcileText } = await lib()
    // MOD-362: with every sub-issue closed it would be childrenDone, so one stays open here
    const r = reconcileOf({ subs: [{ ...sub, subIssues: [{ number: 400, state: 'OPEN' }] }], inFlight: new Set(), merged: [{ id: 'X-1', issue: 713, scope: ['src/app/**'] }] })
    expect(r.done).toEqual([])
    expect(r.noMatch).toEqual([{ number: 353, title: 'Feed story', overlap: 'X-1' }])
    const text = reconcileText(r, 'o/r')
    expect(text.includes('#353 Feed story — no match (scope overlaps X-1)')).toBe(true)
    expect(text.includes("# gh issue close 353 --repo o/r --comment 'not planned'")).toBe(true)
  })
  test('a card that names the issue marks it done', async () => {
    const { reconcileOf } = await lib()
    const r = reconcileOf({ subs: [sub], inFlight: new Set(), merged: [{ id: 'X-2', issue: 353, scope: ['x'] }] })
    expect(r.done).toEqual([{ number: 353, title: 'Feed story', card: 'X-2' }])
  })
  test('a card whose parent is the story is cardsDone only with no sub-issue left open; childrenDone when all are closed (MOD-364)', async () => {
    const { reconcileOf } = await lib()
    const merged = [{ id: 'X-3', parent: 353, scope: ['x'] }]
    const all = reconcileOf({ subs: [sub], inFlight: new Set(), merged })
    expect(all.done).toEqual([])
    expect(all.cardsDone).toEqual([])
    expect(all.childrenDone).toEqual([{ number: 353, title: 'Feed story', total: 1 }])
    const open = { ...sub, subIssues: [{ number: 400, state: 'CLOSED' }, { number: 401, state: 'OPEN' }] }
    const r = reconcileOf({ subs: [open], inFlight: new Set(), merged })
    expect(r.cardsDone).toEqual([])
    expect(r.noMatch.length).toBe(1)
    expect(reconcileOf({ subs: [{ ...sub, subIssues: undefined }], inFlight: new Set(), merged }).cardsDone).toEqual([{ number: 353, title: 'Feed story', cards: [{ id: 'X-3' }] }])
  })
  test('an in-flight card for the story keeps it out of every list', async () => {
    const { reconcileOf } = await lib()
    const r = reconcileOf({ subs: [sub], inFlight: new Set([353]), merged: [{ id: 'X-2', issue: 353, scope: ['x'] }, { id: 'X-1', scope: ['src/app/**'] }] })
    expect([r.done, r.noMatch, r.closedOpen, r.notRead]).toEqual([[], [], [], []])
  })
})
