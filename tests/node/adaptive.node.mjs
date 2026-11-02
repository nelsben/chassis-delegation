// MOD-275: the mod suggests the cheapest (model, effort) pair that passes for a card class: a Wilson lower bound on the pass rate
// and a cost-gap test, over the attempt-1 cards MOD-274 let explore. Pure. The suggestion is proven by a simulation built to fail.
import { test, expect, describe } from './kit.mjs'

const A = () => import('../../hooks/lib/adaptive.ts')
import { rng, simulate, classOf, MEAN_USD, SEEDS, MANY_SEEDS, DOMINANT, CLASSES, RATE, DEFAULT, CHEAP } from './adaptivesim.mjs'

const equal = () => RATE
/** The dominant class's suggestion over the first `n` cards' rows. */
const suggestAt = async (sim, n, cls = DOMINANT) => (await A()).suggest(sim.rows.slice(0, sim.ends[n - 1]), cls)

describe('MOD-275: the suggestion is proven by a simulation built to be able to fail', () => {
  test('(i) a cheaper pair with an equal true rate: the dominant class suggests the true cheapest pair, the four minor classes none', async () => {
    const { suggest } = await A()
    for (const seed of SEEDS) {
      const sim = await simulate(seed, equal)
      const s = suggest(sim.rows, DOMINANT)
      expect(s === undefined ? 'none' : `${s.alias}/${s.effort}`).toBe(CHEAP)
      for (const cls of CLASSES.slice(1)) expect(suggest(sim.rows, cls)).toBeUndefined()
    }
  })

  test('(ii) the cheaper pair 15 points lower: none', async () => {
    const { suggest } = await A()
    for (const seed of SEEDS) {
      const sim = await simulate(seed, pair => (pair === DEFAULT ? RATE : RATE - 0.15))
      expect(suggest(sim.rows, DOMINANT)).toBeUndefined()
    }
  })

  test('(iii) the cheaper pair 7 points lower: none, or the overall pass rate had it been applied stays within 3 points of always-default', async () => {
    const { suggest } = await A()
    const rates = pair => (pair === DEFAULT ? RATE : RATE - 0.07)
    for (const seed of SEEDS) {
      const sim = await simulate(seed, rates)
      const s = suggest(sim.rows, DOMINANT)
      if (s === undefined) continue
      // a fresh stream, run on the default for every class (always-default) and on the suggested pair for the dominant class (applied)
      const rand = rng(seed + 9000)
      const N = 20000
      let base = 0
      let applied = 0
      for (let i = 0; i < N; i++) {
        const cls = classOf(rand)
        const u = rand()
        base += u < rates(DEFAULT) ? 1 : 0
        applied += u < rates(cls === DOMINANT ? `${s.alias}/${s.effort}` : DEFAULT) ? 1 : 0
      }
      expect((base - applied) / N).toBeLessThanOrEqual(0.03)
    }
  })

  test('(iv) the cheaper pair drops 20 points after card 150: it is suggested at card 150 and the suggestion is withdrawn within 30 cards', async () => {
    const rates = (pair, i) => (pair === DEFAULT || i < 150 ? RATE : RATE - 0.2)
    for (const seed of SEEDS) {
      const sim = await simulate(seed, rates)
      const before = await suggestAt(sim, 150)
      expect(before === undefined ? 'none' : `${before.alias}/${before.effort}`).toBe(CHEAP)
      expect(await suggestAt(sim, 180)).toBeUndefined()
    }
  })

  test('(v) all pairs equal in rate and cost: none', async () => {
    const { suggest } = await A()
    const was = { ...MEAN_USD }
    try {
      MEAN_USD[CHEAP] = MEAN_USD[DEFAULT]
      for (const seed of SEEDS) {
        const sim = await simulate(seed, equal)
        expect(suggest(sim.rows, DOMINANT)).toBeUndefined()
      }
    } finally {
      Object.assign(MEAN_USD, was)
    }
  })
})

