// MOD-341: the card tool takes `fixes`; the spawn row carries `fixes` and `linked`. Pure: no engine.
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
const lineOf = (text, key) => text.split('\n').find(l => l.startsWith(`${key}:`))
const BAD = 'fixes must be a list of task ids (like MOD-12), at most 5'
const NOTE = `note: this reads as a fix; if it repairs a card that already merged, pass fixes: ["<that card's id>"], or fixes: [] when it does not`
const base = { task: 'T-4', subtask: 'main', attempt: 1, lineage: 1, budget: 3, tier: 'standard', alias: 'sonnet', purpose: 'build', at: 1 }

describe('MOD-341: the card tool takes fixes', () => {
  test('ids are trimmed and written; NewCard.fixes carries them', async () => {
    const { cardsFromFields } = await import('../../hooks/lib/card.ts')
    const r = cardsFromFields(input({ fixes: ['MOD-12', ' MOD-15 '] }), ctx())
    expect(lineOf(r[0].text, 'fixes')).toBe('fixes: [MOD-12, MOD-15]')
    expect(r[0].fixes).toEqual(['MOD-12', 'MOD-15'])
  })
  test('an empty list is written and gives no note', async () => {
    const { cardsFromFields } = await import('../../hooks/lib/card.ts')
    const r = cardsFromFields(input({ title: 'Fix the stale hint', fixes: [] }), ctx())
    expect(lineOf(r[0].text, 'fixes')).toBe('fixes: []')
    expect(r[0].fixes).toEqual([])
    expect(r[0].notes ?? []).not.toContain(NOTE)
  })
  test('no fixes: a fix-like title gets the note, another title does not', async () => {
    const { cardsFromFields } = await import('../../hooks/lib/card.ts')
    const a = cardsFromFields(input({ title: 'Fix the stale hint' }), ctx())
    expect(lineOf(a[0].text, 'fixes')).toBe(undefined)
    expect(a[0].notes).toContain(NOTE)
    const b = cardsFromFields(input({ title: 'A worker lists choices' }), ctx())
    expect(lineOf(b[0].text, 'fixes')).toBe(undefined)
    expect(b[0].notes ?? []).not.toContain(NOTE)
  })
  test('a repeat is dropped', async () => {
    const { cardsFromFields } = await import('../../hooks/lib/card.ts')
    const r = cardsFromFields(input({ fixes: ['MOD-12', 'MOD-12'] }), ctx())
    expect(lineOf(r[0].text, 'fixes')).toBe('fixes: [MOD-12]')
  })
  test('a bad id, six ids and a non-array are refused', async () => {
    const { cardsFromFields } = await import('../../hooks/lib/card.ts')
    expect(cardsFromFields(input({ fixes: ['not an id'] }), ctx())).toEqual({ error: BAD })
    expect(cardsFromFields(input({ fixes: ['A-1', 'A-2', 'A-3', 'A-4', 'A-5', 'A-6'] }), ctx())).toEqual({ error: BAD })
    expect(cardsFromFields(input({ fixes: 'MOD-12' }), ctx())).toEqual({ error: BAD })
  })
  test('the card itself is refused', async () => {
    const { cardsFromFields } = await import('../../hooks/lib/card.ts')
    const id = cardsFromFields(input(), ctx())[0].id
    expect(cardsFromFields(input({ fixes: [id] }), ctx())).toEqual({ error: 'fixes cannot name the card itself' })
  })
  test('lanes refuse fixes', async () => {
    const { cardsFromFields } = await import('../../hooks/lib/card.ts')
    const r = cardsFromFields({ ...input({ fixes: ['MOD-12'] }), scope: undefined, lanes: [{ title: 'a', scope: ['/r/a/x.ts'] }] }, ctx())
    expect(r).toEqual({ error: 'fixes belongs to one card; drop it when lanes are given' })
  })
  test('fixesOf reads a list or the [A, B] string and keeps only ids', async () => {
    const { fixesOf } = await import('../../hooks/lib/card.ts')
    expect(fixesOf(['MOD-1', ' x y ', 'OPS-2'])).toEqual(['MOD-1', 'OPS-2'])
    expect(fixesOf('[MOD-1, MOD-2]')).toEqual(['MOD-1', 'MOD-2'])
    expect(fixesOf('[]')).toEqual([])
    expect(fixesOf(undefined)).toEqual([])
  })
})

describe('MOD-341: the spawn row carries fixes and linked', () => {
  test('both are copied', async () => {
    const { spawnRow } = await import('../../hooks/lib/storeloss.ts')
    const r = spawnRow({ ...base, fixes: ['MOD-12'], linked: true })
    expect(r.fixes).toEqual(['MOD-12'])
    expect(r.linked).toBe(true)
  })
  test('linked false is written, no fixes key', async () => {
    const { spawnRow } = await import('../../hooks/lib/storeloss.ts')
    const r = spawnRow({ ...base, linked: false })
    expect(r.linked).toBe(false)
    expect('fixes' in r).toBe(false)
  })
  test('an empty fixes writes neither key', async () => {
    const { spawnRow } = await import('../../hooks/lib/storeloss.ts')
    const r = spawnRow({ ...base, fixes: [] })
    expect('fixes' in r).toBe(false)
    expect('linked' in r).toBe(false)
  })
})
