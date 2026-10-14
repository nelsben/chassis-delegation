// MOD-78: the glyph that marks each model on the host's subagent row and on every mod row. Pure: no `$`.
import { aliasOf } from './tier'

export type GlyphMap = Readonly<Record<string, string>>

/** haiku, sonnet, opus and fable; `other` is any alias not in the map. */
export const BUILTIN_GLYPHS: GlyphMap = { haiku: '🟢', sonnet: '🔵', opus: '🟣', fable: '🟠', other: '⚪' }

/** The built-in map, as the `in effect:` line of the option shows it. */
export const builtinGlyphText = (): string => Object.entries(BUILTIN_GLYPHS).map(([k, v]) => `${k}=${v}`).join(', ')

/** One grapheme cluster (a variation selector or a joined emoji is part of its cluster). */
function oneGrapheme(s: string): boolean {
  if (s === '') return false
  try {
    const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    let n = 0
    for (const _ of seg.segment(s)) n += 1
    return n === 1
  } catch {
    return [...s].length <= 2
  }
}

/** The glyph for an alias or a raw model id: the exact key, else its family (`claude-sonnet-5-5` is sonnet), else `other`. */
export function modelGlyph(alias: string, map: GlyphMap): string {
  const key = alias.trim().toLowerCase()
  const family = aliasOf(key)
  return map[key] ?? (family ? map[family] : undefined) ?? map.other ?? BUILTIN_GLYPHS.other!
}

/** What `parseGlyphs` left out, one line each: for the debug log. */
export function glyphIssues(text: string): string[] {
  const out: string[] = []
  for (const raw of text.split(',')) {
    const entry = raw.trim()
    if (entry === '' || entry === 'off') continue
    const m = /^([A-Za-z0-9._-]+)\s*=\s*(\S+)$/.exec(entry)
    if (!m) out.push(`modelGlyphs: "${entry}" is not alias=glyph; ignored`)
    else if (!oneGrapheme(m[2] as string)) out.push(`modelGlyphs: "${entry}" has a glyph longer than one character; ignored`)
  }
  return out
}

/** `alias=glyph` pairs, the word `off`, or empty (the built-in map); the pairs overlay the built-in map. */
export function parseGlyphs(text: string): GlyphMap | 'off' {
  const t = (text ?? '').trim()
  if (t.toLowerCase() === 'off') return 'off'
  const map: Record<string, string> = { ...BUILTIN_GLYPHS }
  for (const raw of t.split(',')) {
    const m = /^([A-Za-z0-9._-]+)\s*=\s*(\S+)$/.exec(raw.trim())
    if (m && oneGrapheme(m[2] as string)) map[(m[1] as string).toLowerCase()] = m[2] as string
  }
  return map
}

const firstGrapheme = (s: string): string => {
  try {
    for (const g of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)) return g.segment
  } catch {
    // fall through
  }
  return [...s][0] ?? ''
}

/** `<glyph> <description>` once: a description that already starts with a glyph of the map (or a built-in one) is kept. */
export function withGlyph(description: string, glyph: string, map: GlyphMap): string {
  if (glyph === '') return description
  const known = new Set([...Object.values(BUILTIN_GLYPHS), ...Object.values(map)])
  const first = firstGrapheme(description)
  return first !== '' && known.has(first) ? description : description === '' ? glyph : `${glyph} ${description}`
}