describe('MOD-275: the simulation over many seeds (rates, not a lucky seed)', () => {
  const name = s => (s === undefined ? 'none' : `${s.alias}/${s.effort}`)
  test('an equal rate is suggested on nearly every seed and never as the wrong pair; 15 points lower never; an equal cost rarely', async () => {
    const { suggest } = await A()
    let equalHit = 0
    let lowerHit = 0
    let costHit = 0
    for (const seed of MANY_SEEDS) {
      const a = suggest((await simulate(seed, () => RATE)).rows, DOMINANT)
      if (name(a) === CHEAP) equalHit++
      else expect(name(a)).toBe('none')
      if (suggest((await simulate(seed, pair => (pair === DEFAULT ? RATE : RATE - 0.15))).rows, DOMINANT)) lowerHit++
      const was = MEAN_USD[CHEAP]
      MEAN_USD[CHEAP] = MEAN_USD[DEFAULT]
      try {
        if (suggest((await simulate(seed, () => RATE)).rows, DOMINANT)) costHit++
      } finally {
        MEAN_USD[CHEAP] = was
      }
    }
    expect(equalHit / MANY_SEEDS.length).toBeGreaterThanOrEqual(0.95)
    expect(lowerHit).toBe(0)
    expect(costHit / MANY_SEEDS.length).toBeLessThanOrEqual(0.45)
  })
  test('a 20-point drop after card 150 is withdrawn within 30 cards on nearly every seed', async () => {
    const { suggest } = await A()
    let had = 0
    let gone = 0
    for (const seed of MANY_SEEDS) {
      const sim = await simulate(seed, (pair, i) => (pair === DEFAULT || i < 150 ? RATE : RATE - 0.2))
      if (!suggest(sim.rows.slice(0, sim.ends[149]), DOMINANT)) continue
      had++
      if (!suggest(sim.rows.slice(0, sim.ends[179]), DOMINANT)) gone++
    }
    expect(had / MANY_SEEDS.length).toBeGreaterThanOrEqual(0.95)
    expect(gone / had).toBeGreaterThanOrEqual(0.9)
  })
})

