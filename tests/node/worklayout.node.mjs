// MOD-354: the Work pane's pure layout: workLayout, progressCells, keySlug, and the colour tables.
// MOD-390 (#540): one Card column, workLayout has no progress key; markColor lightens the dark grey marks.
import { test, expect, describe } from './kit.mjs'

const lib = () => import('../../hooks/lib/work.ts')

describe('MOD-354', () => {
  test('workLayout: 20 columns is narrow, the status is a dot, the work column takes the body less the status', async () => {
    const { workLayout } = await lib()
    expect(workLayout(20)).toEqual({ mode: 'narrow', work: 18, status: 2, card: 0, worker: 0, cost: 0 })
  })

  test('workLayout: 27 columns is narrow with the dot status', async () => {
    const { workLayout } = await lib()
    expect(workLayout(27)).toEqual({ mode: 'narrow', work: 25, status: 2, card: 0, worker: 0, cost: 0 })
  })

  test('workLayout: 28 columns is narrow with a full status, and the work column is never below 16', async () => {
    const { workLayout } = await lib()
    expect(workLayout(28)).toEqual({ mode: 'narrow', work: 16, status: 12, card: 0, worker: 0, cost: 0 })
  })

  test('workLayout: 71 columns is still narrow', async () => {
    const { workLayout } = await lib()
    expect(workLayout(71)).toEqual({ mode: 'narrow', work: 59, status: 12, card: 0, worker: 0, cost: 0 })
  })

  test('workLayout: 72 columns is medium with the Card column and no Worker', async () => {
    const { workLayout } = await lib()
    expect(workLayout(72)).toEqual({ mode: 'medium', work: 44, status: 12, card: 16, worker: 0, cost: 0 })
  })

  test('workLayout: 95 columns is medium with no Worker', async () => {
    const { workLayout } = await lib()
    expect(workLayout(95)).toEqual({ mode: 'medium', work: 67, status: 12, card: 16, worker: 0, cost: 0 })
  })

  test('workLayout: 96 columns is medium and shows the Worker', async () => {
    const { workLayout } = await lib()
    expect(workLayout(96)).toEqual({ mode: 'medium', work: 46, status: 12, card: 16, worker: 22, cost: 0 })
  })

  test('workLayout: 115 columns is medium', async () => {
    const { workLayout } = await lib()
    expect(workLayout(115)).toEqual({ mode: 'medium', work: 65, status: 12, card: 16, worker: 22, cost: 0 })
  })

  test('workLayout: 116 columns is wide, with worker and cost, and the work column is columns less 58', async () => {
    const { workLayout } = await lib()
    expect(workLayout(116)).toEqual({ mode: 'wide', work: 58, status: 12, card: 16, worker: 22, cost: 8 })
  })

  test('workLayout: 130 columns is wide', async () => {
    const { workLayout } = await lib()
    expect(workLayout(130)).toEqual({ mode: 'wide', work: 72, status: 12, card: 16, worker: 22, cost: 8 })
  })

  test('workLayout: no layout has a progress column', async () => {
    const { workLayout } = await lib()
    for (const c of [20, 27, 28, 71, 72, 95, 96, 115, 116, 130]) expect('progress' in workLayout(c)).toBe(false)
  })

  test('progressCells: the worked fractions of a nine-leaf parent', async () => {
    const { progressCells } = await lib()
    expect(progressCells(0, 9)).toBe(0)
    expect(progressCells(1, 9)).toBe(1)
    expect(progressCells(3, 9)).toBe(3)
    expect(progressCells(8, 9)).toBe(7)
    expect(progressCells(9, 9)).toBe(8)
  })

  test('progressCells: a sliver of progress shows one cell, a nearly done parent shows seven', async () => {
    const { progressCells } = await lib()
    expect(progressCells(1, 100)).toBe(1)
    expect(progressCells(99, 100)).toBe(7)
  })

  test('progressCells: no leaves, nothing done, is zero cells', async () => {
    const { progressCells } = await lib()
    expect(progressCells(0, 0)).toBe(0)
    expect(progressCells(2, 0)).toBe(0)
  })

  test('keySlug: an issue key becomes i<number>, any other key is unchanged', async () => {
    const { keySlug } = await lib()
    expect(keySlug('#13')).toBe('i13')
    expect(keySlug('MOD-5')).toBe('MOD-5')
    expect(keySlug('none')).toBe('none')
  })

  test('every state has a lozenge for both schemes, and backlog has no background', async () => {
    const { LOZENGE, WORK_STATES } = await lib()
    for (const s of WORK_STATES) {
      for (const scheme of ['light', 'dark']) {
        expect(typeof LOZENGE[s][scheme].fg).toBe('string')
      }
    }
    expect(LOZENGE.backlog.light.bg).toBe(undefined)
    expect(LOZENGE.backlog.dark.bg).toBe(undefined)
    expect(LOZENGE.working.light).toEqual({ bg: '#e9f2ff', fg: '#0055cc' })
  })

  test('every type has a mark, and every tier a colour', async () => {
    const { TYPE_MARK, TIER_COLOR } = await lib()
    for (const t of ['epic', 'feature', 'story', 'task', 'bug', 'spike', 'issue']) {
      expect(typeof TYPE_MARK[t].glyph).toBe('string')
      expect(typeof TYPE_MARK[t].color).toBe('string')
    }
    expect(TYPE_MARK.epic).toEqual({ glyph: '◆', color: '#8270db' })
    for (const t of ['economy', 'standard', 'frontier', 'premium']) expect(typeof TIER_COLOR[t]).toBe('string')
  })
})

describe('MOD-390 (#540)', () => {
  test('markColor: a spike and an issue are lighter grey on the dark scheme only', async () => {
    const { markColor, TYPE_MARK } = await lib()
    expect(markColor('spike', 'dark')).toBe('#8c9bab')
    expect(markColor('issue', 'dark')).toBe('#8c9bab')
    expect(markColor('spike', 'light')).toBe(TYPE_MARK.spike.color)
    expect(markColor('issue', 'light')).toBe(TYPE_MARK.issue.color)
  })

  test('markColor: every other type keeps its TYPE_MARK colour in both schemes', async () => {
    const { markColor, TYPE_MARK } = await lib()
    expect(markColor('bug', 'dark')).toBe(TYPE_MARK.bug.color)
    expect(markColor('bug', 'light')).toBe(TYPE_MARK.bug.color)
    expect(markColor('epic', 'dark')).toBe(TYPE_MARK.epic.color)
  })
})
