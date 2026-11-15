// MOD-374: a build card's `spike:` names the spike it was planned from; the spawn row carries it. Pure: no engine.
import { test, expect, describe } from './kit.mjs'

const ctx = (over = {}) => ({
  domains: ['ops'],
  gateIds: ['test'],
  names: [],
  spendByTier: { economy: 2, standard: 6, frontier: 15 },
  ...over,
})
const input = (over = {}) => ({
  title: 'Export the report',
  why: 'The report cannot be exported yet.',
  doneWhen: ['export() returns the report'],
  scope: ['/repo/src/export/a.ts'],
  redTest: 'none',
  ...over,
})
const lines = text => text.split('\n')
const base = { task: 'T-4', subtask: 'main', attempt: 1, lineage: 1, budget: 3, tier: 'standard', alias: 'sonnet', purpose: 'build', at: 1 }

describe('MOD-374: spikeLinkOf', () => {
  test('an id, trimmed; anything else is undefined', async () => {
    const { spikeLinkOf } = await import('../../hooks/lib/card.ts')
    expect(spikeLinkOf('MOD-372')).toBe('MOD-372')
    expect(spikeLinkOf('  MOD-372  ')).toBe('MOD-372')
    expect(spikeLinkOf('mod-372')).toBeUndefined()
    expect(spikeLinkOf(372)).toBeUndefined()
    expect(spikeLinkOf(['MOD-372'])).toBeUndefined()
    expect(spikeLinkOf('')).toBeUndefined()
    expect(spikeLinkOf(undefined)).toBeUndefined()
  })
})

describe('MOD-374: the spawn row', () => {
  test('carries spike when set, and not otherwise', async () => {
    const { spawnRow } = await import('../../hooks/lib/storeloss.ts')
    expect(spawnRow({ ...base, spike: 'MOD-372' }).spike).toBe('MOD-372')
    expect('spike' in spawnRow({ ...base })).toBe(false)
  })
})

describe('MOD-374: the card tool takes spike', () => {
  test('the line is written right after fixes', async () => {
    const { cardsFromFields } = await import('../../hooks/lib/card.ts')
    const r = cardsFromFields(input({ spike: ' MOD-372 ', fixes: ['MOD-12'] }), ctx())
    const l = lines(r[0].text)
    const i = l.indexOf('fixes: [MOD-12]')
    expect(i).toBeGreaterThan(-1)
    expect(l[i + 1]).toBe('spike: MOD-372')
  })
  test('without fixes the line still appears; without spike no line', async () => {
    const { cardsFromFields } = await import('../../hooks/lib/card.ts')
    expect(lines(cardsFromFields(input({ spike: 'MOD-372' }), ctx())[0].text)).toContain('spike: MOD-372')
    expect(cardsFromFields(input(), ctx())[0].text).not.toContain('spike:')
  })
  test('a bad value is the error', async () => {
    const { cardsFromFields } = await import('../../hooks/lib/card.ts')
    for (const bad of ['nope', 'mod-1', 12, ['MOD-1'], '']) {
      expect(cardsFromFields(input({ spike: bad }), ctx())).toEqual({ error: 'spike must be one task id, e.g. MOD-372' })
    }
  })
  test('CARD_TOOL declares spike', async () => {
    const { CARD_TOOL } = await import('../../hooks/lib/card.ts')
    expect(JSON.stringify(CARD_TOOL)).toContain('"spike"')
  })
})
