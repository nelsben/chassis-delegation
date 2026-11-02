// MOD-275: the cheapest (model, effort) pair that passes for a card class. Reads the ledger MOD-274's exploration fills and suggests; the
// brain decides. Pure: no host calls.
//
// Why a lower bound and a cost-gap test: a card's cost has a coefficient of variation near 0.9 and a pair's pass rate at n = 10 a standard
// error near 9 points, so a raw-rate rule would select noise. A pair is suggested only when it has enough cards (n >= 20), its Wilson 90%
// lower bound on the pass rate is within 5 points of the default pair's point rate, and its mean usd per confirmed card is under the
// default's by more than one standard error of its own mean.
import { cardOutcomes, type CardOutcome, type LedgerRowLike } from './choice'

// ---- the option ----------------------------------------------------------------------------------
export const ADAPTIVE_MODES = ['off', 'suggest'] as const
export type AdaptiveMode = (typeof ADAPTIVE_MODES)[number]
export const DEFAULT_ADAPTIVE: AdaptiveMode = 'suggest'
/** `apply` is reserved: the mod does not change a card's pair on its own until about four weeks of real suggestions have been replayed. */
export const ADAPTIVE_RESERVED = 'apply'
export const APPLY_NOT_SHIPPED = 'adaptive: apply is not shipped yet; use suggest (the mod suggests, you decide) or off'

/** The `adaptive` option as the mod reads it: off or suggest; anything else (including the reserved apply) is suggest. */
export const adaptiveMode = (v: unknown): AdaptiveMode => (typeof v === 'string' && v.trim().toLowerCase() === 'off' ? 'off' : DEFAULT_ADAPTIVE)

// ---- the statistics ------------------------------------------------------------------------------
/** The two-sided 90% normal quantile. */
export const Z90 = 1.6449
/** Cards a pair (and the default) needs before it can be suggested. */
export const MIN_CARDS = 20
/** How far under the default's point rate a pair's lower bound may sit. */
export const RATE_TOLERANCE = 0.05
/** A pair is withdrawn when any of its last RECENT counted cards failed: a drop the lifetime bound would take far longer to show. */
export const RECENT = 10

/** The Wilson score interval's lower bound for k passes in n tries; 0 with no tries. */
export function wilsonLower(k: number, n: number, z: number = Z90): number {
  if (!(n > 0)) return 0
  const p = k / n
  const z2 = z * z
  const centre = p + z2 / (2 * n)
  const half = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))
  return Math.max(0, (centre - half) / (1 + z2 / n))
}

type PairBox = { alias: string; effort: string; cards: CardOutcome[] }

type Stats = {
  /** Cards counted in the rate (not a brief defect). */
  n: number
  confirmed: number
  rate: number
  lowerBound: number
  /** Mean usd per confirmed card, and the standard error of that mean; undefined without two cards with usd and a confirmed one. */
  usdPerConfirmed: number | undefined
  usdSe: number | undefined
  recentFailed: boolean
}

function statsOf(cards: readonly CardOutcome[]): Stats | undefined {
  const counted = cards.filter(c => c.counted)
  if (counted.length === 0) return undefined
  const confirmed = counted.filter(c => c.confirmed).length
  const priced = counted.filter(c => c.usd !== undefined)
  const wins = priced.filter(c => c.confirmed).length
  let usdPerConfirmed: number | undefined
  let usdSe: number | undefined
  if (priced.length >= 2 && wins > 0) {
    // a ratio of sums (usd over confirmed cards): the standard error comes from each card's residual u_i - mean * confirmed_i
    const mean = priced.reduce((s, c) => s + (c.usd as number), 0) / wins
    const ss = priced.reduce((s, c) => s + ((c.usd as number) - mean * (c.confirmed ? 1 : 0)) ** 2, 0)
    usdPerConfirmed = mean
    usdSe = Math.sqrt(ss / (priced.length - 1) / priced.length) / (wins / priced.length)
  }
  return {
    n: counted.length,
    confirmed,
    rate: confirmed / counted.length,
    lowerBound: wilsonLower(confirmed, counted.length),
    usdPerConfirmed,
    usdSe,
    recentFailed: counted.slice(-RECENT).some(c => !c.confirmed),
  }
}

