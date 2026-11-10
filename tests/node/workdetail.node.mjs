// MOD-356: the Work pane's detail panel, the pure half: findItem, leafOfCard, workAction, actionLine, askedOn, agoText, workActivity.
import { test, expect, describe } from './kit.mjs'

const lib = () => import('../../hooks/lib/work.ts')

const leaf = (key, over = {}) => ({ key, title: key, type: 'story', state: 'backlog', children: [], leaves: 1, done: 0, ...over })
const parent = (key, children, over = {}) => ({ key, title: key, type: 'feature', state: 'backlog', children, leaves: children.length, done: 0, ...over })
const model = () => ({
  roots: [
    parent('#10', [parent('#11', [leaf('#13', { number: 13, card: 'MOD-9', state: 'queued' }), leaf('#14', { number: 14 })], { number: 11 })], { number: 10 }),
    parent('none', [leaf('MOD-8', { card: 'MOD-8', state: 'blocked', by: ['MOD-9'] })], { group: true }),
  ],
  counts: {},
  total: 3,
})

describe('MOD-356: the Work pane detail, pure', () => {
  test('findItem gives a leaf with its trail root first; a parent key or an unknown key gives undefined', async () => {
    const { findItem } = await lib()
    const f = findItem(model(), '#13')
    expect(f.item.key).toBe('#13')
    expect(f.trail.map(t => t.key)).toEqual(['#10', '#11'])
    expect(findItem(model(), '#11')).toBeUndefined()
    expect(findItem(model(), '#99')).toBeUndefined()
    expect(findItem(model(), 'MOD-8').trail.map(t => t.key)).toEqual(['none'])
  })

  test('leafOfCard finds a leaf by its card or by its key, depth first', async () => {
    const { leafOfCard } = await lib()
    expect(leafOfCard(model(), 'MOD-9').key).toBe('#13')
    expect(leafOfCard(model(), 'MOD-8').key).toBe('MOD-8')
    expect(leafOfCard(model(), '#14').key).toBe('#14')
    expect(leafOfCard(model(), 'MOD-77')).toBeUndefined()
  })

  test('workAction by state, for a leaf with no card, a queued leaf with a slot, and a parent', async () => {
    const { workAction } = await lib()
    const c = (state, over = {}) => leaf('x', { card: 'MOD-1', state, ...over })
    expect(workAction(c('queued'))).toBe('dispatch')
    expect(workAction(c('review'))).toBe('review')
    expect(workAction(c('blocked'))).toBe('unblock')
    expect(workAction(c('working'))).toBeUndefined()
    expect(workAction(c('backlog'))).toBeUndefined()
    expect(workAction(c('done'))).toBeUndefined()
    expect(workAction(c('queued', { slot: true }))).toBeUndefined()
    expect(workAction(leaf('x', { state: 'queued' }))).toBeUndefined()
    expect(workAction(parent('p', [leaf('a')], { card: 'MOD-1', state: 'queued' }))).toBeUndefined()
  })

  test('actionLine gives the four exact lines', async () => {
    const { actionLine } = await lib()
    const it = (over = {}) => leaf('x', { card: 'MOD-9', ...over })
    expect(actionLine('dispatch', it())).toBe('Work pane: Dispatch was pressed on MOD-9. Dispatch MOD-9.')
    expect(actionLine('review', it())).toBe('Work pane: Review was pressed on MOD-9. Get its verdict, read its diff and say whether it should merge.')
    expect(actionLine('unblock', it({ by: ['MOD-3', 'MOD-4'] }))).toBe(
      'Work pane: Unblock was pressed and confirmed on MOD-9, which waits on MOD-3, MOD-4. Release its card (status queued, no blocked_by line) and say what it still overlaps.',
    )
    expect(actionLine('unblock', it())).toBe('Work pane: Unblock was pressed and confirmed on MOD-9. Release its card (status queued, no blocked_by line).')
  })

  test('askedOn holds for the same state inside the time only', async () => {
    const { askedOn, ASKED_TTL_MS } = await lib()
    const it = leaf('x', { state: 'queued' })
    const a = { action: 'dispatch', state: 'queued', at: 1000 }
    expect(askedOn(a, it, 1000)).toBe(true)
    expect(askedOn(a, it, 1000 + ASKED_TTL_MS - 1)).toBe(true)
    expect(askedOn(a, it, 1000 + ASKED_TTL_MS)).toBe(false)
    expect(askedOn(a, it, 999)).toBe(false)
    expect(askedOn({ ...a, state: 'review' }, it, 1500)).toBe(false)
    expect(askedOn(undefined, it, 1500)).toBe(false)
  })

  test('agoText at its boundaries', async () => {
    const { agoText } = await lib()
    const at = (s) => agoText(0, s * 1000)
    expect(at(0)).toBe('just now')
    expect(at(59)).toBe('just now')
    expect(at(60)).toBe('1 min ago')
    expect(at(59 * 60)).toBe('59 min ago')
    expect(at(60 * 60)).toBe('1 h ago')
    expect(at(23 * 3600)).toBe('23 h ago')
    expect(at(24 * 3600)).toBe('1 d ago')
    expect(at(3 * 86400)).toBe('3 d ago')
    expect(agoText(5000, 1000)).toBe('just now')
  })

  test('workActivity makes an event of each row shape, leaves other tasks and rows without a time out', async () => {
    const { workActivity } = await lib()
    const now = 10_000_000
    const rows = [
      { task: 'MOD-1', event: 'spawn', alias: 'sonnet', attempt: 1, budget: 2, at: 1000 },
      { task: 'MOD-1', kind: 'spawn', verdict: 'pass', verdictAt: 2000, usd: 1.234 },
      { task: 'MOD-1', kind: 'resume', attempt: 2, at: 3000, verdict: 'fail', verdictAt: 4000 },
      { task: 'MOD-1', kind: 'verify', verdict: 'pass', verdictAt: 5000 },
      { task: 'MOD-1', kind: 'review', verdict: 'merge', verdictAt: 6000 },
      { task: 'MOD-1', kind: 'amend', at: 7000 },
      { task: 'MOD-1', kind: 'accept', at: 8000 },
      { task: 'MOD-1', kind: 'merged', at: 9000 },
      { task: 'MOD-2', kind: 'merged', at: 9500 },
      { task: 'MOD-1', kind: 'accept' },
      { task: 'MOD-1', kind: 'accept', at: 'x' },
    ]
    const texts = workActivity(rows, 'MOD-1', now).map(e => e.text)
    expect(texts).toEqual(['Merged', 'Accepted', 'Scope amended', 'Review: merge', 'Verified by hand: pass', 'Verdict fail', 'Resumed · attempt 2', 'Verdict pass · $1.23'])
    expect(workActivity([rows[0]], 'MOD-1', now)[0].text).toBe('Dispatched to sonnet · attempt 1/2')
  })

  test('workActivity spawn event falls back on missing alias, attempt and budget', async () => {
    const { workActivity } = await lib()
    expect(workActivity([{ task: 'T', event: 'spawn', at: 1 }], 'T', 100)[0].text).toBe('Dispatched to a worker')
    expect(workActivity([{ task: 'T', event: 'spawn', attempt: 3, at: 1 }], 'T', 100)[0].text).toBe('Dispatched to a worker · attempt 3')
    expect(workActivity([{ task: 'T', kind: 'resume', at: 1 }], 'T', 100)[0].text).toBe('Resumed')
  })

  test('workActivity drops a repeated event, sorts newest first with the later row first on a tie, and caps at 8', async () => {
    const { workActivity, ACTIVITY_CAP } = await lib()
    const v = { task: 'T', kind: 'review', verdict: 'merge', verdictAt: 500 }
    const ev = workActivity([v, { ...v }], 'T', 1000)
    expect(ev).toHaveLength(1)
    expect(ev[0].ago).toBe('just now')
    const tie = workActivity([{ task: 'T', kind: 'accept', at: 5 }, { task: 'T', kind: 'merged', at: 5 }], 'T', 1000)
    expect(tie.map(e => e.text)).toEqual(['Merged', 'Accepted'])
    const many = Array.from({ length: 10 }, (_, i) => ({ task: 'T', kind: 'amend', at: i + 1 }))
    const out = workActivity(many, 'T', 1000)
    expect(ACTIVITY_CAP).toBe(8)
    expect(out).toHaveLength(8)
  })
})
