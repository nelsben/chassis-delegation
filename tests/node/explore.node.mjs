// MOD-274: cards get a class, and a small, recorded share of first attempts runs one step off the default. Pure.
import { test, expect, describe } from './kit.mjs'

const X = () => import('../../hooks/lib/explore.ts')
const A = () => import('../../hooks/lib/attempts.ts')
const C = () => import('../../hooks/lib/choice.ts')
const T = () => import('../../hooks/lib/tier.ts')

const TIER_MAP = { economy: 'haiku', standard: 'sonnet', frontier: 'opus', premium: 'fable' }
const aliasOfTier = t => TIER_MAP[t]

/** An id whose draw is below `below` (or at/above `atLeast`). */
async function idWhere(pred) {
  const { exploreDraw } = await X()
  for (let i = 1; i < 5000; i++) if (pred(exploreDraw(`T-${i}`))) return `T-${i}`
  throw new Error('no id found')
}

const base = async (over = {}) => ({
  task: await idWhere(d => d < 0.1),
  attempt: 1,
  hasEffort: false,
  hasReason: false,
  tier: 'standard',
  kind: 'feature',
  className: 'feature/large',
  explore: 0.2,
  baseEffort: 'medium',
  maxEffort: 'high',
  aliasOfTier,
  rows: [],
  ...over,
})

describe('MOD-274: the card class', () => {
  test('kind: an explicit kind: wins, else inferred from the scope and the title', async () => {
    const { cardKind } = await X()
    expect(cardKind({ kind: 'bug', title: 'Add a thing', scope: ['hooks/**'] })).toBe('bug')
    expect(cardKind({ kind: 'Docs', title: 'x', scope: ['hooks/**'] })).toBe('docs')
    expect(cardKind({ kind: 'nonsense', title: 'Add a thing', scope: ['hooks/**'] })).toBe('feature')
    expect(cardKind({ title: 'Release 0.9.41', scope: ['CHANGELOG.md', '.claude-plugin/plugin.json', 'hooks/lib/version.ts'] })).toBe('release')
    expect(cardKind({ title: 'Cut v1.2.3', scope: ['CHANGELOG.md'] })).toBe('release')
    expect(cardKind({ title: 'Explain the options', scope: ['docs/**', 'CHANGELOG.md'] })).toBe('docs')
    expect(cardKind({ title: 'Bug: the band flickers', scope: ['hooks/**'] })).toBe('bug')
    expect(cardKind({ title: 'Fix the ledger', scope: ['hooks/**', 'tests/**'] })).toBe('bug')
    expect(cardKind({ title: 'More coverage for rows', scope: ['tests/**'] })).toBe('test')
    expect(cardKind({ title: 'Add explore', scope: ['hooks/**', 'tests/**', 'docs/**'] })).toBe('feature')
    expect(cardKind({ title: 'Add explore', scope: [] })).toBe('feature')
    // docs scope with a Fix title is docs-only scope first: a title starting Fix on a docs-only card is still docs
    expect(cardKind({ title: 'Fix the guide', scope: ['docs/**'] })).toBe('docs')
  })
  test('size: small when the economy hint would fire, else large; the class reads kind/size', async () => {
    const { cardSize, cardClassName } = await X()
    expect(cardSize(true)).toBe('small')
    expect(cardSize(false)).toBe('large')
    expect(cardClassName('feature', 'large')).toBe('feature/large')
    expect(cardClassName('bug', 'small')).toBe('bug/small')
  })
})

