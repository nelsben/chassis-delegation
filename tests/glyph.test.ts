import { test, expect, describe } from 'claude-code/testing'
import { BUILTIN_GLYPHS, glyphIssues, modelGlyph, parseGlyphs, withGlyph, type GlyphMap } from '../hooks/lib/glyph'
import { bandLines, openItemLines } from '../hooks/lib/dashboard'
import { quietLine } from '../hooks/lib/quiet'
import { handedBackRow, runningSection, startedRow } from '../hooks/lib/rows'

describe('MOD-78: modelGlyph', () => {
  test('each built-in alias, a raw id, an unknown alias', () => {
    expect(modelGlyph('haiku', BUILTIN_GLYPHS)).toBe('🟢')
    expect(modelGlyph('sonnet', BUILTIN_GLYPHS)).toBe('🔵')
    expect(modelGlyph('opus', BUILTIN_GLYPHS)).toBe('🟣')
    expect(modelGlyph('fable', BUILTIN_GLYPHS)).toBe('🟠')
    expect(modelGlyph('claude-sonnet-5-5', BUILTIN_GLYPHS)).toBe('🔵')
    expect(modelGlyph('mystery', BUILTIN_GLYPHS)).toBe('⚪')
  })
  test('a custom map wins; an alias the map names (a future model) is found by its own name', () => {
    const m = parseGlyphs('sonnet=🟦, nova=⭐') as GlyphMap
    expect(modelGlyph('claude-sonnet-5-5', m)).toBe('🟦')
    expect(modelGlyph('nova', m)).toBe('⭐')
    expect(modelGlyph('opus', m)).toBe('🟣')
  })
})

describe('MOD-78: parseGlyphs', () => {
  test('pairs, off, empty', () => {
    expect(parseGlyphs('opus=🟣, sonnet=🔵')).toMatchObject({ opus: '🟣', sonnet: '🔵' })
    expect(parseGlyphs('off')).toBe('off')
    expect(parseGlyphs('')).toEqual(BUILTIN_GLYPHS)
  })
  test('a malformed entry is ignored and named; a too-long glyph is refused; a variation selector is one glyph', () => {
    const m = parseGlyphs('sonnet, opus=🟣, haiku=ab, fable=❤️') as GlyphMap
    expect(m.opus).toBe('🟣')
    expect(m.haiku).toBe('🟢')
    expect(m.fable).toBe('❤️')
    expect(glyphIssues('sonnet, opus=🟣, haiku=ab')).toHaveLength(2)
  })
  test('withGlyph prefixes once', () => {
    expect(withGlyph('go', '🔵', BUILTIN_GLYPHS)).toBe('🔵 go')
    expect(withGlyph('🟣 go', '🔵', BUILTIN_GLYPHS)).toBe('🟣 go')
    expect(withGlyph('go', '', BUILTIN_GLYPHS)).toBe('go')
  })
})

describe('MOD-78: the pure rows', () => {
  test('the glyph sits immediately before the alias; none given, none shown', () => {
    expect(startedRow({ label: 'T-1', alias: 'opus', tier: 'frontier', attempt: 1, budget: 2, kind: 'started', glyph: '🟣' })).toBe('chassis-delegation: T-1 started · 🟣 opus (frontier) · attempt 1/2')
    expect(handedBackRow({ label: 'T-1', alias: 'opus', minutes: 3, glyph: '🟣' })).toBe('chassis-delegation: T-1 handed back · 🟣 opus · 3 min · $? · verifying · land after the verdict')
    expect(runningSection([{ label: 'T-1', alias: 'opus', tier: 'frontier', state: 'running', minutes: 1, glyph: '🟣' }], 'sonnet', '🔵')).toEqual(['running:', 'T-1 · 🟣 opus (frontier) · running · 1 min · $?', 'brain: 🔵 sonnet'])
    expect(quietLine({ task: 'T-1', attempt: 1, budget: 2, verdict: 'consistent', alias: 'sonnet', glyph: '🔵', next: 'accept', lines: [] })).toContain(' · 🔵 sonnet · next=accept')
    expect(quietLine({ task: 'T-1', attempt: 1, budget: 2, verdict: 'consistent', alias: 'sonnet', next: 'accept', lines: [] })).toContain(' · sonnet · next=accept')
  })
  test('the band and the pane lines', () => {
    const g = (a: string) => (a === 'sonnet' ? '🟦' : '')
    const running = [{ kind: 'running', task: 'T-1', tier: 'standard', alias: 'sonnet', at: 0, phase: 'building' }] as never
    expect(bandLines(running, 0, 100, g)[0]!.text).toContain('standard/🟦 sonnet')
    expect(bandLines(running, 0, 100)[0]!.text).toContain('standard/sonnet')
    expect(openItemLines(running, 0, false, g)[0]).toContain('running standard/🟦 sonnet')
  })
})
