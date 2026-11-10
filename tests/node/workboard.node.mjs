// MOD-357: the Work pane's Board view, the pure half: boardColOf, boardLayout, workBoard.
import { test, expect, describe } from './kit.mjs'

const lib = () => import('../../hooks/lib/work.ts')

const leaf = (key, over = {}) => ({ key, title: key, type: 'story', state: 'backlog', children: [], leaves: 1, done: 0, ...over })
const parent = (key, children, over = {}) => ({ key, title: key, type: 'epic', state: 'backlog', children, leaves: children.length, done: 0, ...over })
const ui = (over = {}) => ({ closed: new Set(), shown: new Set(), query: '', states: new Set(), showDone: false, ...over })
const model = () => ({
  roots: [
    parent('#10', [
      parent('#11', [leaf('#12', { number: 12, state: 'done', done: 1 }), leaf('#13', { number: 13, card: 'MOD-9', state: 'queued' }), leaf('#14', { number: 14 })], { number: 10, type: 'feature' }),
      leaf('MOD-5', { card: 'MOD-5', state: 'blocked', by: ['MOD-9'] }),
    ], { number: 10 }),
    parent('#30', [leaf('#31', { number: 31, title: 'Filter chips' })], { number: 30 }),
    parent('#40', [leaf('#41', { number: 41, state: 'done', done: 1 })], { number: 40, state: 'done' }),
    leaf('#50', { number: 50, state: 'working', card: 'MOD-50' }),
  ],
  counts: {},
  total: 7,
})
const keys = items => items.map(i => i.key)

describe('MOD-357: the Work board, pure', () => {
  test('boardColOf maps the six states; blocked is queued', async () => {
    const { boardColOf } = await lib()
    expect(['backlog', 'queued', 'working', 'review', 'done', 'blocked'].map(boardColOf)).toEqual(['backlog', 'queued', 'working', 'review', 'done', 'queued'])
  })

  test('boardLayout: columns from 100, stacked below', async () => {
    const { boardLayout } = await lib()
    expect(boardLayout(99)).toEqual({ mode: 'stack', col: 99 })
    expect(boardLayout(100)).toEqual({ mode: 'columns', col: 18 })
    expect(boardLayout(130)).toEqual({ mode: 'columns', col: 24 })
    expect(boardLayout(40)).toEqual({ mode: 'stack', col: 40 })
    expect(boardLayout(10)).toEqual({ mode: 'stack', col: 16 })
  })

  test('each leaf lands in its column, a blocked leaf in queued; done leaves are counted, not placed', async () => {
    const { workBoard } = await lib()
    const lanes = workBoard(model(), ui())
    expect(lanes.map(l => l.root.key)).toEqual(['#10', '#30', '#50'])
    const l = lanes[0]
    expect(keys(l.cols.backlog)).toEqual(['#14'])
    expect(keys(l.cols.queued)).toEqual(['#13', 'MOD-5'])
    expect(keys(l.cols.done)).toEqual([])
    expect(l.doneHidden).toBe(1)
    expect(l.open).toBe(true)
    expect(l.more.queued).toBe(0)
    expect(keys(lanes[2].cols.working)).toEqual(['#50'])
  })

  test('done leaves list under showDone, under shown for that root only, and under the done filter', async () => {
    const { workBoard } = await lib()
    expect(keys(workBoard(model(), ui({ showDone: true }))[0].cols.done)).toEqual(['#12'])
    expect(workBoard(model(), ui({ showDone: true }))[0].doneHidden).toBe(0)
    const shown = workBoard(model(), ui({ shown: new Set(['#10']) }))
    expect(keys(shown[0].cols.done)).toEqual(['#12'])
    const none = workBoard(model(), ui({ shown: new Set(['#30']) }))
    expect(keys(none[0].cols.done)).toEqual([])
    const f = workBoard(model(), ui({ states: new Set(['done']) }))
    expect(f.map(l => l.root.key)).toEqual(['#10', '#40'])
    expect(keys(f[0].cols.done)).toEqual(['#12'])
  })

  test('a query and a state filter keep the passing leaves and drop a lane with none', async () => {
    const { workBoard } = await lib()
    const q = workBoard(model(), ui({ query: ' CHIPS ' }))
    expect(q.map(l => l.root.key)).toEqual(['#30'])
    const byCard = workBoard(model(), ui({ query: 'mod-9' }))
    expect(byCard.map(l => keys(l.cols.queued))).toEqual([['#13']])
    const s = workBoard(model(), ui({ states: new Set(['queued']) }))
    expect(s.map(l => l.root.key)).toEqual(['#10'])
    expect(keys(s[0].cols.backlog)).toEqual([])
  })

  test('a filtered lane with only hidden done leaves stays (doneHidden above 0)', async () => {
    const { workBoard } = await lib()
    const lanes = workBoard(model(), ui({ query: 'story-never' }))
    expect(lanes).toEqual([])
    const m = { roots: [parent('#1', [leaf('a', { state: 'done', done: 1, title: 'zed' })], { number: 1 })], counts: {}, total: 1 }
    const l = workBoard(m, ui({ query: 'zed' }))
    expect(l).toHaveLength(1)
    expect(l[0].doneHidden).toBe(1)
  })

  test('ui.root keeps one lane; an unknown root keeps all', async () => {
    const { workBoard } = await lib()
    expect(workBoard(model(), ui({ root: '#30' })).map(l => l.root.key)).toEqual(['#30'])
    expect(workBoard(model(), ui({ root: '#99' }))).toHaveLength(3)
  })

  test('an all-done root is dropped by default and kept under showDone', async () => {
    const { workBoard } = await lib()
    expect(workBoard(model(), ui()).some(l => l.root.key === '#40')).toBe(false)
    const l = workBoard(model(), ui({ showDone: true })).find(x => x.root.key === '#40')
    expect(keys(l.cols.done)).toEqual(['#41'])
  })

  test('a column of 12 keeps 10 with more 2; done keeps the last 10', async () => {
    const { workBoard } = await lib()
    const many = (state, n) => Array.from({ length: n }, (_, i) => leaf(`${state}${i}`, { state, number: i }))
    const m = { roots: [parent('#1', [...many('queued', 12), ...many('done', 12)], { number: 1 })], counts: {}, total: 24 }
    const l = workBoard(m, ui({ showDone: true }))[0]
    expect(keys(l.cols.queued)).toEqual(Array.from({ length: 10 }, (_, i) => `queued${i}`))
    expect(l.more.queued).toBe(2)
    expect(keys(l.cols.done)).toEqual(Array.from({ length: 10 }, (_, i) => `done${i + 2}`))
    expect(l.more.done).toBe(2)
    expect(l.more.working).toBe(0)
  })

  test('open follows ui.closed, and a closed lane still carries its columns', async () => {
    const { workBoard } = await lib()
    const l = workBoard(model(), ui({ closed: new Set(['#10']) }))[0]
    expect(l.open).toBe(false)
    expect(keys(l.cols.backlog)).toEqual(['#14'])
  })
})
