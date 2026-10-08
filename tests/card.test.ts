import { test, expect, describe } from 'claude-code/testing'
import { CARD_TOOL, cardFromFields, cardSummary, type CardCtx } from '../hooks/lib/card'
import { parseCard } from '../hooks/lib/dispatch'

const ctx = (over: Partial<CardCtx> = {}): CardCtx => ({
  domains: ['frontend', 'backend', 'ops'],
  gateIds: ['test', 'lint'],
  names: [],
  spendByTier: { economy: 2, standard: 6, frontier: 15 },
  ...over,
})
const input = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  title: 'The rom reader returns the header size',
  why: 'The decompiler cannot tell how big a header is. Add the reader.',
  doneWhen: ['read_header(path) returns the size', 'a unittest covers it'],
  scope: ['game_decompiler/**', 'tests/**'],
  redTest: 'python3 -m unittest tests.test_rom',
  ...over,
})
const ok = (r: ReturnType<typeof cardFromFields>) => {
  if ('error' in r) throw new Error(r.error)
  return r
}

describe('GH-111: cardFromFields', () => {
  test('the first card in a folder is OPS-1 (the first domain when ops is absent takes its first three letters)', () => {
    const r = ok(cardFromFields(input({ domain: 'ops' }), ctx()))
    expect(r.id).toBe('OPS-1')
    expect(r.file).toBe('OPS-1-the-rom-reader-returns-the-header.md')
    expect(ok(cardFromFields(input(), ctx({ domains: ['web', 'api'] }))).id).toBe('WEB-1')
    expect(ok(cardFromFields(input({ domain: 'frontend' }), ctx())).id).toBe('FE-1')
    expect(ok(cardFromFields(input({ domain: 'backend' }), ctx())).id).toBe('BE-1')
  })

  test('the next free number per prefix, over the cards already in the folder', () => {
    const names = ['README.md', 'OPS-000-sample.md', 'OPS-1-a.md', 'OPS-3-b.md', 'OPS-3b-c.md', 'BE-2-x.md']
    expect(ok(cardFromFields(input({ domain: 'ops' }), ctx({ names }))).id).toBe('OPS-4')
    expect(ok(cardFromFields(input({ domain: 'backend' }), ctx({ names }))).id).toBe('BE-3')
    expect(ok(cardFromFields(input({ domain: 'frontend' }), ctx({ names }))).id).toBe('FE-1')
  })

  test('the slug is the title in lower case, words joined by -, at most six words', () => {
    expect(ok(cardFromFields(input({ title: 'Add a `read_header()` function: it returns the size, with a test!' }), ctx())).file).toBe('OPS-1-add-a-read-header-function-it.md'.replace('OPS-1', 'OPS-1'))
    expect(ok(cardFromFields(input({ title: '!!!' }), ctx())).file).toBe('OPS-1-task.md')
  })

  test('the card parses back to what was given, with the defaults filled in', () => {
    const r = ok(cardFromFields(input(), ctx()))
    expect(r.text).toContain('## Why\n\nThe decompiler cannot tell how big a header is. Add the reader.\n')
    expect(r.text).toContain('## Done when\n\n- read_header(path) returns the size\n- a unittest covers it\n')
    const c = parseCard(r.text)
    if ('error' in c) throw new Error(c.error)
    expect(c).toMatchObject({
      id: 'OPS-1',
      title: 'The rom reader returns the header size',
      domain: 'ops',
      tier: 'standard',
      status: 'queued',
      scope: ['game_decompiler/**', 'tests/**'],
      forbid: [],
      redTest: 'python3 -m unittest tests.test_rom',
      gate: ['test'],
      budget: '2-attempts',
      spend: '6',
    })
  })

  test('tier, budget, spend, forbid and gate are taken as given', () => {
    const r = ok(cardFromFields(input({ tier: 'frontier', budget: 3, spend: 4, forbid: ['docs/**'], gate: 'lint' }), ctx()))
    const c = parseCard(r.text)
    if ('error' in c) throw new Error(c.error)
    expect(c).toMatchObject({ tier: 'frontier', budget: '3-attempts', spend: '4', forbid: ['docs/**'], gate: ['lint'] })
  })

  test('scope given as prose is refused with the fix, and so is forbid', () => {
    const e = cardFromFields(input({ scope: ['the decompiler and its tests'] }), ctx())
    expect(e).toEqual({ error: 'scope must be globs, e.g. game_decompiler/**, tests/test_rom.py (got "the decompiler and its tests")' })
    expect(cardFromFields(input({ forbid: ['anything else'] }), ctx())).toEqual({ error: 'forbid must be globs, e.g. game_decompiler/**, tests/test_rom.py (got "anything else")' })
    expect('error' in cardFromFields(input({ scope: [] }), ctx())).toBe(true)
  })

  test('a gate id missing from gateMap is refused naming the ids that exist', () => {
    expect(cardFromFields(input({ gate: 'nope' }), ctx())).toEqual({ error: 'gate nope is not in gateMap; the ids are test, lint' })
    expect(cardFromFields(input(), ctx({ gateIds: [] }))).toEqual({ error: 'gateMap has no gate; run /delegation setup, or add a gateMap entry in .chassis-delegation.json' })
  })

  test('red_test is required unless it says none', () => {
    expect('error' in cardFromFields(input({ redTest: '' }), ctx())).toBe(true)
    expect('error' in cardFromFields(input({ redTest: undefined }), ctx())).toBe(true)
    expect(ok(cardFromFields(input({ redTest: 'none' }), ctx())).text).toContain('red_test: none')
  })

  test('title, why, doneWhen, tier and domain are checked; nothing is returned to write on a refusal', () => {
    expect(cardFromFields(input({ title: '' }), ctx())).toEqual({ error: 'title is required: one line that says what done looks like' })
    expect('error' in cardFromFields(input({ why: '' }), ctx())).toBe(true)
    expect('error' in cardFromFields(input({ doneWhen: [] }), ctx())).toBe(true)
    expect(cardFromFields(input({ tier: 'huge' }), ctx())).toEqual({ error: 'tier huge is not economy, standard, frontier or premium' })
    expect(cardFromFields(input({ domain: 'legal' }), ctx())).toEqual({ error: 'domain legal is not one of frontend, backend, ops' })
    expect('error' in cardFromFields(input({ budget: 0 }), ctx())).toBe(true)
  })

  test('the summary is one line', () => {
    const r = ok(cardFromFields(input(), ctx()))
    expect(cardSummary(r, 'sonnet')).toBe('OPS-1 · standard → sonnet · scope game_decompiler/**, tests/** · gate test · red: python3 -m unittest tests.test_rom · 2 attempts · $6 ceiling')
    const n = ok(cardFromFields(input({ spend: 0 }), ctx()))
    expect(cardSummary(n, 'sonnet')).toContain('· no ceiling')
  })

  test('the tool takes the spec schema', () => {
    expect(CARD_TOOL.name).toBe('card')
    expect(CARD_TOOL.inputSchema.additionalProperties).toBe(false)
    expect(CARD_TOOL.inputSchema.required).toEqual(['title', 'why', 'doneWhen', 'scope', 'redTest'])
    expect(CARD_TOOL.description).toContain('Never ask the person to edit a card file.')
  })
})
