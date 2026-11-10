// MOD-361: a repo's own card status words, mapped onto queued, merged or parked; a status is read by its first word. Pure.
import { test, expect, describe } from './kit.mjs'

const S = () => import('../../hooks/lib/statusmap.ts')

describe('MOD-361: firstWord', () => {
  test('the first word, trimmed and lower-cased; none when there is no word', async () => {
    const { firstWord } = await S()
    expect(firstWord('done')).toBe('done')
    expect(firstWord(' Done ')).toBe('done')
    expect(firstWord('merged (PR 27, 2026-10-13)')).toBe('merged')
    expect(firstWord('closed-superseded')).toBe('closed-superseded')
    expect(firstWord('(none)')).toBeUndefined()
    expect(firstWord('')).toBeUndefined()
  })
})

describe('MOD-361: statusMapOf', () => {
  test('a good map is kept; a key in capitals is lower-cased; a _ key is skipped with no error', async () => {
    const { statusMapOf } = await S()
    const errors = []
    expect(statusMapOf({ done: 'merged', Held: 'PARKED', todo: 'queued', _note: 'a comment' }, errors, '')).toEqual({ done: 'merged', held: 'parked', todo: 'queued' })
    expect(errors).toEqual([])
  })

  test('a non-object and an array give one error and undefined', async () => {
    const { statusMapOf } = await S()
    const errors = []
    expect(statusMapOf('done', errors, '')).toBeUndefined()
    expect(errors).toEqual(['statusMap: not an object (ignored)'])
    const errors2 = []
    expect(statusMapOf(['done'], errors2, ' (repo)')).toBeUndefined()
    expect(errors2).toEqual(['statusMap (repo): not an object (ignored)'])
  })

  test('a mod word key, a key with a space, a target outside the three and a non-string value are each dropped with an error; the good entries stay', async () => {
    const { statusMapOf } = await S()
    const errors = []
    const out = statusMapOf({ merged: 'parked', 'in review': 'queued', done: 'blocked', held: 7, open: 'queued', closed: 'merged' }, errors, '')
    expect(out).toEqual({ open: 'queued', closed: 'merged' })
    expect(errors).toEqual([
      'statusMap.merged: needs a word of the repo\'s own mapped onto queued, merged or parked (ignored)',
      'statusMap.in review: needs a word of the repo\'s own mapped onto queued, merged or parked (ignored)',
      'statusMap.done: needs a word of the repo\'s own mapped onto queued, merged or parked (ignored)',
      'statusMap.held: needs a word of the repo\'s own mapped onto queued, merged or parked (ignored)',
    ])
  })
})

describe('MOD-361: statusRead', () => {
  test('no word or no status: the raw value comes back unchanged', async () => {
    const { statusRead } = await S()
    expect(statusRead(undefined, {})).toBeUndefined()
    expect(statusRead('(none)', {})).toBe('(none)')
  })

  test('a mod word reads as itself, first word wins, with an empty map too', async () => {
    const { statusRead } = await S()
    expect(statusRead('Merged', {})).toBe('merged')
    expect(statusRead('merged (PR 27)', {})).toBe('merged')
    expect(statusRead('queued', {})).toBe('queued')
  })

  test('a first word in the map reads as its target, and otherwise the raw value stays', async () => {
    const { statusRead } = await S()
    expect(statusRead('done', { done: 'merged' })).toBe('merged')
    expect(statusRead(' Done (2026-10-13)', { done: 'merged' })).toBe('merged')
    expect(statusRead('done', {})).toBe('done')
    expect(statusRead('Held for review', { held: 'parked' })).toBe('parked')
    expect(statusRead('open', { done: 'merged' })).toBe('open')
  })
})

describe('MOD-361: unknownStatusNote', () => {
  test('no counted status: undefined (mod words, empty and undefined do not count)', async () => {
    const { unknownStatusNote } = await S()
    expect(unknownStatusNote([])).toBeUndefined()
    expect(unknownStatusNote(['queued', 'merged', undefined, ''])).toBeUndefined()
  })

  test('one card: the singular line', async () => {
    const { unknownStatusNote } = await S()
    expect(unknownStatusNote(['queued', 'open'])).toBe('1 card carries a status word the mod does not know (open 1): it reads as queued; map it onto queued, merged or parked with statusMap in .chassis-delegation.json')
  })

  test('several words: count descending, a tie broken by word', async () => {
    const { unknownStatusNote } = await S()
    expect(unknownStatusNote(['open', 'held', 'done', 'done'])).toBe('4 cards carry a status word the mod does not know (done 2, held 1, open 1): they read as queued; map each onto queued, merged or parked with statusMap in .chassis-delegation.json')
  })

  test('six distinct words: the first four listed, then +2 more', async () => {
    const { unknownStatusNote } = await S()
    expect(unknownStatusNote(['f', 'e', 'd', 'c', 'b', 'a'])).toBe('6 cards carry a status word the mod does not know (a 1, b 1, c 1, d 1, +2 more): they read as queued; map each onto queued, merged or parked with statusMap in .chassis-delegation.json')
  })

  test('a status with no first word is counted under (other)', async () => {
    const { unknownStatusNote } = await S()
    expect(unknownStatusNote(['(none)'])).toBe('1 card carries a status word the mod does not know ((other) 1): it reads as queued; map it onto queued, merged or parked with statusMap in .chassis-delegation.json')
  })
})
