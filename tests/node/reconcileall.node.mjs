// MOD-299: tree reconcile all, the pure half: the epic list order, the combined report with one close block, the cap line, the args.
import { test, expect, describe } from './kit.mjs'

const lib = () => import('../../hooks/lib/reconcile.ts')
const empty = { done: [], closedOpen: [], noMatch: [], notRead: [] }
const partA = { number: 5, title: 'Export', result: { done: [{ number: 61, title: 'Fix header', card: 'MOD-9', pr: 41 }], closedOpen: [], noMatch: [{ number: 63, title: 'Odd', }], notRead: [] } }
const partB = { number: 9, title: 'Import', result: { done: [{ number: 71, title: 'Parse', card: 'MOD-3' }], closedOpen: [], noMatch: [{ number: 73, title: 'Stray' }], notRead: [74] } }

describe('epicsOf', () => {
  test('orders descending (newest first) and keeps number and title', async () => {
    const { epicsOf } = await lib()
    expect(epicsOf([{ number: 2, title: 'a' }, { number: 9, title: 'b' }, { number: 'x' }, null])).toEqual([{ number: 9, title: 'b' }, { number: 2, title: 'a' }])
  })
  test('not a list is empty', async () => {
    const { epicsOf } = await lib()
    expect(epicsOf({})).toEqual([])
    expect(epicsOf([])).toEqual([])
  })
})

describe('reconcileAllText', () => {
  test('headings, lists unchanged, one close block with done first then not planned', async () => {
    const { reconcileAllText } = await lib()
    const t = reconcileAllText([partA, partB], 'o/r')
    const lines = t.split('\n')
    expect(lines).toContain('## #5 Export')
    expect(lines).toContain('## #9 Import')
    expect(lines).toContain('#61 Fix header — done in MOD-9 (#41)')
    expect(lines).toContain('#74 — not read: run /delegation tree reconcile 9')
    const first = lines.indexOf("gh issue close 61 --repo o/r --comment 'done in MOD-9 (#41)'")
    const second = lines.indexOf("gh issue close 71 --repo o/r --comment 'done in MOD-3'")
    const third = lines.indexOf("# gh issue close 63 --repo o/r --comment 'not planned'")
    expect(first).toBeGreaterThan(lines.indexOf('## #9 Import'))
    expect(first < second && second < third).toBe(true)
    expect(lines.filter(l => l === '').length).toBe(1)
  })
  test('an empty epic prints nothing to reconcile and no close block', async () => {
    const { reconcileAllText } = await lib()
    const t = reconcileAllText([{ number: 5, title: 'Export', result: empty }], 'o/r')
    expect(t).toBe('## #5 Export\nnothing to reconcile')
  })
  test('a not-read child prints the per-epic row and no run-level not-read line', async () => {
    const { reconcileAllText } = await lib()
    const t = reconcileAllText([partB], 'o/r')
    expect(t).toContain('#74 — not read: run /delegation tree reconcile 9')
    expect(t).not.toContain('epics (')
    expect(t.split('\n').some(l => l.startsWith('not read:'))).toBe(false)
  })
})

describe('parseReconcileArgs all', () => {
  test('the word all in place of the number', async () => {
    const { parseReconcileArgs, RECONCILE_USAGE } = await lib()
    expect(parseReconcileArgs('all')).toEqual({ all: true, confirm: false })
    expect(parseReconcileArgs(' all --confirm')).toEqual({ all: true, confirm: true })
    expect(parseReconcileArgs('all 5')).toEqual({ error: `usage: ${RECONCILE_USAGE}` })
    expect(RECONCILE_USAGE).toBe('/delegation tree reconcile <n>|all [--confirm]')
  })
})
