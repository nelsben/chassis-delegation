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
 * MOD-325: one row per (kind, subtask, attempt): an earlier row that shares all three with a later one is dropped, so a re-verify of the
 * same attempt counts its spend once. A subtask absent reads 'main'; a row without a numeric attempt is kept. Kept rows keep the order of
 * their last appearance.
 */
export function lastPerAttempt(rows: readonly LedgerRowLike[]): LedgerRowLike[] {
  const keyOf = (r: LedgerRowLike): string | undefined =>
    typeof r.attempt === 'number' && Number.isFinite(r.attempt) ? `${String(r.kind)}\u0000${typeof r.subtask === 'string' && r.subtask !== '' ? r.subtask : 'main'}\u0000${r.attempt}` : undefined
  const last = new Map<string, number>()
  rows.forEach((r, i) => {
    const k = keyOf(r)
    if (k !== undefined) last.set(k, i)
  })
  return rows.filter((r, i) => {
    const k = keyOf(r)
    return k === undefined || last.get(k) === i
  })
}

/** One card as `pairHistory` counts it (MOD-275: the same reading, card by card). */
export type CardOutcome = {
  task: string
  alias: string
  effort: string
  /** The card's earliest attempt-1 spawn row with a verdict (its class, tier, effortSource, reasons and explore marks are read from it). */
  first: LedgerRowLike
  explored: boolean
  confirmed: boolean
  /** In the rate's denominator: not refuted only on a brief defect (scope, files, branch, pr). */
  counted: boolean
  /** The card's usd over all its spawn, resume and review rows that carry one (MOD-277: an exploratory card too, so a rescue lands on the pair that failed); undefined with none. */
  usd: number | undefined
  /** The row's own class, else what `classOf` says for the task (MOD-277); undefined when neither names one. */
  cls: string | undefined
}

/** MOD-277: maps a task id to its class (read from its card file); undefined when it cannot. */
export type ClassOf = (task: string) => string | undefined

/**
 * Every card the ledger has a pair for, in the order its first row appears; with `cls` only that class's. `pairHistory` is a sum over these.
 * MOD-277: an explored card and a default card are counted the same way (confirmed when any attempt confirmed, usd over every attempt); a
 * card that never confirmed and whose every judged verdict is a held-claim refute (scope, files, branch, pr), a no-report or unverified is
 * a reporting or brief defect and is not counted. A row without a `class` takes `classOf(task)` when one is given.
 */
export function cardOutcomes(rows: readonly LedgerRowLike[], cls?: string, classOf?: ClassOf): CardOutcome[] {
  const cards = new Map<string, LedgerRowLike[]>()
  for (const r of rows) {
    if (typeof r.task !== 'string' || r.task === '' || typeof r.kind !== 'string') continue
    cards.set(r.task, [...(cards.get(r.task) ?? []), r])
  }
  const out: CardOutcome[] = []
  for (const [task, rs] of cards) {
    const first = rs.find(r => r.kind === 'spawn' && r.attempt === 1 && typeof r.verdict === 'string' && r.verdict !== '' && typeof r.effort === 'string' && r.effort !== '' && typeof r.alias === 'string')
    if (!first) continue
    const own = typeof first.class === 'string' && first.class !== '' ? first.class : classOf?.(task)
    if (cls !== undefined && own !== cls) continue
    const explored = first.explore === true
    const verdicts = rs.filter(r => typeof r.verdict === 'string' && r.kind !== 'accept' && r.kind !== 'merged')
    const confirmed = verdicts.some(r => readVerdict(r.verdict as string) === 'consistent')
    const judged = verdicts.filter(r => r.verdict === 'refuted' || r.verdict === 'no-report' || r.verdict === 'unverified')
    const defect = (r: LedgerRowLike): boolean => r.verdict !== 'refuted' || heldClaim({ verdict: 'refuted', firstFailed: typeof r.firstFailed === 'string' ? r.firstFailed : undefined }) !== undefined
    const briefDefect = !confirmed && judged.length > 0 && judged.every(defect)
    const usdRows = lastPerAttempt(rs.filter(r => USD_KINDS.includes(r.kind as string) && typeof r.usd === 'number' && Number.isFinite(r.usd) && r.usdApprox !== true))
    out.push({
      task,
      alias: first.alias as string,
      effort: first.effort as string,
      first,
      explored,
      confirmed,
      counted: !briefDefect,
      usd: usdRows.length > 0 ? usdRows.reduce((s, r) => s + (r.usd as number), 0) : undefined,
      cls: own,
    })
  }
  return out
}

/**
 * Per (alias, effort) pair across the whole ledger. A card's pair is that of its earliest kind 'spawn' attempt-1 row with a verdict
 * and an effort (cards without are left out). Confirmed: any verdict row consistent. usd: the sum over its spawn, resume and review
 * rows that carry usd (rows marked usdApprox count in n and the rate, not in usd). A card refuted only on scope, files, branch or pr
 * is a brief defect and is left out of the rate's denominator. Most used first, at most 6. A card that escalates stays with its
 * attempt-1 pair.
 * MOD-274: with `cls` (`feature/large`) only the cards of that class count. A card whose attempt 1 explored (`explore: true`) is
 * counted for the pair it ran. MOD-277: counted like any card: confirmed when any attempt confirmed, usd over all its attempts, so the
 * rescue of a failed exploration is the explored pair's cost; `classOf` supplies a class for rows that have none.
 */
export function pairHistory(rows: readonly LedgerRowLike[], cls?: string, classOf?: ClassOf): PairStat[] {
  type Acc = { alias: string; effort: string; n: number; confirmed: number; counted: number; usd: number; withUsd: number }
  const pairs = new Map<string, Acc>()
  for (const c of cardOutcomes(rows, cls, classOf)) {
    const key = `${c.alias}\u0000${c.effort}`
    const a = pairs.get(key) ?? { alias: c.alias, effort: c.effort, n: 0, confirmed: 0, counted: 0, usd: 0, withUsd: 0 }
    a.n += 1
    if (c.confirmed) a.confirmed += 1
    if (c.counted) a.counted += 1
    if (c.usd !== undefined) a.withUsd += 1
    a.usd += c.usd ?? 0
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
