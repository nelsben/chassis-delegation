// MOD-270: the brain's model and effort choice, each with a reason, and the per-(alias, effort) history from the ledger. Pure.
import { test, expect, describe } from './kit.mjs'

const C = () => import('../../hooks/lib/choice.ts')
const CARD = () => import('../../hooks/lib/card.ts')
const ctx = { domains: ['ops'], gateIds: ['test'], names: [], spendByTier: { standard: 5 }, here: false }
const base = { title: 'Do it', why: 'Because.', doneWhen: ['it is done'], redTest: 'none', scope: ['a/**'] }

describe('MOD-270: the card tool writes the choice', () => {
  test('tierReason, effort and effortReason land in the front matter (the red example)', async () => {
    const { cardFromFields } = await CARD()
    const c = cardFromFields({ ...base, tierReason: 'cross-cutting change', effort: 'high', effortReason: 'ambiguous scope' }, ctx)
    expect('error' in c).toBe(false)
    expect(c.text).toContain('\ntier_reason: cross-cutting change\n')
    expect(c.text).toContain('\neffort: high\n')
    expect(c.text).toContain('\neffort_reason: ambiguous scope\n')
    expect(c.effort).toBe('high')
  })
  test('an effort outside low, medium, high is refused naming the allowed ones', async () => {
    const { cardFromFields } = await CARD()
    for (const bad of ['xhigh', 'max', 'extreme', '']) {
      const c = cardFromFields({ ...base, effort: bad }, ctx)
      expect(c.error).toContain('low, medium, high')
    }
    for (const ok of ['low', 'medium', 'high', ' High ']) expect('error' in cardFromFields({ ...base, effort: ok }, ctx)).toBe(false)
  })
  test('no choice fields: no choice lines in the front matter', async () => {
    const { cardFromFields } = await CARD()
    const c = cardFromFields(base, ctx)
    expect(c.text).not.toContain('tier_reason')
    expect(c.text).not.toContain('effort')
  })
  test('the front matter reads back through the card parser', async () => {
    const { cardFromFields } = await CARD()
    const { parseCard } = await import('../../hooks/lib/dispatch.ts')
    const c = cardFromFields({ ...base, tierReason: 'a b', effort: 'low', effortReason: 'mechanical rename' }, ctx)
    const back = parseCard(c.text)
    expect(back.fields.tier_reason).toBe('a b')
    expect(back.fields.effort).toBe('low')
    expect(back.fields.effort_reason).toBe('mechanical rename')
  })
})

describe('MOD-270: reason cleaning', () => {
  test('one line, newlines and colons to spaces, cut to 120', async () => {
    const { cleanReason } = await C()
    expect(cleanReason('a\nb: c')).toBe('a b c')
    expect(cleanReason('  x\r\n\ty  ')).toBe('x y')
    expect(cleanReason('z'.repeat(300))).toHaveLength(120)
    expect(cleanReason(undefined)).toBe('')
    expect(cleanReason(5)).toBe('')
  })
})

describe('MOD-270: the choice line', () => {
  test('with and without reasons, and for a fable rewrite', async () => {
    const { choiceLine } = await C()
    const { finalAlias } = await import('../../hooks/lib/tier.ts')
    expect(choiceLine({ tier: 'standard', alias: 'sonnet', effort: 'high', effortSource: 'card', effortReason: 'ambiguous scope', tierReason: 'two modules' })).toBe('tier standard → sonnet (two modules) · effort high (ambiguous scope)')
    expect(choiceLine({ tier: 'standard', alias: 'sonnet', effort: 'medium', effortSource: 'tier' })).toBe('tier standard → sonnet (default) · effort medium (tier default)')
    // a card effort with no reason says it is the card's
    expect(choiceLine({ tier: 'economy', alias: 'haiku', effort: 'medium', effortSource: 'card' })).toBe('tier economy → haiku (default) · effort medium (card)')
    // the model shown is the final alias: premium maps to fable, which is opus unless allowed
    const fable = finalAlias({ tier: 'premium', source: 'brief' }, 'fable', {})
    expect(choiceLine({ tier: 'premium', alias: fable.alias, effort: 'high', effortSource: 'tier' })).toBe('tier premium → opus (default) · effort high (tier default)')
  })
  test('effortChoice says which decided', async () => {
    const { effortChoice, effortFor, DEFAULT_EFFORT_BY_TIER } = await import('../../hooks/lib/tier.ts')
    expect(effortChoice('standard', 'high', DEFAULT_EFFORT_BY_TIER)).toEqual({ effort: 'high', source: 'card' })
    expect(effortChoice('standard', undefined, DEFAULT_EFFORT_BY_TIER)).toEqual({ effort: 'medium', source: 'tier' })
    expect(effortChoice('standard', '0', DEFAULT_EFFORT_BY_TIER)).toEqual({ effort: undefined, source: 'tier' })
    expect(effortFor('frontier', '', DEFAULT_EFFORT_BY_TIER)).toBe('high')
  })
  test('the started row shows the reasons after the effort, cut to 60', async () => {
    const { reasonsCut } = await C()
    const { startedRow } = await import('../../hooks/lib/rows.ts')
    const why = reasonsCut('t'.repeat(40), 'e'.repeat(40))
    expect(why).toHaveLength(60)
    const row = startedRow({ label: 'T-1', alias: 'sonnet', tier: 'standard', attempt: 1, budget: 2, kind: 'started', effort: 'high', why: 'cross-cutting' })
    expect(row).toBe('chassis-delegation: T-1 started · sonnet (standard) · attempt 1/2 · effort high · cross-cutting')
    expect(startedRow({ label: 'T-1', alias: 'sonnet', tier: 'standard', attempt: 1, budget: 2, kind: 'started', effort: 'high' })).not.toContain('cross')
  })
})

