// MOD-216: a hand-written card's issue: and parent: accept 12, #12 and an issue URL; parked is a card status. Pure.
import { test, expect, describe } from './kit.mjs'

const merge = () => import('../../hooks/lib/mergecmd.ts')
const dispatch = () => import('../../hooks/lib/dispatch.ts')
const land = () => import('../../hooks/lib/land.ts')

describe('MOD-216: issueRef forms', () => {
  test('12, #12 and a same-repo URL all read as 12', async () => {
    const { issueRef } = await merge()
    expect(issueRef(12)).toBe(12)
    expect(issueRef('12')).toBe(12)
    expect(issueRef('#12')).toBe(12)
    expect(issueRef(' #12 ')).toBe(12)
    expect(issueRef('https://github.com/o/r/issues/12')).toBe(12)
    expect(issueRef('https://github.com/o/r/issues/12', 'o/r')).toBe(12)
    expect(issueRef('https://github.com/O/R/issues/12', 'o/r')).toBe(12)
  })
  test('a URL naming another repo is not used when the repo is known', async () => {
    const { issueRef } = await merge()
    expect(issueRef('https://github.com/x/y/issues/12', 'o/r')).toBe(undefined)
  })
  test('anything else is undefined', async () => {
    const { issueRef } = await merge()
    for (const v of ['abc', '0', '#0', '', undefined, '12abc', 'https://github.com/o/r/pull/12', '#', 1.5]) expect(issueRef(v)).toBe(undefined)
  })
})

describe('MOD-216: issueNote', () => {
  test('no note for a number, #n, a same-repo URL, or an absent value', async () => {
    const { issueNote } = await merge()
    for (const v of [undefined, '', '12', '#12', 12, 'https://github.com/o/r/issues/12']) expect(issueNote('issue', v, 'o/r')).toBe(undefined)
  })
  test('junk is one line naming the value', async () => {
    const { issueNote } = await merge()
    expect(issueNote('issue', 'abc', 'o/r')).toBe('issue: abc is not an issue number; no status comments or close for this card')
    expect(issueNote('parent', 'abc', 'o/r')).toBe('parent: abc is not an issue number; no parent close for this card')
  })
  test('a foreign-repo URL names the repo', async () => {
    const { issueNote } = await merge()
    expect(issueNote('issue', 'https://github.com/x/y/issues/12', 'o/r')).toBe('issue: https://github.com/x/y/issues/12 names x/y, not o/r; no status comments or close for this card')
  })
})

describe('MOD-216: parked', () => {
  test('dispatch refuses a parked card', async () => {
    const { checkStatus, parseCard } = await dispatch()
    const c = parseCard('---\nid: A-1\ntitle: t\ndomain: mod\ntier: standard\nstatus: parked\nscope: [a/**]\ngate: node\n---\n## Done when\n\n- x\n')
    expect(checkStatus(c)).toBe('A-1 is parked; set status: queued to dispatch it')
  })
  test('openCards leaves parked cards out, as merged ones', async () => {
    const { openCards } = await land()
    const cards = ['queued', 'parked', 'merged'].map((s, n) => ({ id: `A-${n}`, title: 't', status: s, parent: undefined, scope: [] }))
    expect(openCards(cards, new Set()).map(c => c.id)).toEqual(['A-0'])
  })
})
