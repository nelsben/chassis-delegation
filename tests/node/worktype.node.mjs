// MOD-397 (#554): the Work pane's type mark on a remote surface is an inline SVG icon: typeIcon and TYPE_GLYPH_SVG, the pure half.
import { test, expect, describe } from './kit.mjs'

const lib = () => import('../../hooks/lib/work.ts')
const TYPES = ['epic', 'feature', 'story', 'task', 'bug', 'spike', 'issue']

describe('MOD-397 (#554): the type icon, pure', () => {
  test('typeIcon for each of the seven types is an svg that holds the type colour', async () => {
    const { typeIcon, markColor } = await lib()
    for (const t of TYPES) {
      const s = typeIcon(t, 'light')
      expect(s.startsWith('<svg')).toBe(true)
      expect(s.endsWith('</svg>')).toBe(true)
      expect(s.includes(markColor(t, 'light'))).toBe(true)
    }
  })

  test('the dark spike icon holds the lighter dark grey, not the light one', async () => {
    const { typeIcon } = await lib()
    expect(typeIcon('spike', 'dark').includes('#8c9bab')).toBe(true)
  })

  test('every TYPE_GLYPH_SVG value is non-empty and holds no class=', async () => {
    const { TYPE_GLYPH_SVG } = await lib()
    for (const t of TYPES) {
      expect(typeof TYPE_GLYPH_SVG[t]).toBe('string')
      expect(TYPE_GLYPH_SVG[t].length > 0).toBe(true)
      expect(TYPE_GLYPH_SVG[t].includes('class=')).toBe(false)
    }
  })
})