// ---- the population --------------------------------------------------------------------------------
/** MOD-274's eligibility, read off the ledger row: attempt 1 (cardOutcomes), standard or frontier, nobody hand-set the effort or gave a reason. */
function eligible(c: CardOutcome): boolean {
  const r = c.first
  if (r.tier !== undefined && r.tier !== 'standard' && r.tier !== 'frontier') return false
  if (r.effortSource === 'card') return false
  if ((typeof r.tierReason === 'string' && r.tierReason !== '') || (typeof r.effortReason === 'string' && r.effortReason !== '')) return false
  return true
}

// ---- the suggestion ----------------------------------------------------------------------------------
export type Suggestion = {
  class: string
  alias: string
  effort: string
  /** Cards counted for the suggested pair. */
  n: number
  lowerBound: number
  usdPerConfirmed: number
  usdSe: number
  defaultAlias: string
  defaultEffort: string
  defaultN: number
  defaultRate: number
  defaultUsdPerConfirmed: number
}

/**
 * The pair to suggest for a class, or undefined. The population is the class's attempt-1 cards that were eligible to explore
 * (`eligible`), so the default pair's cards and the explored pairs' are alike. The default pair is the one most of the non-exploratory
 * cards ran; a candidate is a pair that exploratory cards moved to from it (`exploreFrom`). A candidate qualifies with n >= 20, a
 * Wilson 90% lower bound at or above the default's point rate minus 5 points, no failure among its last 10 counted cards, and a mean
 * usd per confirmed card under the default's by more than one standard error of its own. The cheapest qualifying pair is returned;
 * the default pair never is.
 */
export function suggest(rows: readonly LedgerRowLike[], cls: string): Suggestion | undefined {
  const cards = cardOutcomes(rows, cls).filter(eligible)
  const own = new Map<string, number>()
  for (const c of cards) if (!c.explored) own.set(`${c.alias}/${c.effort}`, (own.get(`${c.alias}/${c.effort}`) ?? 0) + 1)
  const def = [...own.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0]
  if (def === undefined) return undefined
  const [defAlias = '', defEffort = ''] = def.split('/')
  const defCards = cards.filter(c => !c.explored && c.alias === defAlias && c.effort === defEffort)
  const d = statsOf(defCards)
  if (!d || d.n < MIN_CARDS || d.usdPerConfirmed === undefined) return undefined

  const boxes = new Map<string, PairBox>()
  for (const c of cards) {
    if (!c.explored || c.first.exploreFrom !== def) continue
    const key = `${c.alias}/${c.effort}`
    const box = boxes.get(key) ?? { alias: c.alias, effort: c.effort, cards: [] }
    box.cards.push(c)
    boxes.set(key, box)
  }
  let best: Suggestion | undefined
  for (const box of boxes.values()) {
    if (box.alias === defAlias && box.effort === defEffort) continue
    const s = statsOf(box.cards)
    if (!s || s.n < MIN_CARDS || s.usdPerConfirmed === undefined || s.usdSe === undefined) continue
    if (s.lowerBound < d.rate - RATE_TOLERANCE) continue
    if (s.recentFailed) continue
    if (!(d.usdPerConfirmed - s.usdPerConfirmed > s.usdSe)) continue
    if (best === undefined || s.usdPerConfirmed < best.usdPerConfirmed) {
      best = {
        class: cls, alias: box.alias, effort: box.effort, n: s.n, lowerBound: s.lowerBound, usdPerConfirmed: s.usdPerConfirmed, usdSe: s.usdSe,
        defaultAlias: defAlias, defaultEffort: defEffort, defaultN: d.n, defaultRate: d.rate, defaultUsdPerConfirmed: d.usdPerConfirmed,
      }
    }
  }
  return best
}

/** `suggest sonnet/low for feature/large (n 24, lower bound 91% vs default 96%, $0.52 vs $0.89 per confirmed card)`. */
export const suggestionLine = (s: Pick<Suggestion, 'class' | 'alias' | 'effort' | 'n' | 'lowerBound' | 'defaultRate' | 'usdPerConfirmed' | 'defaultUsdPerConfirmed'>): string =>
  `suggest ${s.alias}/${s.effort} for ${s.class} (n ${s.n}, lower bound ${Math.round(s.lowerBound * 100)}% vs default ${Math.round(s.defaultRate * 100)}%, $${s.usdPerConfirmed.toFixed(2)} vs $${s.defaultUsdPerConfirmed.toFixed(2)} per confirmed card)`
