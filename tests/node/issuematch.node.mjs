// MOD-287: a card with no issue is matched against the planned tasks the mod filed (pure: the parsers and the matcher).
import { test, expect, describe } from './kit.mjs'

const lib = () => import('../../hooks/lib/issuematch.ts')
const landedText = ({ paths = ['src/export/a.ts'], type = 'task', issue = 12, parent, closed = false, noType = false }) =>
  [
    'Some body text.',
    '',
    '## Scope',
    '',
    '```scope',
    ...paths,
    '```',
    '',
    ...(noType ? [] : [`type: ${type}`]),
    ...(parent !== undefined ? [`parent: #${parent}`] : []),
    `issue: #${issue} https://github.com/acme/widgets/issues/${issue}`,
    ...(closed ? ['closed: 2026-11-01T10:00:00.000Z'] : []),
    '',
  ].join('\n')

describe('MOD-287: the planned-task match', () => {
  test('a planned task under the card scope is suggested with its parent', async () => {
    const { plannedFromLanded, matchPlanned } = await lib()
    const p = plannedFromLanded('export-drops-a-row.md', landedText({ issue: 12, parent: 9 }))
    expect(p).toMatchObject({ number: 12, type: 'task', parent: 9 })
    expect(matchPlanned(['src/export/**'], [p], new Set()).map(x => [x.number, x.parent])).toEqual([[12, 9]])
  })
  test('a planned task with no parent line has no parent', async () => {
    const { plannedFromLanded } = await lib()
    expect(plannedFromLanded('solo.md', landedText({ issue: 3 })).parent).toBeUndefined()
  })
  test('the body is not read as a candidate: no type line means the file is skipped', async () => {
    const { plannedFromLanded } = await lib()
    expect(plannedFromLanded('old.md', landedText({ issue: 4, noType: true }))).toBeUndefined()
  })
  test('one already named by a card or a ledger row is not suggested', async () => {
    const { plannedFromLanded, matchPlanned } = await lib()
    const p = plannedFromLanded('a.md', landedText({ issue: 12 }))
    expect(matchPlanned(['src/export/**'], [p], new Set([12]))).toEqual([])
  })
  test('one whose landed file has a closed: line is not a candidate', async () => {
    const { plannedFromLanded } = await lib()
    expect(plannedFromLanded('a.md', landedText({ issue: 12, closed: true }))).toBeUndefined()
  })
  test('three candidates are ordered by overlap and a fourth is cut', async () => {
    const { matchPlanned } = await lib()
    const mk = (number, paths) => ({ number, title: `T${number}`, type: 'task', paths })
    const planned = [mk(1, ['src/a.ts']), mk(2, ['src/a.ts', 'src/b.ts']), mk(3, ['src/c.ts']), mk(4, ['src/d.ts', 'src/e.ts', 'src/f.ts'])]
    expect(matchPlanned(['src/**'], planned, new Set()).map(x => x.number)).toEqual([4, 2, 1])
  })
  test('a feature, epic or story is never a candidate', async () => {
    const { matchPlanned } = await lib()
    const planned = ['feature', 'epic', 'story'].map((type, i) => ({ number: i + 1, title: type, type, paths: ['src/a.ts'] }))
    expect(matchPlanned(['src/**'], planned, new Set())).toEqual([])
  })
  test('a plan item is a candidate under its enclosing item, and a task with no paths does not overlap', async () => {
    const { plannedFromPlan, matchPlanned } = await lib()
    const planned = plannedFromPlan({ version: 1, items: [{ type: 'feature', title: 'F', issue: 5, children: [{ type: 'task', title: 'T', paths: ['src/x.ts'], issue: 6 }, { type: 'task', title: 'U', issue: 7 }] }] })
    expect(planned.map(p => [p.number, p.parent])).toEqual([[5, undefined], [6, 5], [7, 5]])
    expect(matchPlanned(['src/**'], planned, new Set()).map(p => [p.number, p.parent])).toEqual([[6, 5]])
  })
  test('the suggestion line names the parent only when one is known', async () => {
    const { suggestionLine } = await lib()
    expect(suggestionLine({ number: 12, title: 'Export drops a row', type: 'task', paths: [], parent: 9 })).toBe('planned task #12 "Export drops a row" (under #9) overlaps this scope; pass issue: 12, parent: 9')
    expect(suggestionLine({ number: 12, title: 'Export drops a row', type: 'task', paths: [] })).toBe('planned task #12 "Export drops a row" overlaps this scope; pass issue: 12')
  })
  test('issueMatch reads off, suggest or require and nothing else', async () => {
    const { issueMatchOf } = await lib()
    expect(issueMatchOf('require')).toBe('require')
    expect(issueMatchOf('off')).toBe('off')
    expect(issueMatchOf('suggest')).toBe('suggest')
    expect(issueMatchOf('yes')).toBeUndefined()
  })
})

