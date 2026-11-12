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

describe('MOD-366: handbackAdvisor', () => {
  test('no line', async () => {
    const { handbackAdvisor } = await H()
    expect(handbackAdvisor(`done\n${R}`)).toBe(undefined)
    expect(handbackAdvisor(`advisor:\n${R}`)).toBe(undefined)
  })
  test('no change', async () => {
    const { handbackAdvisor } = await H()
    expect(handbackAdvisor(`advisor: no change\n${R}`)).toEqual({ said: 'no-change' })
    expect(handbackAdvisor(`Advisor: No change.\n${R}`)).toEqual({ said: 'no-change' })
  })
  test('changed with a what, and changed alone', async () => {
    const { handbackAdvisor } = await H()
    expect(handbackAdvisor(`- advisor: changed moved the gate output out of the worktree\n${R}`)).toEqual({ said: 'changed', what: 'moved the gate output out of the worktree' })
    expect(handbackAdvisor(`advisor: changed\n${R}`)).toEqual({ said: 'changed' })
  })
  test('a backticked line', async () => {
    const { handbackAdvisor } = await H()
    expect(handbackAdvisor('`advisor: changed the order`\n' + R)).toEqual({ said: 'changed', what: 'the order' })
  })
  test('another wording is other', async () => {
    const { handbackAdvisor } = await H()
    expect(handbackAdvisor(`advisor: told me to read more\n${R}`)).toEqual({ said: 'other', what: 'told me to read more' })
  })
  test('the last line wins', async () => {
    const { handbackAdvisor } = await H()
    expect(handbackAdvisor(`advisor: changed a\nadvisor: no change\n${R}`)).toEqual({ said: 'no-change' })
  })
  test('a line below the last report is not read', async () => {
    const { handbackAdvisor } = await H()
    expect(handbackAdvisor(`${R}\nadvisor: changed a`)).toBe(undefined)
  })
  test('a long what is cut at 160', async () => {
    const { handbackAdvisor } = await H()
    const r = handbackAdvisor(`advisor: changed ${'x'.repeat(300)}\n${R}`)
    expect(r.said).toBe('changed')
    expect(r.what.length).toBe(160)
  })
})

describe('MOD-369: handbackTried', () => {
  test('no tried line', async () => {
    const { handbackTried } = await H()
    expect(handbackTried(`Done.\n${R}`)).toEqual({ count: 0, lines: [] })
  })
  test('one tried line', async () => {
    const { handbackTried } = await H()
    expect(handbackTried(`tried: changed a -> b still fails\n${R}`)).toEqual({ count: 1, lines: ['changed a -> b still fails'] })
  })
  test('two tried lines', async () => {
    const { handbackTried } = await H()
    expect(handbackTried(`tried: r1 -> f1\ntried: r2 -> f2\n${R}`)).toEqual({ count: 2, lines: ['r1 -> f1', 'r2 -> f2'] })
  })
  test('a bulleted and a backticked line', async () => {
    const { handbackTried } = await H()
    const t = handbackTried(`- tried: a -> b\n* \`tried: c -> d\`\n  tried: e -> f\n${R}`)
    expect(t.count).toBe(3)
    expect(t.lines).toEqual(['a -> b', 'c -> d', 'e -> f'])
  })
  test('a repeated line counts once', async () => {
    const { handbackTried } = await H()
    expect(handbackTried(`tried: a -> b\ntried: a -> b\n${R}`).count).toBe(1)
  })
  test('an empty body is not a line', async () => {
    const { handbackTried } = await H()
    expect(handbackTried(`tried:\ntried:   \n${R}`)).toEqual({ count: 0, lines: [] })
  })
  test('a line below the last report is not read', async () => {
    const { handbackTried } = await H()
    expect(handbackTried(`${R}\ntried: late -> x`)).toEqual({ count: 0, lines: [] })
  })
  test('eight lines: count 8, six kept', async () => {
    const { handbackTried } = await H()
    const body = Array.from({ length: 8 }, (_, i) => `tried: r${i} -> f${i}`).join('\n')
    const t = handbackTried(`${body}\n${R}`)
    expect(t.count).toBe(8)
    expect(t.lines).toHaveLength(6)
    expect(t.lines[0]).toBe('r0 -> f0')
  })
  test('a long line is cut at 160', async () => {
    const { handbackTried } = await H()
    const t = handbackTried(`tried: ${'x'.repeat(300)}\n${R}`)
    expect(t.count).toBe(1)
    expect(t.lines[0].length).toBe(160)
  })
})
