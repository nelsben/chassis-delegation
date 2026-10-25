// MOD-137: the review note's "For the mod owner" section, pure.
import { test, expect, describe } from './kit.mjs'

const N = () => import('../../hooks/lib/notes.ts')

const NOTE = [
  '# Round review',
  '',
  'Some prose.',
  '',
  '## For the mod owner',
  '',
  '- P2 The verifier missed a late hand-back. It said nothing.',
  '  Evidence: verdict row MOD-9 refuted at abc123',
  '  more detail here',
  '- A plain bullet about the dispatch queue stalling',
  '',
  '## Next',
  '- not this',
].join('\n')

describe('MOD-137: ownerSection', () => {
  test('returns the lines under the heading up to the next heading of the same level', async () => {
    const { ownerSection } = await N()
    const lines = ownerSection(NOTE)
    expect(lines.includes('- not this')).toBe(false)
    expect(lines.some(l => l.startsWith('- A plain bullet'))).toBe(true)
  })
  test('a deeper heading stays inside; a higher one ends it', async () => {
    const { ownerSection } = await N()
    const md = '### For the Mod Owner\n- a\n#### sub\n- b\n## Up\n- c'
    expect(ownerSection(md).filter(l => l.startsWith('-'))).toEqual(['- a', '- b'])
  })
  test('no section is no lines', async () => {
    const { ownerSection } = await N()
    expect(ownerSection('# T\n- a')).toEqual([])
  })
  test('a section at the end runs to the end', async () => {
    const { ownerSection } = await N()
    expect(ownerSection('# T\n## For the mod owner\n- a\n- b').filter(l => l.startsWith('-'))).toEqual(['- a', '- b'])
  })
})

describe('MOD-137: noteFindings', () => {
  test('two bullets, the nested Evidence line kept', async () => {
    const { noteFindings } = await N()
    const f = noteFindings(NOTE, 'review note note.md')
    expect(f.length).toBe(2)
    expect(f[0].evidence).toEqual(['Evidence: verdict row MOD-9 refuted at abc123'])
    expect(f[0].source).toBe('review note note.md')
    expect(f[0].kind).toBe('went_wrong')
    expect(f[0].fault_class).toBe('design')
    expect(f[0].severity).toBe('P2')
    expect(f[0].surface).toBe('verifier')
    expect(f[0].body.includes('more detail here')).toBe(true)
    expect(f[1].severity).toBe('P3')
    expect(f[1].surface).toBe('dispatch')
    expect(f[1].evidence).toEqual(['A plain bullet about the dispatch queue stalling'])
  })
  test('no surface named falls back to the mod in general', async () => {
    const { noteFindings } = await N()
    const f = noteFindings('## For the mod owner\n- something odd happened', 'review note n.md')
    expect(f[0].surface).toBe('debrief')
  })
  test('the title is the first sentence cut to 80', async () => {
    const { noteFindings } = await N()
    const long = 'x'.repeat(100)
    const f = noteFindings(`## For the mod owner\n- ${long}. Second.`, 's')
    expect(f[0].title.length <= 80).toBe(true)
    expect(noteFindings('## For the mod owner\n- Short one. Second.', 's')[0].title).toBe('Short one.')
  })
  test('an empty or missing section gives none', async () => {
    const { noteFindings } = await N()
    expect(noteFindings('# nothing', 's')).toEqual([])
    expect(noteFindings('## For the mod owner\n\n## Next\n- a', 's')).toEqual([])
  })
})
