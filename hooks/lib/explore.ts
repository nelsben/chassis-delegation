// MOD-274: a card's class (kind and size) and the small, recorded share of first attempts that run one step off the default,
// so the ledger can learn what effort and model each class needs. Pure: no host calls.
//
// Exploration is downward only (an upward step hits a ceiling and always costs more), one axis at a time, and only for a card
// nobody hand-set; the draw is a hash of the task id, so a card explores or not the same way every time it is asked.
import { pairHistory, type LedgerRowLike } from './choice'
import { clampEffort, EFFORTS, type Alias, type Effort, type Tier } from './tier'

// ---- the class ---------------------------------------------------------------------------------
export const CARD_KINDS = ['release', 'docs', 'bug', 'test', 'feature'] as const
export type CardKind = (typeof CARD_KINDS)[number]
export type CardSize = 'small' | 'large'

const isKind = (v: unknown): v is CardKind => typeof v === 'string' && (CARD_KINDS as readonly string[]).includes(v)

const cleanPath = (s: string): string => s.trim().replace(/^\.?\//, '')
const VERSION_FILES = /^(?:package(?:-lock)?\.json|VERSION|\.claude-plugin\/(?:plugin|marketplace)\.json|hooks\/lib\/version\.ts)$/
const isDocsPath = (p: string): boolean => p === 'CHANGELOG.md' || p === 'docs' || p.startsWith('docs/') || VERSION_FILES.test(p)
const isTestPath = (p: string): boolean => p === 'tests' || p.startsWith('tests/')

/**
 * The card's kind. The card's own `kind:` when it names one; else: a scope of only CHANGELOG, docs/** or version files is `release`
 * when the title starts "Release" or names a version, else `docs`; a title starting "Bug" or "Fix" is `bug`; a scope of only
 * tests/** is `test`; anything else is `feature`.
 */
export function cardKind(i: { kind?: unknown; title: string; scope: readonly string[] }): CardKind {
  const own = typeof i.kind === 'string' ? i.kind.trim().toLowerCase() : ''
  if (isKind(own)) return own
  const paths = i.scope.map(cleanPath).filter(p => p !== '')
  const title = i.title.trim()
  if (paths.length > 0 && paths.every(isDocsPath)) return /^release\b/i.test(title) || /\bv?\d+\.\d+\.\d+\b/.test(title) ? 'release' : 'docs'
  if (/^(?:bug|fix)/i.test(title)) return 'bug'
  if (paths.length > 0 && paths.every(isTestPath)) return 'test'
  return 'feature'
}

/** Small when the economy hint (tierHint) would fire for the card, else large. */
export const cardSize = (economyHintFires: boolean): CardSize => (economyHintFires ? 'small' : 'large')

/** `feature/large`. */
export const cardClassName = (kind: CardKind, size: CardSize): string => `${kind}/${size}`

// ---- the draw ----------------------------------------------------------------------------------
/** 32-bit FNV-1a over the UTF-8 bytes of `s`. */
export function fnv1a32(s: string): number {
  let h = 0x811c9dc5
  for (const b of new TextEncoder().encode(s)) {
    h ^= b
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/** The card's draw in [0, 1): fnv1a32 of its id, mod 1000, over 1000. */
export const exploreDraw = (task: string): number => (fnv1a32(task) % 1000) / 1000

export const DEFAULT_EXPLORE = 0.2
export const MAX_EXPLORE = 0.5

/** The `explore` option held to 0 .. 0.5; the default when it is not a finite number. */
export const clampExplore = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(MAX_EXPLORE, Math.max(0, v)) : DEFAULT_EXPLORE)

// ---- the plan ----------------------------------------------------------------------------------
export type ExploreInput = {
  task: string
  /** The attempt number of this spawn; only attempt 1 explores. */
  attempt: number
  /** The card has an `effort:` field. */
  hasEffort: boolean
  /** The card has a `tier_reason:` or an `effort_reason:`. */
  hasReason: boolean
  tier: Tier
  kind: CardKind
  /** `feature/large`: the class whose ledger rows say which pair is least tried. */
  className: string
  explore: number
  /** The effort the tier's default would run at (before the cap); undefined: the engine's. */
  baseEffort: Effort | undefined
  maxEffort: Effort
  aliasOfTier: (tier: Tier) => Alias
  rows: readonly LedgerRowLike[]
}

export type ExplorePlan = {
  tier: Tier
  alias: Alias
  effort: Effort | undefined
  axis: 'effort' | 'tier'
  /** The pair it moved from, `sonnet/medium` (`sonnet/default` when the engine's effort ran). */
  from: string
}

/**
 * Does this card explore, and how? Eligible: attempt 1, no `effort:`, no reason, tier standard or frontier, kind not release or docs.
 * It explores when its draw is below `explore`. The step is one axis, down: the effort one level down, or (standard only) the tier
 * one down at the same effort; a frontier card never changes tier. A step the maxEffort cap would change is skipped, never clamped.
 * Of the steps left the class's least-tried pair is taken; a tie goes to the effort step.
 */
export function explorePlan(i: ExploreInput): ExplorePlan | undefined {
  if (i.attempt !== 1 || i.hasEffort || i.hasReason) return undefined
  if (i.tier !== 'standard' && i.tier !== 'frontier') return undefined
  if (i.kind === 'release' || i.kind === 'docs') return undefined
  if (!(i.explore > 0) || !(exploreDraw(i.task) < i.explore)) return undefined
  const fromAlias = i.aliasOfTier(i.tier)
  const from = `${fromAlias}/${i.baseEffort ?? 'default'}`
  const held = clampEffort(i.baseEffort, i.maxEffort).effort
  const candidates: ExplorePlan[] = []
  const at = i.baseEffort ? EFFORTS.indexOf(i.baseEffort) : -1
  if (at > 0) {
    const down = EFFORTS[at - 1] as Effort
    // skip, not clamp: a cap that would lower the step, or that already ran the card at this effort, leaves nothing to learn
    if (!clampEffort(down, i.maxEffort).cappedFrom && down !== held) candidates.push({ tier: i.tier, alias: fromAlias, effort: down, axis: 'effort', from })
  }
  if (i.tier === 'standard' && !clampEffort(i.baseEffort, i.maxEffort).cappedFrom) {
    candidates.push({ tier: 'economy', alias: i.aliasOfTier('economy'), effort: i.baseEffort, axis: 'tier', from })
  }
  if (candidates.length === 0) return undefined
  const tried = pairHistory(i.rows, i.className)
  const count = (c: ExplorePlan): number => tried.find(p => p.alias === c.alias && p.effort === (c.effort ?? ''))?.n ?? 0
  return candidates.reduce((best, c) => (count(c) < count(best) ? c : best))
}

/** The words a row adds for an exploratory attempt: `explore from medium` for an effort step, `explore from sonnet` for a tier step. */
export function exploreLabel(from: string, alias: string, effort: string | undefined): string {
  const [fromAlias = '', fromEffort = ''] = from.split('/')
  return fromAlias === alias && fromEffort !== (effort ?? 'default') ? `explore from ${fromEffort}` : `explore from ${fromAlias}`
}