describe('MOD-274: the draw', () => {
  test('fnv1a32 is the standard hash, and the draw is stable per task id', async () => {
    const { fnv1a32, exploreDraw } = await X()
    expect(fnv1a32('')).toBe(0x811c9dc5)
    expect(fnv1a32('a')).toBe(0xe40c292c)
    expect(fnv1a32('foobar')).toBe(0xbf9cf968)
    expect(exploreDraw('MOD-274')).toBe((fnv1a32('MOD-274') % 1000) / 1000)
    expect(exploreDraw('MOD-274')).toBe(exploreDraw('MOD-274'))
    const d = exploreDraw('MOD-1')
    expect(d >= 0 && d < 1).toBe(true)
  })
  test('the explore option is held to 0 .. 0.5', async () => {
    const { clampExplore, DEFAULT_EXPLORE } = await X()
    expect(DEFAULT_EXPLORE).toBe(0.2)
    expect(clampExplore(0.3)).toBe(0.3)
    expect(clampExplore(0.9)).toBe(0.5)
    expect(clampExplore(-1)).toBe(0)
    expect(clampExplore('x')).toBe(0.2)
    expect(clampExplore(undefined)).toBe(0.2)
  })
})

describe('MOD-274: who explores', () => {
  test('the red case: attempt 1, no effort:, no reasons, standard, feature, draw below explore: MOD-277, the tier one down at the same effort first', async () => {
    const { explorePlan } = await X()
    const plan = explorePlan(await base())
    expect(plan).toMatchObject({ tier: 'economy', alias: 'haiku', effort: 'medium', axis: 'tier', from: 'sonnet/medium' })
  })
  test('a draw at or above explore never explores', async () => {
    const { explorePlan } = await X()
    expect(explorePlan(await base({ task: await idWhere(d => d >= 0.5) }))).toBeUndefined()
  })
  test('explore 0 never explores', async () => {
    const { explorePlan } = await X()
    for (let i = 1; i < 300; i++) expect(explorePlan(await base({ task: `T-${i}`, explore: 0 }))).toBeUndefined()
  })
  test('each excluded case never explores: attempt 2, effort:, a reason, economy, premium, release, docs', async () => {
    const { explorePlan } = await X()
    for (let i = 1; i < 200; i++) {
      const task = `T-${i}`
      const over = { task, explore: 0.5 }
      expect(explorePlan(await base({ ...over, attempt: 2 }))).toBeUndefined()
      expect(explorePlan(await base({ ...over, hasEffort: true }))).toBeUndefined()
      expect(explorePlan(await base({ ...over, hasReason: true }))).toBeUndefined()
      expect(explorePlan(await base({ ...over, tier: 'economy', baseEffort: 'low' }))).toBeUndefined()
      expect(explorePlan(await base({ ...over, tier: 'premium' }))).toBeUndefined()
      expect(explorePlan(await base({ ...over, kind: 'release' }))).toBeUndefined()
      expect(explorePlan(await base({ ...over, kind: 'docs' }))).toBeUndefined()
    }
    // and the same ids do explore when nothing excludes them
    let n = 0
    for (let i = 1; i < 200; i++) if (explorePlan(await base({ task: `T-${i}`, explore: 0.5 }))) n++
    expect(n > 40 && n < 160).toBe(true)
  })
  test('bug and test kinds are eligible', async () => {
    const { explorePlan } = await X()
    expect(explorePlan(await base({ kind: 'bug' }))).toBeDefined()
    expect(explorePlan(await base({ kind: 'test' }))).toBeDefined()
  })
})

