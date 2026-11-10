// MOD-353: the Work view's pure model: parseWorkIssues, workModel, workRows, updatedText and workText.
import { test, expect, describe } from './kit.mjs'

const lib = () => import('../../hooks/lib/work.ts')
const UI = (over = {}) => over
const set = (...xs) => new Set(xs)

// The worked case: the prototype's sample data (docs/mockups/work-panel.html).
const I = (number, title, type, parent, closed = false) => ({ number, title, closed, type, ...(parent !== undefined ? { parent } : {}) })
const worked = () => [
  I(10, 'Checkout rework', 'epic'),
  I(11, 'Cart totals', 'feature', 10),
  I(12, 'Round tax per line', 'story', 11, true),
  I(13, 'Restore a saved cart', 'story', 11),
  I(14, 'Show cart count', 'story', 11),
  I(15, 'Empty cart banner', 'bug', 11),
  I(20, 'Payment step', 'feature', 10),
  I(21, 'Card form layout', 'story', 20, true),
  I(22, 'Address autofill', 'story', 20, true),
  I(23, 'Validate card number', 'story', 20),
  I(24, 'Pay by card', 'story', 20),
  I(25, 'Bump the payment SDK', 'task', 20),
  I(30, 'Search', 'epic'),
  I(31, 'Filters', 'feature', 30),
  I(32, 'Save a filter set', 'story', 31),
  I(33, 'Save a cart to the cloud', 'story', 31),
  I(34, 'Filter chips', 'story', 31),
  I(35, 'Index size', 'spike', 31),
  I(40, 'Sorting', 'feature', 30),
  I(41, 'Sort by price', 'story', 40, true),
  I(42, 'Sort by date', 'story', 40),
  I(43, 'Sort by rating', 'story', 40),
  I(60, 'Old epic', 'epic'),
  I(61, 'Old feature', 'feature', 60),
  I(62, 'Old story one', 'story', 61, true),
  I(63, 'Old story two', 'story', 61, true),
  I(70, 'Stray crash', 'bug'),
]
const workedCards = () => [
  { id: 'MOD-900', title: 'Restore a saved cart', issue: 13 },
  { id: 'MOD-901', title: 'Validate card number', issue: 23 },
  { id: 'MOD-902', title: 'Show cart count', issue: 14 },
  { id: 'MOD-903', title: 'Pay by card', issue: 24, status: 'blocked', blockedBy: ['MOD-901'] },
  { id: 'MOD-904', title: 'Save a filter set', issue: 32, tier: 'economy' },
  { id: 'MOD-905', title: 'Save a cart to the cloud', issue: 33 },
  { id: 'MOD-906', title: 'Bump the lint config' },
]
const workedLive = () => [
  { task: 'MOD-900', kind: 'live', model: 'sonnet', state: 'live 6m', attempt: '1/2', usd: 0.31 },
  { task: 'MOD-904', kind: 'live', model: 'haiku', state: 'live 2m', attempt: '2/2', usd: 0.02 },
  { task: 'MOD-901', kind: 'verdict', model: 'sonnet', attempt: '1/2', usd: 0.52 },
  { task: 'MOD-905', kind: 'queued' },
]
const model = async (over = {}) => {
  const { workModel } = await lib()
  return workModel({ issues: worked(), cards: workedCards(), done: new Set(), live: workedLive(), ...over })
}
const walk = (items, out = []) => {
  for (const it of items) {
    out.push(it)
    walk(it.children, out)
  }
  return out
}
const find = (m, key) => walk(m.roots).find(i => i.key === key)
const keysOf = rows => rows.map(r => (r.kind === 'item' ? r.item.key : r.kind === 'hidden' ? `hidden ${r.n}` : r.kind === 'older' ? `older ${r.n}` : `more ${r.n}`))

describe('MOD-353: parseWorkIssues', () => {
  test('anything that is not an array gives no issues', async () => {
    const { parseWorkIssues } = await lib()
    expect(parseWorkIssues({})).toEqual([])
    expect(parseWorkIssues('gh')).toEqual([])
    expect(parseWorkIssues(null)).toEqual([])
  })

  test('type comes from the type: label, closed from the state, parent from the parent number', async () => {
    const { parseWorkIssues } = await lib()
    const out = parseWorkIssues([
      { number: 5, title: 'A', state: 'CLOSED', labels: [{ name: 'area:x' }, { name: 'type:story' }], parent: { number: 3 } },
      { number: 6, title: 'B', state: 'open', labels: [{ name: 'type:unknown' }] },
      { number: 7, title: 'C', state: 'OPEN', labels: [{ name: 'type:spike' }] },
    ])
    expect(out).toEqual([
      { number: 5, title: 'A', closed: true, type: 'story', parent: 3 },
      { number: 6, title: 'B', closed: false, type: 'issue' },
      { number: 7, title: 'C', closed: false, type: 'spike' },
    ])
  })

  test('entries with no number are skipped, a missing title is empty, the result is sorted and a repeated number keeps its first entry', async () => {
    const { parseWorkIssues } = await lib()
    const out = parseWorkIssues([
      { number: 9, title: 'nine', state: 'OPEN' },
      { title: 'no number' },
      { number: 2, title: 'first', state: 'OPEN' },
      { number: 2, title: 'second', state: 'OPEN' },
      { number: 4, state: 'OPEN' },
    ])
    expect(out.map(i => i.number)).toEqual([2, 4, 9])
    expect(out[0].title).toBe('first')
    expect(out[1].title).toBe('')
  })
})