describe('MOD-275: the suggestion function, on hand-built ledgers', () => {
  const row = (task, alias, effort, pass, usd, over = {}) => ({
    kind: 'spawn', task, attempt: 1, tier: 'standard', alias, effort, class: 'feature/large', effortSource: 'tier',
    verdict: pass ? 'consistent' : 'refuted', ...(pass ? {} : { firstFailed: 'gate' }), usd, ...over,
  })
  const explored = (task, alias, effort, pass, usd) => row(task, alias, effort, pass, usd, { effortSource: 'explore', explore: true, exploreFrom: 'sonnet/medium' })
  /** `n` default cards at $0.89, `n` explored cards on sonnet/low at $0.50, all passing. */
  const ledger = (n, m = n) => [
    ...Array.from({ length: n }, (_, i) => row(`D-${i}`, 'sonnet', 'medium', true, 0.89 + (i % 2 ? 0.1 : -0.1))),
    ...Array.from({ length: m }, (_, i) => explored(`E-${i}`, 'sonnet', 'low', true, 0.5 + (i % 2 ? 0.05 : -0.05))),
  ]

  test('the red case: an equal rate returns the cheaper pair with the numbers it used; none exists yet', async () => {
    const { suggest } = await A()
    const s = suggest(ledger(60, 60), 'feature/large')
    expect(s).toMatchObject({ class: 'feature/large', alias: 'sonnet', effort: 'low', n: 60, defaultAlias: 'sonnet', defaultEffort: 'medium', defaultRate: 1 })
    expect(s.lowerBound > 0.9 && s.lowerBound < 1).toBe(true)
    expect(s.usdPerConfirmed).toBeCloseTo(0.5, 1)
    expect(s.defaultUsdPerConfirmed).toBeCloseTo(0.89, 1)
  })
  test('n under 20 returns none, and 20 is enough when the bound holds', async () => {
    const { suggest } = await A()
    expect(suggest(ledger(60, 19), 'feature/large')).toBeUndefined()
    expect(suggest(ledger(60, 200), 'feature/large')).toBeDefined()
    expect(suggest(ledger(19, 60), 'feature/large')).toBeUndefined()
  })
  test('the default pair is never suggested; another class and no class give none', async () => {
    const { suggest } = await A()
    const s = suggest(ledger(60, 60), 'feature/large')
    expect(`${s.alias}/${s.effort}`).not.toBe('sonnet/medium')
    expect(suggest(ledger(60, 60), 'bug/small')).toBeUndefined()
    expect(suggest([], 'feature/large')).toBeUndefined()
  })
  test('hand-set cards (effort: or a reason) and cards on another tier are not in the population', async () => {
    const { suggest } = await A()
    const hand = ledger(60, 60).map(r => (r.explore ? r : { ...r, effortSource: 'card' }))
    expect(suggest(hand, 'feature/large')).toBeUndefined()
    const reasoned = ledger(60, 60).map(r => (r.explore ? r : { ...r, tierReason: 'hard' }))
    expect(suggest(reasoned, 'feature/large')).toBeUndefined()
    const economy = ledger(60, 60).map(r => ({ ...r, tier: 'economy' }))
    expect(suggest(economy, 'feature/large')).toBeUndefined()
  })
  test('the cost gap must exceed one standard error of the candidate\'s own mean', async () => {
    const { suggest } = await A()
    // same mean, wide spread: no gap
    const noisy = ledger(60, 60).map(r => (r.explore ? { ...r, usd: Number(r.task.slice(2)) % 2 ? 0.05 : 1.7 } : r))
    expect(suggest(noisy, 'feature/large')).toBeUndefined()
    // dearer than the default: none
    expect(suggest(ledger(60, 60).map(r => (r.explore ? { ...r, usd: 1.5 } : r)), 'feature/large')).toBeUndefined()
  })
  test('the cheapest of the qualifying pairs is returned', async () => {
    const { suggest } = await A()
    const more = Array.from({ length: 60 }, (_, i) => explored(`H-${i}`, 'haiku', 'medium', true, 0.2 + (i % 2 ? 0.02 : -0.02)))
    expect(suggest([...ledger(60, 60), ...more], 'feature/large')).toMatchObject({ alias: 'haiku', effort: 'medium' })
  })
  test('a pair whose lower bound is more than 5 points under the default\'s rate is not suggested', async () => {
    const { suggest } = await A()
    const worse = ledger(60, 60).map((r, i) => (r.explore && i % 10 === 0 ? { ...r, verdict: 'refuted', firstFailed: 'gate' } : r))
    expect(suggest(worse, 'feature/large')).toBeUndefined()
  })
  test('cards refuted on scope, files, branch or pr are left out of the rate', async () => {
    const { suggest } = await A()
    const scoped = Array.from({ length: 20 }, (_, i) => ({ ...explored(`Z-${i}`, 'sonnet', 'low', false, 0.5), firstFailed: 'scope' }))
    const withScope = [...ledger(60, 60), ...scoped]
    expect(suggest(withScope, 'feature/large')).toMatchObject({ alias: 'sonnet', effort: 'low', n: 60 })
  })
  test('a recent failure on the suggested pair withdraws it', async () => {
    const { suggest } = await A()
    const rows = ledger(60, 60)
    rows.push({ ...explored('E-late', 'sonnet', 'low', false, 0.5) })
    expect(suggest(rows, 'feature/large')).toBeUndefined()
  })
  test('the Wilson 90% lower bound is the standard score interval', async () => {
    const { wilsonLower } = await A()
    expect(wilsonLower(24, 24)).toBeCloseTo(24 / (24 + 1.6449 ** 2), 3)
    expect(wilsonLower(0, 10)).toBe(0)
    expect(wilsonLower(5, 10)).toBeCloseTo(0.2693, 3)
    expect(wilsonLower(0, 0)).toBe(0)
  })
  test('the suggestion line names the pair, the class and the numbers', async () => {
    const { suggestionLine } = await A()
    expect(
      suggestionLine({ class: 'feature/large', alias: 'sonnet', effort: 'low', n: 24, lowerBound: 0.91, defaultRate: 0.96, usdPerConfirmed: 0.52, defaultUsdPerConfirmed: 0.89 }),
    ).toBe('suggest sonnet/low for feature/large (n 24, lower bound 91% vs default 96%, $0.52 vs $0.89 per confirmed card)')
  })
})

describe('MOD-275: the adaptive option', () => {
  test('off or suggest; apply is reserved and refused with a line saying it is not shipped yet', async () => {
    const { adaptiveMode, ADAPTIVE_MODES, APPLY_NOT_SHIPPED } = await A()
    expect(ADAPTIVE_MODES).toEqual(['off', 'suggest'])
    expect(adaptiveMode('off')).toBe('off')
    expect(adaptiveMode('suggest')).toBe('suggest')
    expect(adaptiveMode(' Suggest ')).toBe('suggest')
    expect(adaptiveMode('apply')).toBe('suggest')
    expect(adaptiveMode(undefined)).toBe('suggest')
    expect(APPLY_NOT_SHIPPED).toMatch(/apply is not shipped yet/)
  })
})