describe('MOD-274: the step is one axis, downward only', () => {
  const row = (task, alias, effort, extra = {}) => ({ kind: 'spawn', task, attempt: 1, alias, effort, verdict: 'consistent', class: 'feature/large', ...extra })
  const many = (n, alias, effort) => Array.from({ length: n }, (_, i) => row(`R-${alias}${effort}-${i}`, alias, effort))

  test('MOD-277 standard medium: the tier-down pair is the one target until it has 30 counted explored cards in the class, then the effort-down pair', async () => {
    const { explorePlan, TIER_TARGET_CARDS } = await X()
    expect(TIER_TARGET_CARDS).toBe(30)
    expect(explorePlan(await base({ rows: [] }))).toMatchObject({ axis: 'tier', alias: 'haiku', effort: 'medium' })
    // sonnet/low tried a lot does not move the target: only the tier pair's own explored cards do
    expect(explorePlan(await base({ rows: many(9, 'sonnet', 'low') }))).toMatchObject({ axis: 'tier', alias: 'haiku' })
    const ex = n => many(n, 'haiku', 'medium').map(r => ({ ...r, explore: true, exploreFrom: 'sonnet/medium' }))
    expect(explorePlan(await base({ rows: ex(29) }))).toMatchObject({ axis: 'tier', alias: 'haiku' })
    expect(explorePlan(await base({ rows: ex(30) }))).toMatchObject({ axis: 'effort', alias: 'sonnet', effort: 'low', from: 'sonnet/medium' })
  })
  test('MOD-277 only counted explored cards of the class and the pair move the target', async () => {
    const { explorePlan } = await X()
    const ex = (n, over = {}) => many(n, 'haiku', 'medium').map(r => ({ ...r, explore: true, exploreFrom: 'sonnet/medium', ...over }))
    // not explored (default cards that happened to run haiku), another class, and uncounted (a scope refute) cards do not count
    expect(explorePlan(await base({ rows: many(40, 'haiku', 'medium') }))).toMatchObject({ axis: 'tier' })
    expect(explorePlan(await base({ rows: ex(40, { class: 'bug/small' }) }))).toMatchObject({ axis: 'tier' })
    expect(explorePlan(await base({ rows: ex(40, { verdict: 'refuted', firstFailed: 'scope' }) }))).toMatchObject({ axis: 'tier' })
    // a classless row takes classOf
    expect(explorePlan(await base({ rows: ex(30, { class: undefined }), classOf: () => 'feature/large' }))).toMatchObject({ axis: 'effort' })
    expect(explorePlan(await base({ rows: ex(30, { class: undefined }) }))).toMatchObject({ axis: 'tier' })
  })
  test('a standard card at low effort can only step the tier; at the engine default (no effort) too', async () => {
    const { explorePlan } = await X()
    expect(explorePlan(await base({ baseEffort: 'low' }))).toMatchObject({ axis: 'tier', alias: 'haiku', effort: 'low' })
    expect(explorePlan(await base({ baseEffort: undefined }))).toMatchObject({ axis: 'tier', alias: 'haiku', effort: undefined })
  })
  test('frontier never changes tier: high steps to medium on opus', async () => {
    const { explorePlan } = await X()
    expect(explorePlan(await base({ tier: 'frontier', baseEffort: 'high', rows: many(9, 'opus', 'medium') }))).toMatchObject({ tier: 'frontier', alias: 'opus', effort: 'medium', axis: 'effort', from: 'opus/high' })
    // frontier at low effort has nowhere down to go
    expect(explorePlan(await base({ tier: 'frontier', baseEffort: 'low' }))).toBeUndefined()
  })
  test('never upward: no plan ever has an effort above the default or a tier above the card\'s', async () => {
    const { explorePlan } = await X()
    const { EFFORTS } = await T()
    const rank = { economy: 0, standard: 1, frontier: 2, premium: 3 }
    for (const tier of ['standard', 'frontier'])
      for (const baseEffort of [undefined, ...EFFORTS])
        for (let i = 1; i < 60; i++) {
          const plan = explorePlan(await base({ task: `T-${i}`, explore: 0.5, tier, baseEffort, maxEffort: 'max' }))
          if (!plan) continue
          expect(rank[plan.tier] <= rank[tier]).toBe(true)
          if (plan.effort && baseEffort) expect(EFFORTS.indexOf(plan.effort) <= EFFORTS.indexOf(baseEffort)).toBe(true)
          expect(plan.axis === 'tier' ? plan.tier !== tier : plan.tier === tier).toBe(true)
        }
  })
  test('skip, not clamp: a step maxEffort would change is not taken', async () => {
    const { explorePlan } = await X()
    // default max, cap high: effort down is xhigh, which the cap would lower; the tier step keeps max, which the cap would lower too
    expect(explorePlan(await base({ baseEffort: 'max', maxEffort: 'high' }))).toBeUndefined()
    // default xhigh, cap high: the card already runs at high, so effort down is no step at all, and the tier step (xhigh) would be clamped
    expect(explorePlan(await base({ baseEffort: 'xhigh', maxEffort: 'high' }))).toBeUndefined()
    // default high, cap medium: the tier step keeps high, which the cap would lower; effort down (medium) is what the card already runs at
    expect(explorePlan(await base({ baseEffort: 'high', maxEffort: 'medium' }))).toBeUndefined()
    // default high, cap high: a standard card aims at the tier pair first; a frontier card has only the effort step
    expect(explorePlan(await base({ baseEffort: 'high', maxEffort: 'high' }))).toMatchObject({ axis: 'tier', effort: 'high' })
    expect(explorePlan(await base({ baseEffort: 'high', maxEffort: 'high', tier: 'frontier' }))).toMatchObject({ axis: 'effort', effort: 'medium' })
    // cap not reached: both steps stand, the tier step first (MOD-277)
    expect(explorePlan(await base({ baseEffort: 'xhigh', maxEffort: 'max' }))).toMatchObject({ axis: 'tier', effort: 'xhigh' })
    expect(explorePlan(await base({ baseEffort: 'xhigh', maxEffort: 'max', tier: 'frontier' }))).toMatchObject({ axis: 'effort', effort: 'high' })
  })
})