describe('MOD-353: the worked case', () => {
  test('counts by state over the leaves, with the total', async () => {
    const m = await model()
    expect(m.counts).toEqual({ working: 2, review: 1, queued: 3, blocked: 1, backlog: 7, done: 6 })
    expect(m.total).toBe(20)
  })

  test('the five parents show their done and leaf counts', async () => {
    const m = await model()
    const pair = k => `${find(m, k).done}/${find(m, k).leaves}`
    expect(['#10', '#11', '#20', '#30', '#60'].map(pair)).toEqual(['3/9', '1/4', '2/5', '1/7', '2/2'])
    expect(find(m, '#60').state).toBe('done')
  })

  test('the default view is the 24 rows of the prototype, hidden done leaves counted in place', async () => {
    const { workRows, DEFAULT_UI } = await lib()
    const rows = workRows(await model(), DEFAULT_UI)
    expect(keysOf(rows)).toEqual(['#10', '#11', '#13', '#14', '#15', 'hidden 1', '#20', '#23', '#24', '#25', 'hidden 2', '#30', '#31', '#32', '#33', '#34', '#35', '#40', '#42', '#43', 'hidden 1', 'none', '#70', 'MOD-906'])
  })

  test('a done root is listed only with showDone', async () => {
    const { workRows, DEFAULT_UI } = await lib()
    const m = await model()
    expect(keysOf(workRows(m, DEFAULT_UI)).includes('#60')).toBe(false)
    const shown = keysOf(workRows(m, { ...DEFAULT_UI, showDone: true }))
    expect(shown.includes('#60')).toBe(true)
    expect(shown.includes('#62')).toBe(true)
  })

  test('each leaf carries its state and its live fields, a blocked leaf its blockers', async () => {
    const m = await model()
    expect(find(m, '#13')).toMatchObject({ state: 'working', card: 'MOD-900', model: 'sonnet', attempt: '1/2', usd: 0.31, running: '6m' })
    expect(find(m, '#23')).toMatchObject({ state: 'review', card: 'MOD-901', model: 'sonnet', usd: 0.52 })
    expect(find(m, '#24')).toMatchObject({ state: 'blocked', card: 'MOD-903', by: ['MOD-901'] })
    expect(find(m, '#33')).toMatchObject({ state: 'queued', card: 'MOD-905', slot: true })
    expect(find(m, '#15')).toMatchObject({ state: 'backlog', type: 'bug' })
    expect(find(m, '#12').state).toBe('done')
    expect(find(m, '#32').tier).toBe('economy')
  })
})

describe('MOD-353: the card rules', () => {
  test('a card with no issue sits in the No epic group, with a task type and its id as key', async () => {
    const m = await model()
    const group = m.roots.find(r => r.key === 'none')
    expect(group).toMatchObject({ group: true, title: 'No epic', leaves: 2 })
    expect(group.children.map(c => c.key)).toEqual(['#70', 'MOD-906'])
    expect(find(m, 'MOD-906')).toMatchObject({ key: 'MOD-906', type: 'task', state: 'queued', title: 'Bump the lint config' })
  })

  test('a card on an issue that has child issues becomes a card leaf under that issue', async () => {
    const m = await model({ cards: [...workedCards(), { id: 'MOD-960', title: 'Plan it', issue: 10 }] })
    expect(find(m, '#10').children.map(c => c.key).includes('MOD-960')).toBe(true)
  })

  test('a card whose issue is not in the list goes under its parent when that is in the list', async () => {
    const m = await model({ cards: [{ id: 'MOD-961', title: 'Late', issue: 999, parent: 30 }] })
    expect(find(m, '#30').children.map(c => c.key).includes('MOD-961')).toBe(true)
  })

  test('two cards on one issue: a card that is not done wins, between equals the greater id', async () => {
    const m = await model({
      cards: [
        { id: 'MOD-900', title: 'old', issue: 13, status: 'merged' },
        { id: 'MOD-899', title: 'new', issue: 13, status: 'queued' },
        { id: 'MOD-9', title: 'a', issue: 14 },
        { id: 'MOD-10', title: 'b', issue: 14 },
      ],
      live: [],
    })
    expect(find(m, '#13').card).toBe('MOD-899')
    expect(find(m, '#14').card).toBe('MOD-10')
    expect(walk(m.roots).some(i => i.key === 'MOD-900' || i.key === 'MOD-9')).toBe(false)
  })

  test('a parked or template card is dropped', async () => {
    const m = await model({ cards: [{ id: 'MOD-950', issue: 70, status: 'parked' }, { id: 'MOD-951', title: 'tpl', status: 'template' }], live: [] })
    expect(find(m, '#70')).toMatchObject({ state: 'backlog' })
    expect(find(m, '#70').card).toBeUndefined()
    expect(walk(m.roots).some(i => i.key === 'MOD-951')).toBe(false)
  })

  test('a merged or landed card, or one whose id is in done, is a done leaf', async () => {
    const m = await model({ cards: [{ id: 'MOD-970', issue: 34, status: 'merged' }, { id: 'MOD-971', issue: 35 }], done: new Set(['MOD-971']), live: [] })
    expect(find(m, '#34').state).toBe('done')
    expect(find(m, '#35').state).toBe('done')
  })

  test('a live row matches its card by the task cut at its first space or slash', async () => {
    const m = await model({ live: [{ task: 'MOD-902/fix', kind: 'live', model: 'sonnet', state: 'live 1m', attempt: '1/2' }] })
    expect(find(m, '#14')).toMatchObject({ state: 'working', running: '1m' })
  })
})

