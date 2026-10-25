// MOD-140: the hedge-word hint on a Done when line. Pure.
import { test, expect, describe } from './kit.mjs'

const lib = () => import('../../hooks/lib/dispatch.ts')
const hint = (n, w) => `hint: done-when line ${n} says "${w}": the worker decides that alone; name the outcome`

describe('MOD-140: hedgeHints', () => {
  test('one hedge word on line 2', async () => {
    const { hedgeHints } = await lib()
    expect(hedgeHints(['Writes the file.', 'Handle errors appropriately.'])).toEqual([hint(2, 'appropriately')])
  })
  test('the list is the 20 phrases', async () => {
    const { HEDGE_WORDS } = await lib()
    expect(HEDGE_WORDS).toHaveLength(20)
    expect(HEDGE_WORDS[0]).toBe('appropriate')
    expect(HEDGE_WORDS[19]).toBe('better')
  })
  test('two in one line: the first by position wins', async () => {
    const { hedgeHints } = await lib()
    expect(hedgeHints(['Tidy it and make it sensible.'])).toEqual([hint(1, 'Tidy')])
    expect(hedgeHints(['Make it sensible and tidy.'])).toEqual([hint(1, 'sensible')])
  })
  test('case-insensitive, original case kept', async () => {
    const { hedgeHints } = await lib()
    expect(hedgeHints(['It Works PROPERLY.'])).toEqual([hint(1, 'PROPERLY')])
  })
  test('word boundaries: inappropriate matches nothing, etc. matches etc', async () => {
    const { hedgeHints } = await lib()
    expect(hedgeHints(['That is inappropriate.', 'A betterment of the tidying.'])).toEqual([])
    expect(hedgeHints(['Add a, b, etc.'])).toEqual([hint(1, 'etc')])
  })
  test('text in backticks is skipped', async () => {
    const { hedgeHints } = await lib()
    expect(hedgeHints(['Quotes `appropriately` and `as needed` in code.'])).toEqual([])
    expect(hedgeHints(['Quotes `appropriately` but says improve.'])).toEqual([hint(1, 'improve')])
  })
  test('a clean card gives none', async () => {
    const { hedgeHints } = await lib()
    expect(hedgeHints(['Writes the file.', 'Returns 3.'])).toEqual([])
    expect(hedgeHints([])).toEqual([])
  })
  test('at most 3 lines, then one closing count', async () => {
    const { hedgeHints } = await lib()
    const lines = ['a tidy', 'b sensible', 'c better', 'd properly', 'e as needed']
    expect(hedgeHints(lines)).toEqual([hint(1, 'tidy'), hint(2, 'sensible'), hint(3, 'better'), 'hint: 2 more done-when lines hedge'])
    expect(hedgeHints(lines.slice(0, 4))).toEqual([hint(1, 'tidy'), hint(2, 'sensible'), hint(3, 'better'), 'hint: 1 more done-when lines hedge'])
  })
  test('list markers and blank lines: the statement number counts list items', async () => {
    const { hedgeHints } = await lib()
    expect(hedgeHints(['', '- Writes it.', '  continued', '- Clean up after.', ''])).toEqual([hint(2, 'Clean up')])
  })
})