describe('MOD-274: the label', () => {
  test('an effort step names the effort it moved from, a tier step the model', async () => {
    const { exploreLabel } = await X()
    expect(exploreLabel('sonnet/medium', 'sonnet', 'low')).toBe('explore from medium')
    expect(exploreLabel('sonnet/medium', 'haiku', 'medium')).toBe('explore from sonnet')
    const { startedRow } = await import('../../hooks/lib/rows.ts')
    expect(startedRow({ label: 'T-1', alias: 'sonnet', tier: 'standard', attempt: 1, budget: 2, kind: 'started', effort: 'low', explore: 'explore from medium' })).toBe(
      'chassis-delegation: T-1 started · sonnet (standard) · attempt 1/2 · effort low · explore from medium',
    )
    const { verdictLine } = await import('../../hooks/lib/verify.ts')
    expect(verdictLine({ verdict: 'consistent', task: 'T-1', attempt: 1, budget: 2, next: 'accept', explore: 'explore from medium' })).toContain(' · explore from medium')
  })
})

describe('MOD-274: a refuted exploratory attempt', () => {
  const rec = (over = {}) => ({ task: 'T-1', subtask: 'main', attempt: 1, kind: 'spawn', lineage: 1, tier: 'standard', alias: 'sonnet', verdict: 'refuted', firstFailed: 'gate', effort: 'low', effortSource: 'explore', explore: true, exploreFrom: 'sonnet/medium', at: 1, ...over })

  test('does not set the escalation source, does not hold, and is not counted against budget; it still numbers the ladder', async () => {
    const { escalationSource, holdSource, budgetCount, nextAttempt, attemptsFor } = await A()
    const { pickTier } = await T()
    const records = [rec()]
    expect(escalationSource(records, 'main')).toBeUndefined()
    expect(holdSource(records, 'main')).toBeUndefined()
    expect(budgetCount(records, 'main')).toBe(0)
    expect(attemptsFor(records, 'main')).toHaveLength(1)
    expect(nextAttempt(records, 'main')).toBe(2)
    // attempt 2 of a 2-attempts card: the card's own tier (standard), 2 attempts still available
    const pick = pickTier({ hadHeader: true, headerTier: 'standard', escalateFrom: escalationSource(records, 'main'), holdAt: holdSource(records, 'main') })
    expect(pick).toEqual({ tier: 'standard', source: 'brief' })
    expect(budgetCount(records, 'main') < 2).toBe(true)
    // the tier's default effort for attempt 2 (the card has no effort:)
    const { effortChoice, DEFAULT_EFFORT_BY_TIER } = await T()
    expect(effortChoice(pick.tier, undefined, DEFAULT_EFFORT_BY_TIER)).toEqual({ effort: 'medium', source: 'tier' })
  })
  test('a no-report exploratory attempt is the same', async () => {
    const { escalationSource, holdSource, budgetCount } = await A()
    const records = [rec({ verdict: 'no-report', firstFailed: undefined })]
    expect(escalationSource(records, 'main')).toBeUndefined()
    expect(holdSource(records, 'main')).toBeUndefined()
    expect(budgetCount(records, 'main')).toBe(0)
  })
  test('a confirmed or pending exploratory attempt counts; a refuted ordinary attempt still counts and escalates', async () => {
    const { escalationSource, budgetCount } = await A()
    expect(budgetCount([rec({ verdict: 'consistent' })], 'main')).toBe(1)
    expect(budgetCount([rec({ verdict: 'pending' })], 'main')).toBe(1)
    const plain = rec({ explore: undefined, exploreFrom: undefined, effortSource: 'tier' })
    expect(budgetCount([plain], 'main')).toBe(1)
    expect(escalationSource([plain], 'main')).toBe('standard')
  })
  test('the attempt after the exploratory one counts alone', async () => {
    const { budgetCount } = await A()
    const second = rec({ attempt: 2, lineage: 2, explore: undefined, exploreFrom: undefined, effortSource: 'tier', effort: 'medium', verdict: 'pending' })
    expect(budgetCount([rec(), second], 'main')).toBe(1)
  })
})

