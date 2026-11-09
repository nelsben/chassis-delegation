// MOD-338: the choices a worker lists in its hand-back, counted and never judged. Pure.
import { test, expect, describe } from './kit.mjs'

const H = () => import('../../hooks/lib/handback.ts')
const R = '[[report v=1 task=T-1 subtask=main branch=none pr=none sha=none gate=pass red=none files=none]]'

describe('MOD-338: handbackChoices', () => {
  test('two choice lines above the report', async () => {
    const { handbackChoices } = await H()
    expect(handbackChoices(`choice: helper name -> rollUp\nchoice: bar width -> 8 cells\n${R}`)).toEqual({ stated: true, count: 2, lines: ['helper name -> rollUp', 'bar width -> 8 cells'] })
  })
  test('choice: none', async () => {
    const { handbackChoices } = await H()
    expect(handbackChoices(`choice: none\n${R}`)).toEqual({ stated: true, count: 0, lines: [] })
    const c = handbackChoices(`Choice: None.\n${R}`)
    expect(c.stated).toBe(true)
    expect(c.count).toBe(0)
  })
  test('nothing stated', async () => {
    const { handbackChoices } = await H()
    expect(handbackChoices(`Done.\n${R}`)).toEqual({ stated: false, count: 0, lines: [] })
  })
  test('list markers, backticks and leading spaces', async () => {
    const { handbackChoices } = await H()
    const c = handbackChoices(`- choice: a -> b\n* \`choice: c -> d\`\n  choice: e -> f\n${R}`)
    expect(c.count).toBe(3)
    expect(c.lines).toEqual(['a -> b', 'c -> d', 'e -> f'])
  })
  test('after the last report is not read', async () => {
    const { handbackChoices } = await H()
    expect(handbackChoices(`${R}\nchoice: late -> x`).stated).toBe(false)
  })
  test('the same choice twice counts once', async () => {
    const { handbackChoices } = await H()
    expect(handbackChoices(`choice: a -> b\nchoice: a -> b\n${R}`).count).toBe(1)
  })
  test('none with a choice: the choice counts', async () => {
    const { handbackChoices } = await H()
    expect(handbackChoices(`choice: none\nchoice: a -> b\n${R}`)).toEqual({ stated: true, count: 1, lines: ['a -> b'] })
  })
  test('14 distinct choices: count 14, 12 lines', async () => {
    const { handbackChoices } = await H()
    const body = Array.from({ length: 14 }, (_, i) => `choice: q${i} -> a${i}`).join('\n')
    const c = handbackChoices(`${body}\n${R}`)
    expect(c.count).toBe(14)
    expect(c.lines.length).toBe(12)
  })
  test('a 300-character choice is cut to 160', async () => {
    const { handbackChoices } = await H()
    const long = 'x'.repeat(300)
    const c = handbackChoices(`choice: ${long}\n${R}`)
    expect(c.count).toBe(1)
    expect(c.lines).toEqual(['x'.repeat(160)])
  })
  test('a line not starting with choice: and an empty choice are not choices', async () => {
    const { handbackChoices } = await H()
    expect(handbackChoices(`My choice: x -> y\n${R}`).stated).toBe(false)
    expect(handbackChoices(`choice:\n${R}`).stated).toBe(false)
  })
  test('no report at all reads the whole text', async () => {
    const { handbackChoices } = await H()
    const c = handbackChoices('choice: a -> b')
    expect(c.stated).toBe(true)
    expect(c.count).toBe(1)
  })
})