// MOD-339: a plan item filed closed is never a candidate; the candidates are checked for state before one is suggested.
describe('MOD-339: a closed issue is never suggested', () => {
  test('a plan item with a close line is not a candidate', async () => {
    const { plannedFromPlan } = await lib()
    const planned = plannedFromPlan({ version: 1, items: [{ type: 'task', issue: 75, paths: ['a/x.ts'], close: 'done in OPS-1' }] })
    expect(planned.map(p => p.number)).not.toContain(75)
  })
  test('the children of a closed parent are still candidates, under that parent; the parent is not', async () => {
    const { plannedFromPlan } = await lib()
    const planned = plannedFromPlan({ version: 1, items: [{ type: 'feature', issue: 70, close: 'done', children: [{ type: 'task', issue: 71, paths: ['a/x.ts'] }] }] })
    expect(planned.map(p => [p.number, p.parent])).toEqual([[71, 70]])
  })
  test('a close line of only blanks does not close the item', async () => {
    const { plannedFromPlan } = await lib()
    const planned = plannedFromPlan({ version: 1, items: [{ type: 'task', issue: 76, paths: ['a/x.ts'], close: '   ' }] })
    expect(planned.map(p => p.number)).toEqual([76])
  })
  test('matchPlanned takes a fourth argument as the limit; three arguments keep the limit of 3', async () => {
    const { matchPlanned } = await lib()
    const planned = [1, 2, 3, 4, 5].map(number => ({ number, title: `T${number}`, type: 'task', paths: ['src/a.ts'] }))
    expect(matchPlanned(['src/**'], planned, new Set(), 6).map(x => x.number)).toEqual([1, 2, 3, 4, 5])
    expect(matchPlanned(['src/**'], planned, new Set()).map(x => x.number)).toEqual([1, 2, 3])
  })
  test('MATCH_POOL is 6', async () => {
    const { MATCH_POOL } = await lib()
    expect(MATCH_POOL).toBe(6)
  })
  test('openCandidates drops a candidate whose state is closed in any case', async () => {
    const { openCandidates } = await lib()
    const c = [1, 2, 3, 4].map(number => ({ number }))
    expect(openCandidates(c, new Map([[1, 'CLOSED'], [3, 'closed']])).map(x => x.number)).toEqual([2, 4])
  })
  test('openCandidates keeps a candidate whose state is unknown', async () => {
    const { openCandidates } = await lib()
    const c = [1, 2].map(number => ({ number }))
    expect(openCandidates(c, new Map()).map(x => x.number)).toEqual([1, 2])
  })
  test('openCandidates returns the first limit of the open ones', async () => {
    const { openCandidates } = await lib()
    const c = [1, 2, 3, 4, 5].map(number => ({ number }))
    expect(openCandidates(c, new Map([[1, 'OPEN']]), 3).map(x => x.number)).toEqual([1, 2, 3])
  })
  test('openCandidates defaults to the limit of 3', async () => {
    const { openCandidates } = await lib()
    const c = [1, 2, 3, 4, 5].map(number => ({ number }))
    expect(openCandidates(c, new Map()).map(x => x.number)).toEqual([1, 2, 3])
  })
})

describe('MOD-350: the remembered issue state', () => {
  test('a remembered state is returned inside the window and at now === at', async () => {
    const { cachedState, rememberState, STATE_TTL_MS } = await lib()
    const cache = new Map()
    rememberState(cache, 'acme/widgets', 5, 'CLOSED', 1000)
    expect(cachedState(cache, 'acme/widgets', 5, 1000)).toBe('CLOSED')
    expect(cachedState(cache, 'acme/widgets', 5, 1000 + STATE_TTL_MS - 1)).toBe('CLOSED')
  })
  test('it is not returned at exactly at + STATE_TTL_MS, and the entry is gone', async () => {
    const { cachedState, rememberState, STATE_TTL_MS } = await lib()
    const cache = new Map()
    rememberState(cache, 'acme/widgets', 5, 'OPEN', 1000)
    expect(cachedState(cache, 'acme/widgets', 5, 1000 + STATE_TTL_MS)).toBe(undefined)
    expect(cache.size).toBe(0)
  })
  test('an entry whose at is later than now is not returned', async () => {
    const { cachedState, rememberState } = await lib()
    const cache = new Map()
    rememberState(cache, 'acme/widgets', 5, 'OPEN', 5000)
    expect(cachedState(cache, 'acme/widgets', 5, 4999)).toBe(undefined)
    expect(cache.size).toBe(0)
  })
  test('the key ignores repo case and keeps repos and numbers apart', async () => {
    const { cachedState, rememberState } = await lib()
    const cache = new Map()
    rememberState(cache, 'Acme/Widgets', 5, 'CLOSED', 0)
    expect(cachedState(cache, 'acme/widgets', 5, 1)).toBe('CLOSED')
    expect(cachedState(cache, 'acme/other', 5, 1)).toBe(undefined)
    expect(cachedState(cache, 'acme/widgets', 6, 1)).toBe(undefined)
  })
  test('the map is cleared when a new key arrives at STATE_CACHE_MAX, not when an existing key is set again', async () => {
    const { cachedState, rememberState, STATE_CACHE_MAX } = await lib()
    const cache = new Map()
    for (let i = 0; i < STATE_CACHE_MAX; i++) rememberState(cache, 'a/b', i, 'OPEN', 0)
    expect(cache.size).toBe(STATE_CACHE_MAX)
    rememberState(cache, 'a/b', 0, 'CLOSED', 1)
    expect(cache.size).toBe(STATE_CACHE_MAX)
    expect(cachedState(cache, 'a/b', 0, 2)).toBe('CLOSED')
    rememberState(cache, 'a/b', STATE_CACHE_MAX, 'OPEN', 1)
    expect(cache.size).toBe(1)
    expect(cachedState(cache, 'a/b', 1, 2)).toBe(undefined)
  })
})
