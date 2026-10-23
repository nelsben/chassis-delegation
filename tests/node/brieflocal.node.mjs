// MOD-124 (#188): the pure parts of briefLocal and allow:. Pure.
import { test, expect, describe } from './kit.mjs'

const FILE = 'Rule one.\nRule two.\n\n### allow: live-reads\nRead the app.\nNever save.\n\n### allow: b-block\nOther.\n'

describe('MOD-124: the briefLocal section split', () => {
  test('text before the first ### allow:, each block by id, a missing id', async () => {
    const m = await import('../../hooks/lib/brieflocal.ts')
    const s = m.splitLocal(FILE)
    expect(s.rules).toBe('Rule one.\nRule two.')
    expect(s.blocks['live-reads']).toBe('Read the app.\nNever save.')
    expect(s.blocks['b-block']).toBe('Other.')
    expect(s.blocks['nope']).toBe(undefined)
  })
  test('a file with no allow heading is all rules', async () => {
    const m = await import('../../hooks/lib/brieflocal.ts')
    expect(m.splitLocal('Just a rule.\n')).toEqual({ rules: 'Just a rule.', blocks: {} })
  })
})

describe('MOD-124: the render', () => {
  test('exact headings, order: extra, local rules, exceptions', async () => {
    const m = await import('../../hooks/lib/brieflocal.ts')
    const out = m.renderLocal('EXTRA', FILE, ['live-reads'])
    expect(out).toBe('EXTRA\n\n## Local rules (not for debrief)\n\nRule one.\nRule two.\n\n## Exception for this card: live-reads\n\nRead the app.\nNever save.')
  })
  test('nothing local and no ids leaves extra untouched', async () => {
    const m = await import('../../hooks/lib/brieflocal.ts')
    expect(m.renderLocal('EXTRA', undefined, [])).toBe('EXTRA')
    expect(m.renderLocal('', undefined, [])).toBe('')
  })
  test('allow clause', async () => {
    const m = await import('../../hooks/lib/brieflocal.ts')
    expect(m.allowClause(['a', 'b'])).toBe(' allow=a,b')
    expect(m.allowClause([])).toBe('')
  })
})

describe('MOD-124: card allow list parsing', () => {
  test('a frontmatter list is read; absent is none', async () => {
    const d = await import('../../hooks/lib/dispatch.ts')
    const c = d.parseCard('---\nid: X-1\ntitle: t\ndomain: ops\nallow: [live-reads, b]\n---\nbody')
    expect(c.allow).toEqual(['live-reads', 'b'])
    expect(d.parseCard('---\nid: X-1\n---\nb').allow).toEqual([])
  })
})

describe('MOD-124: the debrief never quotes the local section', () => {
  const brief = 'Rules.\n\n## Local rules (not for debrief)\n\nNever write to the shared app outside your own window.\n\n## Exception for this card: live-reads\n\nYou may read the shared app while you work.\n\n## The card\n\nThe rate ladder loads the current tables\n'
  const f = (title, body = '') => ({ title, body, evidence: [], surface: '' })
  test('a finding quoting a local-rules line is dropped; one quoting the card title is kept', async () => {
    const r = await import('../../hooks/lib/redact.ts')
    const kept = r.dropLocalQuotes([f('The brief said: Never write to the shared app outside your own window.'), f('Worker ignored the exception', 'You may read the shared app while you work.'), f('The rate ladder loads the current tables was vague')], [brief])
    expect(kept.map(x => x.title)).toEqual(['The rate ladder loads the current tables was vague'])
  })
  test('no brief with a local section drops nothing', async () => {
    const r = await import('../../hooks/lib/redact.ts')
    expect(r.dropLocalQuotes([f('anything at all here')], ['plain brief']).length).toBe(1)
  })
})
