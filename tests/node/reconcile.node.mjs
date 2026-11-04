// MOD-288: tree reconcile, the pure half: the three lists, the rows, the close lines, the args and the landed-file lookup.
import { test, expect, describe } from './kit.mjs'

const lib = () => import('../../hooks/lib/reconcile.ts')
const merged = [
  { id: 'MOD-9', pr: 41, scope: ['hooks/lib/export.ts', 'tests/export.test.ts'] },
  { id: 'MOD-3', pr: 12, scope: ['docs/**'] },
]
const subs = [
  { number: 61, title: 'Fix export header', state: 'OPEN', body: 'x\n\n```scope\nhooks/lib/export.ts\n```\n' },
  { number: 62, title: 'Closed story', state: 'CLOSED', subIssues: [{ number: 70, state: 'OPEN' }, { number: 71, state: 'CLOSED' }, { number: 72, state: 'OPEN' }] },
  { number: 63, title: 'Nothing like it', state: 'OPEN', body: '```scope\nsrc/other/**\n```' },
  { number: 64, title: 'In flight one', state: 'OPEN', body: '```scope\nhooks/lib/export.ts\n```' },
  { number: 65, title: 'Closed and clean', state: 'CLOSED', subIssues: [{ number: 73, state: 'CLOSED' }] },
]

describe('MOD-288: reconcileOf', () => {
  test('an open sub-issue overlapping a merged card is listed as done elsewhere', async () => {
    const { reconcileOf } = await lib()
    const r = reconcileOf({ subs, inFlight: new Set([64]), merged })
    expect(r.done).toEqual([{ number: 61, title: 'Fix export header', card: 'MOD-9', pr: 41 }])
  })
  test('a closed sub-issue with an open child is listed, with the open children', async () => {
    const { reconcileOf } = await lib()
    const r = reconcileOf({ subs, inFlight: new Set([64]), merged })
    expect(r.closedOpen).toEqual([{ number: 62, title: 'Closed story', open: [70, 72] }])
  })
  test('an open sub-issue with no overlap and no card is no match', async () => {
    const { reconcileOf } = await lib()
    const r = reconcileOf({ subs, inFlight: new Set([64]), merged })
    expect(r.noMatch).toEqual([{ number: 63, title: 'Nothing like it' }])
  })
  test('an in-flight card issue is in no list', async () => {
    const { reconcileOf } = await lib()
    const r = reconcileOf({ subs, inFlight: new Set([64]), merged })
    const all = [...r.done, ...r.closedOpen, ...r.noMatch].map(x => x.number)
    expect(all.includes(64)).toBe(false)
  })
  test('a sub-issue with no scope block is no match; one not read is left out and listed', async () => {
    const { reconcileOf } = await lib()
    const r = reconcileOf({ subs: [{ number: 5, title: 'Bare', state: 'OPEN', body: 'no block' }, { number: 6, title: 'Late', state: 'OPEN', read: false }], inFlight: new Set(), merged })
    expect(r.noMatch).toEqual([{ number: 5, title: 'Bare' }])
    expect(r.notRead).toEqual([6])
  })
})

describe('MOD-288: reconcileText', () => {
  test('rows, then the close lines for done and the commented ones for no match', async () => {
    const { reconcileOf, reconcileText } = await lib()
    const r = reconcileOf({ subs, inFlight: new Set([64]), merged })
    const lines = reconcileText(r, 'o/r').split('\n')
    expect(lines).toContain('#61 Fix export header — done in MOD-9 (#41)')
    expect(lines).toContain('#62 Closed story — closed, 2 children open (#70, #72)')
    expect(lines).toContain('#63 Nothing like it — no match')
    expect(lines).toContain("gh issue close 61 --repo o/r --comment 'done in MOD-9 (#41)'")
    expect(lines).toContain("# gh issue close 63 --repo o/r --comment 'not planned'")
    expect(lines.some(l => l.startsWith('gh issue close 62') || l.startsWith('gh issue close 63'))).toBe(false)
  })
  test('not read rows say run again', async () => {
    const { reconcileText } = await lib()
    const t = reconcileText({ done: [], closedOpen: [], noMatch: [], notRead: [8, 9] }, 'o/r')
    expect(t).toContain('#8 — not read: run again')
  })
})

describe('MOD-288: args and landed files', () => {
  test('parseReconcileArgs', async () => {
    const { parseReconcileArgs } = await lib()
    expect(parseReconcileArgs('12')).toEqual({ issue: 12, confirm: false })
    expect(parseReconcileArgs(' 12 --confirm ')).toEqual({ issue: 12, confirm: true })
    expect('error' in parseReconcileArgs('')).toBe(true)
    expect('error' in parseReconcileArgs('x')).toBe(true)
  })
  test('landedFor finds the file recording the issue and skips one already closed', async () => {
    const { landedFor } = await lib()
    const files = [
      { name: 'a.md', text: 'body\nissue: #7 https://x/7\n' },
      { name: 'b.md', text: 'body\nissue: #8 https://x/8\nclosed: 2026-01-01T00:00:00.000Z\n' },
    ]
    expect(landedFor(files, 7)).toBe('a.md')
    expect(landedFor(files, 8)).toBeUndefined()
    expect(landedFor(files, 9)).toBeUndefined()
  })
})