describe('MOD-274: pairHistory by class', () => {
  const row = (task, cls, over = {}) => ({ kind: 'spawn', task, attempt: 1, alias: 'sonnet', effort: 'medium', verdict: 'consistent', usd: 1, class: cls, ...over })

  test('an optional class narrows the cards; no class is every card', async () => {
    const { pairHistory } = await C()
    const rows = [row('A-1', 'feature/large'), row('A-2', 'feature/large'), row('A-3', 'bug/small')]
    expect(pairHistory(rows)[0].n).toBe(3)
    expect(pairHistory(rows, 'feature/large')[0].n).toBe(2)
    expect(pairHistory(rows, 'bug/small')[0].n).toBe(1)
    expect(pairHistory(rows, 'test/large')).toEqual([])
  })
  test('the history line names the class first, and falls back to all classes', async () => {
    const { historyLine, pairHistory } = await C()
    const rows = [row('A-1', 'feature/large')]
    expect(historyLine(pairHistory(rows, 'feature/large'), 'feature/large')).toMatch(/^history feature\/large: sonnet\/medium 1 thin/)
    expect(historyLine(pairHistory(rows), 'bug/small', true)).toMatch(/^history all classes \(none for bug\/small\): sonnet\/medium 1 thin/)
    expect(historyLine([], 'bug/small', true)).toBe('history: none')
    expect(historyLine(pairHistory(rows))).toMatch(/^history: sonnet\/medium 1 thin/)
  })
  test('MOD-277: an exploratory card counts for the pair it ran, confirmed when any attempt was, with every attempt\'s usd', async () => {
    const { pairHistory } = await C()
    const rows = [
      // explored sonnet/low, refuted on a gate; attempt 2 (sonnet/medium) confirmed and cost more: the card is confirmed, the rescue cost is the explored pair's
      row('E-1', 'feature/large', { effort: 'low', explore: true, exploreFrom: 'sonnet/medium', verdict: 'refuted', firstFailed: 'gate', usd: 0.4 }),
      { kind: 'spawn', task: 'E-1', attempt: 2, alias: 'sonnet', effort: 'medium', verdict: 'consistent', usd: 0.9 },
      row('E-2', 'feature/large', { effort: 'low', explore: true, exploreFrom: 'sonnet/medium', verdict: 'consistent', usd: 0.5 }),
    ]
    const low = pairHistory(rows, 'feature/large').find(p => p.effort === 'low')
    expect(low.n).toBe(2)
    expect(low.confirmed).toBe(2)
    expect(low.usdPerConfirmed).toBeCloseTo(0.9, 5) // (0.4 + 0.9 + 0.5) over two confirmed cards
    expect(pairHistory(rows, 'feature/large').find(p => p.effort === 'medium')).toBeUndefined()
    expect(low.approx).toBe(false)
  })
})
