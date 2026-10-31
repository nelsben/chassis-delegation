// MOD-244: the card index: an unchanged listing reads nothing; a changed mtime or size re-reads; a removed file is dropped.
import { test, expect, describe } from './kit.mjs'

const D = '/r/docs/cards'
const text = (id, extra = '') => `---\nid: ${id}\ntitle: T ${id}\ndomain: mod\ntier: standard\nstatus: queued\nscope: [a/**]\ngate: node\n${extra}---\n## Done when\n\n- ok\n`
const world = files => {
  const reads = []
  const read = async p => (reads.push(p), files[p])
  const list = () => Object.keys(files).map(p => ({ name: p.slice(D.length + 1), size: files[p].length, mtimeMs: 5 }))
  return { reads, read, list }
}

describe('MOD-244: syncCardIndex', () => {
  test('the first sync reads every card; an unchanged listing reads nothing', async () => {
    const { syncCardIndex, cardsOf } = await import('../../hooks/lib/cardcache.ts')
    const w = world({ [`${D}/MOD-1-a.md`]: text('MOD-1'), [`${D}/MOD-2-b.md`]: text('MOD-2'), [`${D}/README.txt`]: 'x' })
    const a = await syncCardIndex(new Map(), D, w.list(), w.read)
    expect(a.reads).toBe(2)
    const b = await syncCardIndex(a.index, D, w.list(), w.read)
    expect(b.reads).toBe(0)
    expect(w.reads.length).toBe(2)
    expect(cardsOf(b.index, D, w.list()).map(c => c.card.id)).toEqual(['MOD-1', 'MOD-2'])
  })
  test('a changed mtime re-reads that card alone', async () => {
    const { syncCardIndex } = await import('../../hooks/lib/cardcache.ts')
    const w = world({ [`${D}/MOD-1-a.md`]: text('MOD-1'), [`${D}/MOD-2-b.md`]: text('MOD-2') })
    const a = await syncCardIndex(new Map(), D, w.list(), w.read)
    const l = w.list().map(e => (e.name === 'MOD-2-b.md' ? { ...e, mtimeMs: 6 } : e))
    const b = await syncCardIndex(a.index, D, l, w.read)
    expect(b.reads).toBe(1)
    expect(w.reads[w.reads.length - 1]).toBe(`${D}/MOD-2-b.md`)
  })
  test('a changed size re-reads and shows the new text', async () => {
    const { syncCardIndex, cardsOf } = await import('../../hooks/lib/cardcache.ts')
    const files = { [`${D}/MOD-1-a.md`]: text('MOD-1') }
    const w = world(files)
    const a = await syncCardIndex(new Map(), D, w.list(), w.read)
    files[`${D}/MOD-1-a.md`] = text('MOD-1', 'parent: 9\n')
    const b = await syncCardIndex(a.index, D, w.list(), w.read)
    expect(b.reads).toBe(1)
    expect(String(cardsOf(b.index, D, w.list())[0].card.fields.parent)).toBe('9')
  })
  test('a card no longer listed is dropped; a new card is read; other folders are kept', async () => {
    const { syncCardIndex } = await import('../../hooks/lib/cardcache.ts')
    const files = { [`${D}/MOD-1-a.md`]: text('MOD-1'), [`${D}/MOD-2-b.md`]: text('MOD-2') }
    const w = world(files)
    const other = await syncCardIndex(new Map(), '/o/cards', [{ name: 'X-1.md', size: 3, mtimeMs: 1 }], async () => text('X-1'))
    const a = await syncCardIndex(other.index, D, w.list(), w.read)
    delete files[`${D}/MOD-1-a.md`]
    files[`${D}/MOD-3-c.md`] = text('MOD-3')
    const b = await syncCardIndex(a.index, D, w.list(), w.read)
    expect(b.reads).toBe(1)
    expect(b.index.has(`${D}/MOD-1-a.md`)).toBe(false)
    expect(b.index.has(`${D}/MOD-3-c.md`)).toBe(true)
    expect(b.index.has('/o/cards/X-1.md')).toBe(true)
  })
  test('an unreadable card is an entry with no card, read again only when it changes', async () => {
    const { syncCardIndex, cardsOf } = await import('../../hooks/lib/cardcache.ts')
    const listing = [{ name: 'M-1.md', size: 4, mtimeMs: 1 }]
    let n = 0
    const read = async () => (n++, undefined)
    const a = await syncCardIndex(new Map(), D, listing, read)
    await syncCardIndex(a.index, D, listing, read)
    expect(n).toBe(1)
    expect(cardsOf(a.index, D, listing)).toEqual([])
  })
})