describe('MOD-270: pairHistory', () => {
  const spawn = (task, over = {}) => ({ kind: 'spawn', task, attempt: 1, alias: 'sonnet', effort: 'medium', verdict: 'consistent', usd: 1, ...over })
  const cards = (n, over = {}) => Array.from({ length: n }, (_, i) => spawn(`C-${over.alias ?? 's'}${over.effort ?? 'm'}-${i}`, over))

  test('no rows, no pair', async () => {
    const { pairHistory, historyLine } = await C()
    expect(pairHistory([])).toEqual([])
    expect(historyLine([])).toBe('history: none')
  })
  test('rows without an effort, a kind or a verdict leave the card out; accept and merged rows are skipped', async () => {
    const { pairHistory } = await C()
    const rows = [
      spawn('A-1', { effort: undefined }),
      { task: 'A-2', attempt: 1, alias: 'sonnet', effort: 'medium', verdict: 'consistent' }, // no kind
      spawn('A-3', { verdict: undefined }),
      spawn('A-4'),
      { kind: 'accept', task: 'A-4', verdict: 'consistent', usd: 50 },
      { kind: 'merged', task: 'A-4', usd: 50 },
    ]
    const p = pairHistory(rows)
    expect(p).toHaveLength(1)
    expect(p[0]).toMatchObject({ alias: 'sonnet', effort: 'medium', n: 1, confirmed: 1, usdPerConfirmed: 1 })
  })
  test('a card with several verdict rows on attempt 1 is one card, credited to its earliest effort row; the old verdict word counts as confirmed', async () => {
    const { pairHistory } = await C()
    const rows = [spawn('B-1', { verdict: 'refuted', firstFailed: 'sha', usd: 1 }), spawn('B-1', { effort: 'high', verdict: 'consistent', usd: 2 }), { kind: 'spawn', task: 'B-2', attempt: 1, alias: 'opus', effort: 'high', verdict: 'verified' }]
    const p = pairHistory(rows)
    expect(p.find(x => x.alias === 'sonnet')).toMatchObject({ effort: 'medium', n: 1, confirmed: 1, usdPerConfirmed: 3 })
    expect(p.find(x => x.alias === 'opus')).toMatchObject({ n: 1, confirmed: 1 })
  })
  test('retries and review usd are counted; an escalated card stays with its attempt-1 pair', async () => {
    const { pairHistory } = await C()
    const rows = [
      spawn('R-1', { verdict: 'refuted', firstFailed: 'gate', usd: 1 }),
      { kind: 'spawn', task: 'R-1', attempt: 2, alias: 'opus', effort: 'high', verdict: 'consistent', usd: 4 },
      { kind: 'resume', task: 'R-1', attempt: 3, verdict: 'consistent', usd: 0.5 },
      { kind: 'review', task: 'R-1', attempt: 2, verdict: 'reviewed', usd: 0.25 },
    ]
    const p = pairHistory(rows)
    expect(p).toHaveLength(1)
    expect(p[0]).toMatchObject({ alias: 'sonnet', effort: 'medium', n: 1, confirmed: 1, usdPerConfirmed: 5.75 })
  })
  test('thin under 5 cards, low confidence under 20, none from 20', async () => {
    const { pairHistory } = await C()
    expect(pairHistory(cards(4))[0].mark).toBe('thin')
    expect(pairHistory(cards(5))[0].mark).toBe('low confidence')
    expect(pairHistory(cards(19))[0].mark).toBe('low confidence')
    expect(pairHistory(cards(20))[0].mark).toBeUndefined()
  })
  test('most used first, at most 6 pairs', async () => {
    const { pairHistory } = await C()
    const aliases = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7']
    const rows = aliases.flatMap((a, i) => cards(i + 1, { alias: a }))
    const p = pairHistory(rows)
    expect(p).toHaveLength(6)
    expect(p.map(x => x.alias)).toEqual(['a7', 'a6', 'a5', 'a4', 'a3', 'a2'])
  })
  test('a card refuted only on a brief defect is left out of the rate; a scope refute with a later success counts as confirmed', async () => {
    const { pairHistory } = await C()
    const rows = [spawn('H-1'), spawn('H-2', { verdict: 'refuted', firstFailed: 'scope', usd: 1 }), spawn('H-3', { verdict: 'refuted', firstFailed: 'gate', usd: 1 })]
    const p = pairHistory(rows)[0]
    expect(p).toMatchObject({ n: 3, confirmed: 1 })
    expect(p.rate).toBe(0.5) // H-1 of H-1 and H-3; H-2 is a brief defect
  })
  test('approximate usd counts in n and the rate, not in usd, and marks the pair; the line reads as the card says', async () => {
    const { pairHistory, historyLine } = await C()
    const rows = [spawn('U-1', { usd: 2 }), spawn('U-2', { usd: 9, usdApprox: true })]
    const p = pairHistory(rows)[0]
    expect(p).toMatchObject({ n: 2, confirmed: 2, approx: true, usdPerConfirmed: 1 })
    expect(historyLine([p])).toBe('history: sonnet/medium 2 thin · 100% · ~$1.00/card')
    const big = pairHistory([...cards(120), ...cards(40, { alias: 'haiku', effort: 'low', usd: 0.02 })])
    expect(historyLine(big)).toBe('history: sonnet/medium 120 · 100% · $1.00/card; haiku/low 40 · 100% · $0.02/card')
  })
})
