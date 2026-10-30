// MOD-194: tree, the pure half: fencedBlock, treeOf and treeText.
import { test, expect, describe } from './kit.mjs'

const lib = () => import('../../hooks/lib/tree.ts')
const view = {
  number: 50,
  title: 'Export rework',
  state: 'OPEN',
  labels: [{ name: 'area:x' }, { name: 'type:feature' }],
  body: 'Why.\n\n```scope\nhooks/**\n\n  docs/a.md  \n```\n\n```forbid\ndocs/cards/**\n```\n',
  subIssues: [
    { number: 53, title: 'Fix body', state: 'OPEN' },
    { number: 51, title: 'Fix header', state: 'closed' },
    { number: 52, title: 'Fix footer', state: 'OPEN' },
    { number: 54, title: 'Fix sides', state: 'OPEN' },
  ],
}

describe('MOD-194: fencedBlock', () => {
  test('the first block of that name, trimmed, blank lines dropped; none gives []', async () => {
    const { fencedBlock } = await lib()
    expect(fencedBlock(view.body, 'scope')).toEqual(['hooks/**', 'docs/a.md'])
    expect(fencedBlock(view.body, 'forbid')).toEqual(['docs/cards/**'])
    expect(fencedBlock('no blocks', 'scope')).toEqual([])
  })
})

describe('MOD-194: treeOf and treeText', () => {
  test('done by state or by a done card, in flight by a card, planned otherwise', async () => {
    const { treeOf } = await lib()
    const t = treeOf(view, [{ id: 'MOD-7', issue: 52, status: 'queued' }, { id: 'MOD-8', issue: 54, status: 'queued' }], new Set(['MOD-8']))
    expect(t.rows.map(r => [r.number, r.kind, r.card])).toEqual([[51, 'done', undefined], [52, 'in flight', 'MOD-7'], [53, 'planned', undefined], [54, 'done', 'MOD-8']])
    expect(t.counts).toEqual({ done: 2, inFlight: 1, planned: 1 })
    expect(t.scope).toEqual(['hooks/**', 'docs/a.md'])
    expect(t.forbid).toEqual(['docs/cards/**'])
  })
  test('subIssues as { nodes } and no type label', async () => {
    const { treeOf, treeText } = await lib()
    const t = treeOf({ ...view, labels: [], body: '', subIssues: { nodes: [{ number: 9, title: 'N', state: 'OPEN', url: 'u' }] } }, [], new Set())
    expect(treeText(t).split('\n')).toEqual(['#50 issue: Export rework (open)', 'planned #9 N', '0 done · 0 in flight · 1 planned'])
  })
  test('treeText renders the header, scope, forbid, rows, counts and parentScope', async () => {
    const { treeOf, treeText } = await lib()
    const out = treeText(treeOf(view, [{ id: 'MOD-7', issue: 52 }], new Set()))
    expect(out.split('\n')).toEqual([
      '#50 feature: Export rework (open)',
      'scope: hooks/**, docs/a.md',
      'forbid: docs/cards/**',
      'done #51 Fix header',
      'in flight #52 Fix footer MOD-7',
      'planned #53 Fix body',
      'planned #54 Fix sides',
      '1 done · 1 in flight · 2 planned',
      'parentScope for a task card: ["hooks/**","docs/a.md"]',
    ])
  })
})
