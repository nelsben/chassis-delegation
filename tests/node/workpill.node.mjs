// MOD-404 (#567): the Work pane's status pill and progress bar on a remote surface, the pure half: pillSvg and barSvg.
import { test, expect, describe } from './kit.mjs'

const lib = () => import('../../hooks/lib/work.ts')

describe('MOD-404 (#567): the status pill, pure', () => {
  test('review is a filled pill of the measured width that holds TO REVIEW', async () => {
    const { pillSvg, LOZENGE } = await lib()
    const p = pillSvg('review', 'light')
    expect(p.width).toBe(Math.round(12 + 6.6 * 9))
    expect(p.source.startsWith('<svg')).toBe(true)
    expect(p.source.includes('TO REVIEW')).toBe(true)
    expect(p.source.includes(`fill="${LOZENGE.review.light.bg}"`)).toBe(true)
    expect(p.source.includes('stroke=')).toBe(false)
  })

  test('backlog is an outline: a stroke and no fill', async () => {
    const { pillSvg } = await lib()
    const p = pillSvg('backlog', 'dark')
    expect(p.source.includes('stroke=')).toBe(true)
    expect(p.source.includes('fill="none"')).toBe(true)
    expect(p.source.includes('BACKLOG')).toBe(true)
  })
})

describe('MOD-404 (#567): the progress bar, pure', () => {
  const rects = (s) => s.match(/<rect /g) ?? []
  const doneWidth = (s) => Number(/<rect width="(\d+)" height="6" rx="3" fill="#(?:216e4e|7ee2b8)"/.exec(s)?.[1] ?? -1)

  test('nothing done draws the track alone', async () => {
    const { barSvg } = await lib()
    expect(rects(barSvg(0, 4, 'dark')).length).toBe(1)
  })

  test('half done draws a done rect of 32', async () => {
    const { barSvg } = await lib()
    const s = barSvg(2, 4, 'dark')
    expect(rects(s).length).toBe(2)
    expect(doneWidth(s)).toBe(32)
  })

  test('more done than leaves is clamped to 64, and no leaves draws the track alone', async () => {
    const { barSvg } = await lib()
    expect(doneWidth(barSvg(5, 4, 'light'))).toBe(64)
    expect(rects(barSvg(0, 0, 'light')).length).toBe(1)
  })
})
