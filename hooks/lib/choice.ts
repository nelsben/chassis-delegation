// MOD-270: the brain's choice of model and effort for a card, each with a reason, and the ledger's record of how each
// (model, effort) pair did. Pure: no host calls.
import { heldClaim, readVerdict } from './attempts'

/** The efforts the card tool accepts; a clamp (maxEffort) is applied after this choice, not here. */
export const CARD_EFFORTS = ['low', 'medium', 'high'] as const
export type CardEffort = (typeof CARD_EFFORTS)[number]

/** One line, newlines and colons replaced by spaces, cut to 120 characters; '' when not text. */
export const cleanReason = (v: unknown): string => (typeof v === 'string' ? v.replace(/[\r\n:]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120).trim() : '')

/** The card tool's `effort`: absent, or one of low, medium, high (case and spaces forgiven); else a line naming the allowed ones. */
export function cardEffort(v: unknown): { effort?: CardEffort } | { error: string } {
  if (v === undefined) return {}
  const s = typeof v === 'string' ? v.trim().toLowerCase() : ''
  return (CARD_EFFORTS as readonly string[]).includes(s) ? { effort: s as CardEffort } : { error: `effort must be one of ${CARD_EFFORTS.join(', ')} (got "${typeof v === 'string' ? v : String(v)}")` }
}

/** `tier standard → sonnet (<tier_reason, or default>) · effort high (<effort_reason>)`; without an effort level of its own, `effort medium (tier default)`. */
export function choiceLine(i: { tier: string; alias: string; tierReason?: string; effort?: string; effortSource?: 'card' | 'tier' | 'explore'; effortReason?: string }): string {
  const effort = i.effort ?? 'default'
  const why = i.effortSource === 'card' ? (i.effortReason || 'card') : i.effortSource === 'explore' ? 'explore' : 'tier default'
  return `tier ${i.tier} → ${i.alias} (${i.tierReason || 'default'}) · effort ${effort} (${why})`
}

/** The reasons a started row shows after the effort, cut to 60 characters; '' when there are none. */
export const reasonsCut = (tierReason?: string, effortReason?: string): string => [tierReason, effortReason].filter(Boolean).join(' / ').slice(0, 60).trim()

// ---- the history: how each (alias, effort) pair did ---------------------------------------------
export type LedgerRowLike = Record<string, unknown>
export type PairStat = {
  alias: string
  effort: string
  /** Cards whose attempt 1 ran on this pair. */
  n: number
  confirmed: number
  /** Confirmed over the cards counted (those refuted only on a brief defect are left out); undefined when none count. */
  rate: number | undefined
  /** Sum of usd over the pair's cards divided by its confirmed cards; undefined with no confirmed card. */
  usdPerConfirmed: number | undefined
  /** usd came from fewer cards than n (an approximate row, or none). */
  approx: boolean
  mark?: 'thin' | 'low confidence'
}

const USD_KINDS = ['spawn', 'resume', 'review']

/**
 * Per (alias, effort) pair across the whole ledger. A card's pair is that of its earliest kind 'spawn' attempt-1 row with a verdict
 * and an effort (cards without are left out). Confirmed: any verdict row consistent. usd: the sum over its spawn, resume and review
 * rows that carry usd (rows marked usdApprox count in n and the rate, not in usd). A card refuted only on scope, files, branch or pr
 * is a brief defect and is left out of the rate's denominator. Most used first, at most 6. A card that escalates stays with its
 * attempt-1 pair.
 * MOD-274: with `cls` (`feature/large`) only the cards of that class count. A card whose attempt 1 explored (`explore: true`) is
 * counted for the pair it ran: confirmed only when that attempt was, and only that attempt's usd (attempt 2 ran another pair).
 */
