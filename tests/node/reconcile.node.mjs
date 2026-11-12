// MOD-288: tree reconcile, the pure half: the three lists, the rows, the close lines, the args and the landed-file lookup.
import { test, expect, describe } from './kit.mjs'

const lib = () => import('../../hooks/lib/reconcile.ts')
const merged = [
  { id: 'MOD-9', pr: 41, issue: 61, scope: ['hooks/lib/export.ts', 'tests/export.test.ts'] },
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
  test('an open sub-issue named by a merged card is listed as done elsewhere', async () => {
    const { reconcileOf } = await lib()
    const r = reconcileOf({ subs, inFlight: new Set([64]), merged })
    expect(r.done).toEqual([{ number: 61, title: 'Fix export header', card: 'MOD-9', pr: 41 }])
  })
  test('a closed sub-issue with an open child is listed, with the open children', async () => {
    const { reconcileOf } = await lib()
    const r = reconcileOf({ subs, inFlight: new Set([64]), merged })
    expect(r.closedOpen).toEqual([{ number: 62, title: 'Closed story', open: [70, 72] }])
  })
  test('an open sub-issue with no card is no match; a scope overlap alone is shown, not done', async () => {
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
    const t = reconcileText({ done: [], childrenDone: [], cardsDone: [], openCards: [], closedOpen: [], noMatch: [], notRead: [8, 9] }, 'o/r')
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

describe('MOD-340: mergedCards', () => {
  const c = (id, status, scope, extra = {}) => ({ id, status, scope, ...extra })
  const row = (task, extra = {}) => ({ kind: 'merged', task, ...extra })
  test('a ledger row with its card gives the row pr and the card issue', async () => {
    const { mergedCards } = await lib()
    expect(mergedCards([row('A-1', { pr: 7 })], [c('A-1', 'merged', ['a/**'], { issue: 5 })])).toEqual([{ id: 'A-1', scope: ['a/**'], pr: 7, issue: 5 }])
  })
  test('a merged card with no row counts, with issue and parent and no pr', async () => {
    const { mergedCards } = await lib()
    expect(mergedCards([], [c('A-2', 'merged', ['b/x.ts'], { issue: 6, parent: 3 })])).toEqual([{ id: 'A-2', scope: ['b/x.ts'], issue: 6, parent: 3 }])
  })
  test('a merged card with an empty scope is skipped', async () => {
    const { mergedCards } = await lib()
    expect(mergedCards([], [c('A-3', 'merged', [])])).toEqual([])
  })
  test('a queued card is not merged', async () => {
    const { mergedCards } = await lib()
    expect(mergedCards([], [c('A-4', 'queued', ['c/**'])])).toEqual([])
  })
  test('only the word merged counts', async () => {
    const { mergedCards } = await lib()
    expect(mergedCards([], [c('A-5', 'done', ['c/**'])])).toEqual([])
  })
  test('a card the ledger named appears once, then the card-only one', async () => {
    const { mergedCards } = await lib()
    const r = mergedCards([row('A-1')], [c('A-1', 'merged', ['a/**']), c('A-2', 'merged', ['b/**'])])
    expect(r.map(m => m.id)).toEqual(['A-1', 'A-2'])
  })
  test('ledger rows come newest first', async () => {
    const { mergedCards } = await lib()
    const r = mergedCards([row('A-1'), row('A-6')], [c('A-1', 'merged', ['a/**']), c('A-6', 'merged', ['f/**'])])
    expect(r.map(m => m.id)).toEqual(['A-6', 'A-1'])
  })
  test('a row with no card takes the files of its rows as scope', async () => {
    const { mergedCards } = await lib()
    expect(mergedCards([row('A-7'), { kind: 'report', task: 'A-7', files: ['d/y.ts'] }], [])).toEqual([{ id: 'A-7', scope: ['d/y.ts'] }])
  })
})

describe('MOD-362: childrenDone and root', () => {
  const none = new Set()
  const closedKids = [{ number: 80, state: 'CLOSED' }, { number: 81, state: 'CLOSED' }]
  const sub = (extra = {}) => ({ number: 70, title: 'Story', state: 'OPEN', subIssues: closedKids, ...extra })
  const run = (subs, extra = {}) => lib().then(({ reconcileOf }) => reconcileOf({ subs, inFlight: none, merged: [], ...extra }))
  test('an open sub-issue with two closed sub-issues and no card is childrenDone', async () => {
    expect(await run([sub()])).toEqual({ done: [], childrenDone: [{ number: 70, title: 'Story', total: 2 }], cardsDone: [], openCards: [], closedOpen: [], noMatch: [], notRead: [] })
  })
  test('one sub-issue open, or none: noMatch', async () => {
    const open = await run([sub({ subIssues: [closedKids[0], { number: 81, state: 'OPEN' }] })])
    expect(open).toEqual({ done: [], childrenDone: [], cardsDone: [], openCards: [], closedOpen: [], noMatch: [{ number: 70, title: 'Story' }], notRead: [] })
    const bare = await run([sub({ subIssues: [] })])
    expect(bare.noMatch).toEqual([{ number: 70, title: 'Story' }])
    expect(bare.childrenDone).toEqual([])
  })
  test('in openParents: openCards with the ids of the open cards under it', async () => {
    const r = await run([sub()], { openParents: new Map([[70, ['B-2']]]) })
    expect(r).toEqual({ done: [], childrenDone: [], cardsDone: [], openCards: [{ number: 70, title: 'Story', cards: ['B-2'] }], closedOpen: [], noMatch: [], notRead: [] })
  })
  test('a merged card naming it as parent, under closed sub-issues: childrenDone, not done (MOD-364)', async () => {
    const r = await run([sub()], { merged: [{ id: 'MOD-1', parent: 70, scope: ['a'] }] })
    expect(r).toEqual({ done: [], childrenDone: [{ number: 70, title: 'Story', total: 2 }], cardsDone: [], openCards: [], closedOpen: [], noMatch: [], notRead: [] })
  })
  test('in flight, and read false: as today', async () => {
    expect(await run([sub()], { inFlight: new Set([70]) })).toEqual({ done: [], childrenDone: [], cardsDone: [], openCards: [], closedOpen: [], noMatch: [], notRead: [] })
    expect(await run([sub({ read: false })])).toEqual({ done: [], childrenDone: [], cardsDone: [], openCards: [], closedOpen: [], noMatch: [], notRead: [70] })
  })
  const root = { number: 50, title: 'Epic', state: 'OPEN' }
  test('root with every sub-issue closed has after empty', async () => {
    const r = await run([{ number: 70, title: 'A', state: 'CLOSED' }, { number: 71, title: 'B', state: 'closed' }], { root })
    expect(r.root).toEqual({ number: 50, title: 'Epic', total: 2, after: [] })
  })
  test('root after lists done and childrenDone ascending', async () => {
    const r = await run([sub({ number: 72 }), { number: 71, title: 'D', state: 'OPEN', subIssues: [] }, { number: 69, title: 'C', state: 'CLOSED' }], { root, merged: [{ id: 'MOD-2', issue: 71, scope: ['a'] }] })
    expect(r.root).toEqual({ number: 50, title: 'Epic', total: 3, after: [71, 72] })
  })
  test('no root when something blocks it', async () => {
    const closed = { number: 69, title: 'C', state: 'CLOSED' }
    expect((await run([closed, { number: 71, title: 'N', state: 'OPEN', subIssues: [] }], { root })).root).toBeUndefined()
    expect((await run([closed, { number: 71, title: 'N', state: 'OPEN', read: false }], { root })).root).toBeUndefined()
    expect((await run([closed, { number: 71, title: 'F', state: 'OPEN' }], { root, inFlight: new Set([71]) })).root).toBeUndefined()
    expect((await run([closed, { number: 72, title: 'X', state: 'CLOSED', subIssues: [{ number: 90, state: 'OPEN' }] }], { root })).root).toBeUndefined()
    expect((await run([closed], { root: { ...root, state: 'CLOSED' } })).root).toBeUndefined()
    expect((await run([closed], { root, inFlight: new Set([50]) })).root).toBeUndefined()
    expect((await run([closed], { root, openParents: new Map([[50, ['B-1']]]) })).root).toBeUndefined()
    expect((await run([], { root })).root).toBeUndefined()
    expect((await run([closed])).root).toBeUndefined()
  })
  test('a sub-issue with a partial list is noMatch; a partial root gives no root', async () => {
    const r = await run([sub({ partial: true })])
    expect(r).toEqual({ done: [], childrenDone: [], cardsDone: [], openCards: [], closedOpen: [], noMatch: [{ number: 70, title: 'Story' }], notRead: [] })
    expect((await run([{ number: 69, title: 'C', state: 'CLOSED' }], { root: { ...root, partial: true } })).root).toBeUndefined()
  })
  test('reconcileText: row order, root row, counts line, close lines', async () => {
    const { reconcileText } = await lib()
    const r = {
      done: [{ number: 61, title: 'Fix', card: 'MOD-9', pr: 41 }],
      childrenDone: [{ number: 72, title: 'Story', total: 2 }],
      cardsDone: [], openCards: [],
      closedOpen: [{ number: 62, title: 'Closed story', open: [70] }],
      noMatch: [{ number: 63, title: 'Odd' }],
      notRead: [64],
      root: { number: 50, title: 'Epic', total: 4, after: [61, 72] },
    }
    expect(reconcileText(r, 'o/r').split('\n')).toEqual([
      '#61 Fix — done in MOD-9 (#41)',
      '#72 Story — open, all 2 sub-issues closed',
      '#62 Closed story — closed, 1 children open (#70)',
      '#63 Odd — no match',
      '#64 — not read: run again',
      '#50 Epic — open, all 4 sub-issues closed once the closes above run',
      '1 done elsewhere · 2 open with every sub-issue closed · 1 closed with open children · 1 no match',
      '',
      "gh issue close 61 --repo o/r --comment 'done in MOD-9 (#41)'",
      "gh issue close 72 --repo o/r --comment 'all 2 sub-issues done'",
      "gh issue close 50 --repo o/r --comment 'all 4 sub-issues done'",
      "# gh issue close 63 --repo o/r --comment 'not planned'",
    ])
    const plain = reconcileText({ ...r, done: [], childrenDone: [], cardsDone: [], openCards: [], closedOpen: [], noMatch: [], notRead: [], root: { number: 50, title: 'Epic', total: 1, after: [] } }, 'o/r').split('\n')
    expect(plain[0]).toBe('#50 Epic — open, all 1 sub-issues closed')
    expect(plain[1]).toBe('0 done elsewhere · 1 open with every sub-issue closed · 0 closed with open children · 0 no match')
  })
})

describe('MOD-364: a card that names a sub-issue only as parent', () => {
  const empty = { done: [], childrenDone: [], cardsDone: [], openCards: [], closedOpen: [], noMatch: [], notRead: [] }
  const sub = (extra = {}) => ({ number: 70, title: 'Story', state: 'OPEN', ...extra })
  const run = (subs, extra = {}) => lib().then(({ reconcileOf }) => reconcileOf({ subs, inFlight: new Set(), merged: [], ...extra }))
  const closedKids = [{ number: 80, state: 'CLOSED' }, { number: 81, state: 'CLOSED' }]

  test('no sub-issues and one merged card naming it as parent: cardsDone with that card, not done', async () => {
    const r = await run([sub()], { merged: [{ id: 'A-1', parent: 70, scope: ['a'] }] })
    expect(r).toEqual({ ...empty, cardsDone: [{ number: 70, title: 'Story', cards: [{ id: 'A-1' }] }] })
  })
  test('three merged cards naming it as parent: all three in merged order, a pr only where it has one', async () => {
    const merged = [{ id: 'A-3', parent: 70, scope: ['a'] }, { id: 'A-2', parent: 70, pr: 9, scope: ['b'] }, { id: 'A-1', parent: 70, scope: ['c'] }]
    expect(await run([sub()], { merged })).toEqual({ ...empty, cardsDone: [{ number: 70, title: 'Story', cards: [{ id: 'A-3' }, { id: 'A-2', pr: 9 }, { id: 'A-1' }] }] })
  })
  test('an open card under it (openParents): openCards with its ids, even when not read', async () => {
    const merged = [{ id: 'A-1', parent: 70, scope: ['a'] }]
    const openParents = new Map([[70, ['B-2']]])
    expect(await run([sub()], { merged, openParents })).toEqual({ ...empty, openCards: [{ number: 70, title: 'Story', cards: ['B-2'] }] })
    expect(await run([sub({ read: false })], { merged, openParents })).toEqual({ ...empty, openCards: [{ number: 70, title: 'Story', cards: ['B-2'] }] })
  })
  test('a merged card whose issue is the sub-issue, with an open card naming it as parent: openCards, not done', async () => {
    const r = await run([sub()], { merged: [{ id: 'MOD-9', issue: 70, scope: ['a'] }], openParents: new Map([[70, ['B-2']]]) })
    expect(r).toEqual({ ...empty, openCards: [{ number: 70, title: 'Story', cards: ['B-2'] }] })
  })
  test('two closed sub-issues and a merged parent card: childrenDone; one open sub-issue: noMatch; partial: noMatch', async () => {
    const merged = [{ id: 'A-1', parent: 70, scope: ['a'] }]
    expect(await run([sub({ subIssues: closedKids })], { merged })).toEqual({ ...empty, childrenDone: [{ number: 70, title: 'Story', total: 2 }] })
    expect(await run([sub({ subIssues: [closedKids[0], { number: 81, state: 'OPEN' }] })], { merged })).toEqual({ ...empty, noMatch: [{ number: 70, title: 'Story' }] })
    expect(await run([sub({ subIssues: closedKids, partial: true })], { merged })).toEqual({ ...empty, noMatch: [{ number: 70, title: 'Story' }] })
  })
  test('the root: a sub-issue in cardsDone or openCards gives no root', async () => {
    const root = { number: 50, title: 'Epic', state: 'OPEN' }
    expect((await run([sub()], { root, merged: [{ id: 'A-1', parent: 70, scope: ['a'] }] })).root).toBeUndefined()
    expect((await run([sub()], { root, openParents: new Map([[70, ['B-2']]]) })).root).toBeUndefined()
  })
  test('cardsComment: one card with a pr, one without, five, six', async () => {
    const { cardsComment } = await lib()
    expect(cardsComment([{ id: 'A-1', pr: 7 }])).toBe('done in A-1 (#7)')
    expect(cardsComment([{ id: 'A-1' }])).toBe('done in A-1')
    expect(cardsComment(['A-1', 'A-2', 'A-3', 'A-4', 'A-5'].map(id => ({ id })))).toBe('done in A-1, A-2, A-3, A-4, A-5')
    expect(cardsComment(['A-1', 'A-2', 'A-3', 'A-4', 'A-5', 'A-6'].map(id => ({ id })))).toBe('done in A-1, A-2, A-3, A-4, A-5, +1 more')
  })
  test('reconcileText: row order, the two new row forms in singular and plural, the id cut at three, the counts segments, the close block order', async () => {
    const { reconcileText } = await lib()
    const r = {
      done: [{ number: 61, title: 'Fix', card: 'MOD-9', pr: 41 }],
      childrenDone: [{ number: 72, title: 'Story', total: 2 }],
      cardsDone: [{ number: 71, title: 'Parse', cards: [{ id: 'A-1', pr: 3 }, { id: 'A-2' }] }, { number: 74, title: 'Lone', cards: [{ id: 'A-9' }] }],
      openCards: [{ number: 73, title: 'Wait', cards: ['B-1', 'B-2', 'B-3', 'B-4'] }, { number: 75, title: 'Soon', cards: ['C-1'] }],
      closedOpen: [{ number: 62, title: 'Closed story', open: [70] }],
      noMatch: [{ number: 63, title: 'Odd' }],
      notRead: [64],
    }
    expect(reconcileText(r, 'o/r').split('\n')).toEqual([
      '#61 Fix — done in MOD-9 (#41)',
      '#72 Story — open, all 2 sub-issues closed',
      '#71 Parse — 2 merged cards under it, none open (A-1, A-2): check its done-when, then close it by number',
      '#74 Lone — 1 merged card under it, none open (A-9): check its done-when, then close it by number',
      '#73 Wait — 4 cards under it still open (B-1, B-2, B-3, +1 more)',
      '#75 Soon — 1 card under it still open (C-1)',
      '#62 Closed story — closed, 1 children open (#70)',
      '#63 Odd — no match',
      '#64 — not read: run again',
      '1 done elsewhere · 1 open with every sub-issue closed · 1 closed with open children · 1 no match · 2 with merged cards under it · 2 with open cards under it',
      '',
      "gh issue close 61 --repo o/r --comment 'done in MOD-9 (#41)'",
      "gh issue close 72 --repo o/r --comment 'all 2 sub-issues done'",
      "# gh issue close 71 --repo o/r --comment 'done in A-1, A-2'",
      "# gh issue close 74 --repo o/r --comment 'done in A-9'",
      "# gh issue close 63 --repo o/r --comment 'not planned'",
    ])
  })
  test('reconcileText counts line with neither new segment, and with only open cards', async () => {
    const { reconcileText } = await lib()
    expect(reconcileText(empty, 'o/r')).toBe('0 done elsewhere · 0 open with every sub-issue closed · 0 closed with open children · 0 no match')
    const open = reconcileText({ ...empty, openCards: [{ number: 75, title: 'Soon', cards: ['C-1'] }] }, 'o/r').split('\n')
    expect(open).toEqual(['#75 Soon — 1 card under it still open (C-1)', '0 done elsewhere · 0 open with every sub-issue closed · 0 closed with open children · 0 no match · 1 with open cards under it'])
  })
})

describe('MOD-364: parseReconcileArgs --only', () => {
  test('a list: duplicates dropped, order kept, with a number or all', async () => {
    const { parseReconcileArgs } = await lib()
    expect(parseReconcileArgs('12 --confirm --only 3,5,3')).toEqual({ issue: 12, confirm: true, only: [3, 5] })
    expect(parseReconcileArgs('all --confirm --only 7')).toEqual({ all: true, confirm: true, only: [7] })
    expect(parseReconcileArgs('12 --confirm --only 9,3')).toEqual({ issue: 12, confirm: true, only: [9, 3] })
  })
  test('the usage error: --only without confirm, no list, a bad entry, zero, given twice', async () => {
    const { parseReconcileArgs, RECONCILE_USAGE } = await lib()
    const usage = { error: `usage: ${RECONCILE_USAGE}` }
    expect(parseReconcileArgs('12 --only 3')).toEqual(usage)
    expect(parseReconcileArgs('12 --confirm --only')).toEqual(usage)
    expect(parseReconcileArgs('12 --confirm --only 3,x')).toEqual(usage)
    expect(parseReconcileArgs('12 --confirm --only 0')).toEqual(usage)
    expect(parseReconcileArgs('12 --confirm --only 3 --only 4')).toEqual(usage)
  })
  test('the usage line names --only', async () => {
    const { RECONCILE_USAGE } = await lib()
    expect(RECONCILE_USAGE).toBe('/delegation tree reconcile <n>|all [--confirm [--only <n,n,…>]]')
  })
})
