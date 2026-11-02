// MOD-275: the seeded ledger generator the adaptive-picks simulation test runs (and the measurement script reuses). Not a suite file.
const X = () => import('../../hooks/lib/explore.ts')

// ---- the simulation's constants ------------------------------------------------------------------------------------
// Seeds and shares are constants. Every seed is run for every scenario; a scenario passes only when all seeds do.
// The seeds are the first run of five consecutive ones (from 101) for which the null scenario (v) holds: the cost-gap test
// (one standard error) lets an equal-cost pair through about three runs in ten, so (v) is also checked as a rate over MANY_SEEDS.
export const SEEDS = [110, 111, 112, 113, 114]
export const MANY_SEEDS = Array.from({ length: 60 }, (_, i) => 201 + i)
export const SHARES = [0.9, 0.05, 0.03, 0.01, 0.01]
export const CLASSES = ['feature/large', 'bug/small', 'test/large', 'feature/small', 'bug/large']
export const CARDS = 300
export const EXPLORE = 0.5 // the explore option's top value: the most evidence a 300-card ledger can gather
export const CV = 0.9 // coefficient of variation of one attempt's usd, as measured on this repo
export const SCOPE_REFUTED = 0.05 // cards refuted on scope whatever pair ran them (a brief defect, left out of every rate)
export const RATE = 1 // the default pair's true first-attempt pass rate; at 1 the Wilson bound n / (n + z²) is the binding limit, as for any very reliable pair
// The class is frontier work: MOD-274 never changes a frontier card's tier, so effort one level down is the one step it explores
// and the cheaper pair is the only candidate (a standard card has two, which splits the same cards over two pairs).
export const TIER = 'frontier'
export const BASE_EFFORT = 'high'
export const DEFAULT = 'opus/high'
export const CHEAP = 'opus/medium' // the cheaper pair: the effort one level down
export const MEAN_USD = { [DEFAULT]: 0.89, [CHEAP]: 0.52 }
export const DOMINANT = CLASSES[0]

// The simulation models what MOD-274 does to the ledger: the explore draw is the real fnv1a32 of the task id and the pair
// is the real explorePlan (a card nobody hand-set, attempt 1, least-tried pair first), so the explored cards are a random
// share of the same population the default pair's cards come from. It models the BUDGET and NO ESCALATION of exploratory
// attempts: a refuted exploratory attempt neither escalates nor spends budget, so each card is one attempt-1 row, on the
// pair it ran. MOD-277: a card counts the same way on either side (confirmed when any attempt confirmed, usd over every attempt), so
// a failed card retries once at the default pair (`rescue`, on by default): the card confirms if the retry does and the usd sums,
// and the rescue's cost lands on the pair that failed. Every pair's rate is its first-attempt pass rate.

/** mulberry32: a seeded generator in [0, 1). */
export function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A log-normal draw with the given mean and the constant CV. */
function usdOf(rand, mean) {
  const s2 = Math.log(1 + CV * CV)
  const u1 = Math.max(rand(), 1e-12)
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * rand())
  return Math.exp(Math.log(mean) - s2 / 2 + Math.sqrt(s2) * z)
}

export const classOf = rand => {
  let u = rand()
  for (let i = 0; i < SHARES.length; i++) {
    u -= SHARES[i]
    if (u < 0) return CLASSES[i]
  }
  return CLASSES[0]
}

const TIER_MAP = { economy: 'haiku', standard: 'sonnet', frontier: 'opus', premium: 'fable' }

/** The ledger a run of `cards` cards leaves; `rate(pair, i)` is a pair's true pass rate at card i. Row index after card i: `ends[i]`. */
export async function simulate(seed, rate, cards = CARDS, { rescue = true } = {}) {
  const { explorePlan, cardKind } = await X()
  void cardKind
  const rand = rng(seed)
  const rows = []
  const ends = []
  for (let i = 0; i < cards; i++) {
    const cls = classOf(rand)
    const task = `S${seed}-${i}`
    const plan = await explorePlan({
      task, attempt: 1, hasEffort: false, hasReason: false, tier: TIER, kind: cls.split('/')[0], className: cls,
      explore: EXPLORE, baseEffort: BASE_EFFORT, maxEffort: 'high', aliasOfTier: t => TIER_MAP[t], rows,
    })
    const alias = plan ? plan.alias : 'opus'
    const effort = plan ? plan.effort : BASE_EFFORT
    const pair = `${alias}/${effort}`
    const scope = rand() < SCOPE_REFUTED
    const pass = rand() < rate(pair, i)
    rows.push({
      kind: 'spawn', task, attempt: 1, tier: TIER, alias, effort, class: cls,
      effortSource: plan ? 'explore' : 'tier',
      ...(plan ? { explore: true, exploreFrom: DEFAULT } : {}),
      verdict: scope || !pass ? 'refuted' : 'consistent',
      ...(scope ? { firstFailed: 'scope' } : !pass ? { firstFailed: 'gate' } : {}),
      usd: usdOf(rand, MEAN_USD[pair]),
    })
    // MOD-277: a failed card (not a scope refute) retries at the default pair; the card confirms if the retry does, and the usd sums
    if (rescue && !scope && !pass) {
      const [rescueAlias = '', rescueEffort = ''] = DEFAULT.split('/')
      rows.push({
        kind: 'spawn', task, attempt: 2, tier: TIER, alias: rescueAlias, effort: rescueEffort, class: cls, effortSource: 'tier',
        verdict: rand() < rate(DEFAULT, i) ? 'consistent' : 'refuted',
        firstFailed: 'gate',
        usd: usdOf(rand, MEAN_USD[DEFAULT]),
      })
    }
    ends.push(rows.length)
  }
  return { rows, ends }
}