describe('MOD-353: the six states', () => {
  test('queued carries slot for a queued row and onDisk for a disk row', async () => {
    const m = await model({
      cards: [{ id: 'MOD-980', issue: 34 }, { id: 'MOD-981', issue: 35 }],
      live: [{ task: 'MOD-980', kind: 'queued' }, { task: 'MOD-981', kind: 'disk' }],
    })
    expect(find(m, '#34')).toMatchObject({ state: 'queued', slot: true })
    expect(find(m, '#34').onDisk).toBeUndefined()
    expect(find(m, '#35')).toMatchObject({ state: 'queued', onDisk: true })
    expect(find(m, '#35').slot).toBeUndefined()
  })

  test('an issue with no card and no live row is backlog', async () => {
    const m = await model()
    expect(find(m, '#42')).toMatchObject({ state: 'backlog', type: 'story' })
    expect(find(m, '#42').card).toBeUndefined()
  })
})

describe('MOD-353: a parent loop and the empty case', () => {
  test('a parent loop does not hang, and both issues are listed', async () => {
    const { workModel, workRows, DEFAULT_UI } = await lib()
    const m = workModel({ issues: [I(1, 'A', 'issue', 2), I(2, 'B', 'issue', 1)], cards: [], done: new Set(), live: [] })
    expect(m.roots.map(r => r.key)).toEqual(['none'])
    expect(keysOf(workRows(m, DEFAULT_UI))).toEqual(['none', '#1', '#2'])
  })

  test('an empty model has no roots and no total', async () => {
    const { workModel } = await lib()
    const m = workModel({ issues: [], cards: [], done: new Set(), live: [] })
    expect(m.roots).toEqual([])
    expect(m.total).toBe(0)
  })
})