export function pairHistory(rows: readonly LedgerRowLike[], cls?: string): PairStat[] {
  const cards = new Map<string, LedgerRowLike[]>()
  for (const r of rows) {
    if (typeof r.task !== 'string' || r.task === '' || typeof r.kind !== 'string') continue
    cards.set(r.task, [...(cards.get(r.task) ?? []), r])
  }
  type Acc = { alias: string; effort: string; n: number; confirmed: number; counted: number; usd: number; withUsd: number }
  const pairs = new Map<string, Acc>()
  for (const rs of cards.values()) {
    const first = rs.find(r => r.kind === 'spawn' && r.attempt === 1 && typeof r.verdict === 'string' && r.verdict !== '' && typeof r.effort === 'string' && r.effort !== '' && typeof r.alias === 'string')
    if (!first) continue
    if (cls !== undefined && first.class !== cls) continue
    const alias = first.alias as string
    const effort = first.effort as string
    const explored = first.explore === true
    const verdicts = rs.filter(r => typeof r.verdict === 'string' && r.kind !== 'accept' && r.kind !== 'merged' && (!explored || r.attempt === 1))
    const confirmed = verdicts.some(r => readVerdict(r.verdict as string) === 'consistent')
    const refuted = verdicts.filter(r => r.verdict === 'refuted')
    const briefDefect = !confirmed && refuted.length > 0 && refuted.every(r => heldClaim({ verdict: 'refuted', firstFailed: typeof r.firstFailed === 'string' ? r.firstFailed : undefined }) !== undefined)
    const usdRows = rs.filter(r => (!explored || r.attempt === 1) && USD_KINDS.includes(r.kind as string) && typeof r.usd === 'number' && Number.isFinite(r.usd) && r.usdApprox !== true)
    const key = `${alias}\u0000${effort}`
    const a = pairs.get(key) ?? { alias, effort, n: 0, confirmed: 0, counted: 0, usd: 0, withUsd: 0 }
    a.n += 1
    if (confirmed) a.confirmed += 1
    if (!briefDefect) a.counted += 1
    if (usdRows.length > 0) a.withUsd += 1
    a.usd += usdRows.reduce((s, r) => s + (r.usd as number), 0)
    pairs.set(key, a)
  }
  return [...pairs.values()]
    .sort((x, y) => y.n - x.n || `${x.alias}/${x.effort}`.localeCompare(`${y.alias}/${y.effort}`))
    .slice(0, 6)
    .map(a => ({
      alias: a.alias,
      effort: a.effort,
      n: a.n,
      confirmed: a.confirmed,
      rate: a.counted > 0 ? a.confirmed / a.counted : undefined,
      usdPerConfirmed: a.confirmed > 0 ? a.usd / a.confirmed : undefined,
      approx: a.withUsd < a.n,
      ...(a.n < 5 ? { mark: 'thin' as const } : a.n < 20 ? { mark: 'low confidence' as const } : {}),
    }))
}

/**
 * `history: sonnet/medium 120 · 88% · $0.71/card; haiku/low 40 · 98% · $0.02/card`; `history: none` with no pair.
 * MOD-274: `cls` names the card's class first (`history feature/large: …`); `fellBack` says the class had no rows and the pairs are
 * every class's (`history all classes (none for feature/large): …`).
 */
export function historyLine(pairs: readonly PairStat[], cls?: string, fellBack = false): string {
  if (pairs.length === 0) return 'history: none'
  const one = (p: PairStat): string => {
    const rate = p.rate === undefined ? '?' : `${Math.round(p.rate * 100)}%`
    const usd = p.usdPerConfirmed === undefined ? '$?/card' : `${p.approx ? '~' : ''}$${p.usdPerConfirmed.toFixed(2)}/card`
    return `${p.alias}/${p.effort} ${p.n}${p.mark ? ` ${p.mark}` : ''} · ${rate} · ${usd}`
  }
  const head = cls === undefined ? 'history' : fellBack ? `history all classes (none for ${cls})` : `history ${cls}`
  return `${head}: ${pairs.map(one).join('; ')}`
}
