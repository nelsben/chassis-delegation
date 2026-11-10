// MOD-354: the Work pane's pure layout: workLayout, progressCells, keySlug, and the colour tables.
import { test, expect, describe } from './kit.mjs'

const lib = () => import('../../hooks/lib/work.ts')

describe('MOD-354', () => {
  test('workLayout: 60 columns is narrow, the work column takes the body less 12', async () => {
    const { workLayout } = await lib()
    expect(workLayout(60)).toEqual({ mode: 'narrow', work: 48, status: 12, progress: 0, card: 0, worker: 0, cost: 0 })
  })

  test('workLayout: 71 columns is still narrow', async () => {
    const { workLayout } = await lib()
    expect(workLayout(71)).toEqual({ mode: 'narrow', work: 59, status: 12, progress: 0, card: 0, worker: 0, cost: 0 })
  })

  test('workLayout: 72 columns is medium, with progress and card, and the work column is columns less 38', async () => {
    const { workLayout } = await lib()
    expect(workLayout(72)).toEqual({ mode: 'medium', work: 34, status: 12, progress: 16, card: 10, worker: 0, cost: 0 })
  })

  test('workLayout: 115 columns is medium', async () => {
    const { workLayout } = await lib()
    expect(workLayout(115)).toEqual({ mode: 'medium', work: 77, status: 12, progress: 16, card: 10, worker: 0, cost: 0 })
  })

  test('workLayout: 116 columns is wide, with worker and cost, and the work column is columns less 68', async () => {
    const { workLayout } = await lib()
    expect(workLayout(116)).toEqual({ mode: 'wide', work: 48, status: 12, progress: 16, card: 10, worker: 22, cost: 8 })
  })

  test('workLayout: 160 columns is wide', async () => {
    const { workLayout } = await lib()
    expect(workLayout(160)).toEqual({ mode: 'wide', work: 92, status: 12, progress: 16, card: 10, worker: 22, cost: 8 })
  })

  test('workLayout: a narrow work column never goes below 16 cells', async () => {
    const { workLayout } = await lib()
    expect(workLayout(20).work).toBe(16)
    expect(workLayout(20).mode).toBe('narrow')
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