describe('MOD-353: workRows', () => {
  test('a closed parent lists no children', async () => {
    const { workRows, DEFAULT_UI } = await lib()
    const rows = workRows(await model(), { ...DEFAULT_UI, closed: set('#11') })
    const k = keysOf(rows)
    expect(k.slice(0, 3)).toEqual(['#10', '#11', '#20'])
    expect(k.includes('#13')).toBe(false)
    expect(rows[1]).toMatchObject({ kind: 'item', open: false })
  })

  test('shown lists the done children of that parent in place', async () => {
    const { workRows, DEFAULT_UI } = await lib()
    const k = keysOf(workRows(await model(), { ...DEFAULT_UI, shown: set('#11') }))
    expect(k.slice(0, 7)).toEqual(['#10', '#11', '#12', '#13', '#14', '#15', '#20'])
  })

  test('a query matches the card id, the issue number or a title word, and keeps the parents of a match', async () => {
    const { workRows, DEFAULT_UI } = await lib()
    const m = await model()
    expect(keysOf(workRows(m, { ...DEFAULT_UI, query: '  MOD-902 ' }))).toEqual(['#10', '#11', '#14'])
    expect(keysOf(workRows(m, { ...DEFAULT_UI, query: '#14' }))).toEqual(['#10', '#11', '#14'])
    expect(keysOf(workRows(m, { ...DEFAULT_UI, query: 'restore' }))).toEqual(['#10', '#11', '#13'])
  })

  test('states keeps the leaves in those states, with their parents, and drops the rest', async () => {
    const { workRows, DEFAULT_UI } = await lib()
    expect(keysOf(workRows(await model(), { ...DEFAULT_UI, states: set('blocked') }))).toEqual(['#10', '#20', '#24'])
  })

  test('done leaves are matched only with showDone or the done state', async () => {
    const { workRows, DEFAULT_UI } = await lib()
    const m = await model()
    expect(keysOf(workRows(m, { ...DEFAULT_UI, states: set('done') }))).toEqual(['#10', '#11', '#12', '#20', '#21', '#22', '#30', '#40', '#41', '#60', '#61', '#62', '#63'])
    expect(keysOf(workRows(m, { ...DEFAULT_UI, states: set('working') }))).toEqual(['#10', '#11', '#13', '#30', '#31', '#32'])
  })

  test('root restricts the walk to that one root', async () => {
    const { workRows, DEFAULT_UI } = await lib()
    const k = keysOf(workRows(await model(), { ...DEFAULT_UI, root: '#30' }))
    expect(k).toEqual(['#30', '#31', '#32', '#33', '#34', '#35', '#40', '#42', '#43', 'hidden 1'])
  })

  test('done children past DONE_CAP are cut to the last twenty, and the older row names the rest', async () => {
    const { workModel, workRows, DEFAULT_UI, DONE_CAP } = await lib()
    const issues = [I(100, 'Big', 'epic')]
    for (let n = 101; n <= 121; n++) issues.push(I(n, `done ${n}`, 'story', 100, true))
    issues.push(I(200, 'open one', 'story', 100))
    const m = workModel({ issues, cards: [], done: new Set(), live: [] })
    expect(DONE_CAP).toBe(20)
    expect(keysOf(workRows(m, DEFAULT_UI))).toEqual(['#100', '#200', 'hidden 21'])
    const shown = workRows(m, { ...DEFAULT_UI, shown: set('#100') })
    expect(keysOf(shown).filter(k => k.startsWith('#')).length).toBe(22)
    expect(shown[shown.length - 1]).toEqual({ kind: 'older', parent: '#100', depth: 1, n: 1 })
  })

  test('more than ROW_CAP rows keep the first 200 and say how many are left', async () => {
    const { workModel, workRows, DEFAULT_UI, ROW_CAP } = await lib()
    const issues = [I(1, 'Epic', 'epic')]
    for (let n = 1000; n < 1250; n++) issues.push(I(n, `leaf ${n}`, 'story', 1))
    const rows = workRows(workModel({ issues, cards: [], done: new Set(), live: [] }), DEFAULT_UI)
    expect(ROW_CAP).toBe(200)
    expect(rows).toHaveLength(201)
    expect(rows[200]).toEqual({ kind: 'more', n: 51 })
  })
})

describe('MOD-353: updatedText and workText', () => {
  test('updatedText says just now, minutes, or hours, and reads a negative age as just now', async () => {
    const { updatedText } = await lib()
    expect(updatedText(0, 30_000)).toBe('Updated just now')
    expect(updatedText(0, 5 * 60_000)).toBe('Updated 5 min ago')
    expect(updatedText(0, 3 * 3600_000 + 10 * 60_000)).toBe('Updated 3 h ago')
    expect(updatedText(10, 0)).toBe('Updated just now')
  })

  test('workText prints the summary line and the rows of the worked case', async () => {
    const { workText } = await lib()
    const text = workText(await model(), { updated: 'Updated just now' })
    const lines = text.split('\n')
    expect(lines[0]).toBe('**Work** · 2 working · 1 to review · 3 queued · 1 blocked · 7 backlog · 6 done · Updated just now')
    expect(lines).toContain('- **#10 Checkout rework** 3/9')
    expect(lines).toContain('    - WORKING #13 Restore a saved cart · MOD-900 · sonnet 1/2 · 6m · $0.31')
    expect(lines).toContain('    - BLOCKED #24 Pay by card · MOD-903 · by MOD-901')
    expect(lines).toContain('    - QUEUED #33 Save a cart to the cloud · MOD-905 · waiting for a slot')
    expect(lines).toContain('  - QUEUED — Bump the lint config · MOD-906')
  })

  test('workText of an empty model is the summary line and the import hint, and nothing else', async () => {
    const { workModel, workText } = await lib()
    const text = workText(workModel({ issues: [], cards: [], done: new Set(), live: [] }))
    expect(text).toBe('**Work** · 0 working · 0 to review · 0 queued · 0 blocked · 0 backlog · 0 done\nNo work breakdown yet. Import one with /delegation tree import <file>, or start one with /delegation land epic <title>.')
  })

  test('notes come after the summary line, one per line', async () => {
    const { workModel, workText } = await lib()
    const text = workText(workModel({ issues: [], cards: [], done: new Set(), live: [] }), { notes: ['the newest 300 issues only'] })
    expect(text.split('\n')[1]).toBe('the newest 300 issues only')
  })
})
