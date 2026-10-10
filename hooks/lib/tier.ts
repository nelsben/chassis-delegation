// Tier precedence and tier → alias mapping. Pure: no `$`.
//
// Precedence (SPEC part 1): the brief header's `tier=` (the contract; `model=`
// there is advisory) > the caller's explicit `model` > the classifier. A
// header without `tier=` floors at standard (the chassis default) and never
// asks the classifier. A respawn after a refuted attempt (or a confirmed
// gate=fail) is escalated one tier above that attempt (never below the brief's
// own tier); a respawn after a no-report is held at that attempt's tier (GH-104).

export type Tier = 'economy' | 'standard' | 'frontier' | 'premium'
export type Alias = 'haiku' | 'sonnet' | 'opus' | 'fable'
export type TierSource = 'brief' | 'caller' | 'classified' | 'floor' | 'escalated' | 'held' | 'resume'
export type TierPick = { tier: Tier; source: TierSource; callerAlias?: Alias }

export const TIERS: readonly Tier[] = ['economy', 'standard', 'frontier', 'premium']
export const CLASSIFIER_LABELS = ['economy', 'standard', 'frontier'] as const

/** The built-in tier map (part 5B): a repo's `tierMap` (or /config) overrides it per tier. */
export const BUILTIN_TIER_MAP: Readonly<Record<Tier, Alias>> = {
  economy: 'haiku',
  standard: 'sonnet',
  frontier: 'opus',
  premium: 'fable',
}

/**
 * The classifier's label guide, from chassis/core/dispatch.md's tier table.
 * Exported so the classifier eval (tests/eval/classifier-cases.jsonl) runs against
 * exactly the text the mod sends.
 */
export const TIER_LABEL_GUIDE = [
  'You are choosing the model tier for a coding subagent from the task it is given.',
  'Answer with one label:',
  '- economy: mechanical work with an exact spec and a red test (bulk renames, fixture generation, log or screenshot triage, data seeding, reformatting). Nothing that needs judgment about project conventions.',
  '- standard: the default worker (feature implementation, test writing, refactors, end-to-end scenarios, standard debugging, read-only research). About 80% of tasks.',
  '- frontier: ambiguous debugging, architectural trade-offs, prompt engineering, cross-domain contracts, or anything the task itself is uncertain about.',
  'When unsure between two labels, answer the lower one unless the task is ambiguous or crosses domains.',
].join('\n')

const RANK: Record<Tier, number> = { economy: 0, standard: 1, frontier: 2, premium: 3 }

export const isTier = (x: unknown): x is Tier => typeof x === 'string' && (TIERS as readonly string[]).includes(x)

/** An alias or a full id → its family alias; undefined when it names no family. */
export function aliasOf(model: string | undefined): Alias | undefined {
  const m = /(haiku|sonnet|opus|fable)/.exec((model ?? '').toLowerCase())
  return m ? (m[1] as Alias) : undefined
}

/**
 * GH-108: what a card's `tier:` or a header's `tier=` means. The four tiers as
 * themselves; a model family (or a full id containing one) as its tier; anything
 * else undefined. Case-insensitive.
 */
export function tierOf(value: string | undefined): Tier | undefined {
  const v = (value ?? '').trim().toLowerCase()
  if (isTier(v)) return v
  const alias = aliasOf(v)
  return alias ? tierOfAlias(alias) : undefined
}

/** GH-108: the line for a tier written but unknown, which the mod runs at standard; undefined when absent or known. */
export function tierWarning(value: string | undefined): string | undefined {
  const v = (value ?? '').trim()
  if (v === '' || tierOf(v) !== undefined) return undefined
  return `warning: tier "${v}" is not economy, standard, frontier or premium; dispatched at standard`
}

export function tierOfAlias(alias: Alias): Tier {
  return alias === 'haiku' ? 'economy' : alias === 'sonnet' ? 'standard' : alias === 'opus' ? 'frontier' : 'premium'
}

/** economy → standard → frontier; frontier stays frontier; premium stays premium. */
export function nextTier(tier: Tier): Tier {
  return tier === 'economy' ? 'standard' : tier === 'standard' ? 'frontier' : tier
}

export const maxTier = (a: Tier, b: Tier): Tier => (RANK[a] >= RANK[b] ? a : b)

export type PickInput = {
  hadHeader: boolean
  headerTier?: string
  callerModel?: string
  classified?: string
  escalateFrom?: Tier
  /** GH-104: a respawn after a no-report runs at least at this tier (that attempt's), never one up. */
  holdAt?: Tier
}

/**
 * The classifier is asked only when nothing else decides: no header (a header
 * with a tier is the contract, one without floors at standard) AND no
 * caller-model hint (GH-1 item 8: a call per delegation otherwise).
 */
export const needsClassifier = (input: Pick<PickInput, 'hadHeader' | 'headerTier' | 'callerModel'>): boolean =>
  !input.hadHeader && tierOf(input.headerTier) === undefined && !input.callerModel

export function pickTier(input: PickInput): TierPick {
  let pick: TierPick
  const headerTier = tierOf(input.headerTier)
  if (headerTier) pick = { tier: headerTier, source: 'brief' }
  else if (input.callerModel) {
    const callerAlias = aliasOf(input.callerModel)
    pick = callerAlias ? { tier: tierOfAlias(callerAlias), source: 'caller', callerAlias } : { tier: 'standard', source: 'floor' }
  } else if (input.hadHeader) pick = { tier: 'standard', source: 'floor' }
  else if ((CLASSIFIER_LABELS as readonly string[]).includes(input.classified ?? '')) pick = { tier: input.classified as Tier, source: 'classified' }
  else pick = { tier: 'standard', source: 'floor' }
  if (input.escalateFrom) {
    const up = nextTier(input.escalateFrom)
    if (RANK[up] > RANK[pick.tier]) pick = { tier: up, source: 'escalated' }
  }
  if (input.holdAt && RANK[input.holdAt] > RANK[pick.tier]) pick = { tier: input.holdAt, source: 'held' }
  return pick
}

/**
 * The alias the spawn gets: the caller's own family when the caller decided,
 * else the tier map's entry for the tier (an id is reduced to its alias), else
 * the built-in map. Fable is never a spawn target: it is rewritten to opus.
 */
export function finalAlias(pick: TierPick, mappedTo: string | undefined): { alias: Alias; fableRewritten: boolean } {
  const mapped = aliasOf(mappedTo)
  const alias: Alias = pick.source === 'caller' && pick.callerAlias ? pick.callerAlias : mapped ?? BUILTIN_TIER_MAP[pick.tier]
  return alias === 'fable' ? { alias: 'opus', fableRewritten: true } : { alias, fableRewritten: false }
}

/**
 * GH-1 item 8: fable was asked for — the tier map gave it (and it was
 * rewritten), or the brief's advisory `model=` names it — and the spawn runs
 * on opus. The caller naming fable reaches here as a rewrite.
 */
export const fableRequested = (alias: Alias, fableRewritten: boolean, headerModel?: string): boolean =>
  alias === 'opus' && (fableRewritten || aliasOf(headerModel) === 'fable')

/** A briefed spawn's place on its budget (GH-104): `attempt` of `budget`. */
export type AttemptOf = { attempt: number; budget: number }

/**
 * The notice under the spawn. When fable was requested and opus spawns, it
 * says so at the tier the spawn runs at (GH-1 item 8), so the rewrite
 * never hides a tier: `tier=frontier → opus (fable requested; …)`. A briefed
 * spawn's notice ends with its attempt (GH-104), so a spend is never a
 * surprise: `tier=standard → sonnet (brief) · attempt 2/3`.
 */
export function noticeText(pick: TierPick, alias: Alias, fableAsked: boolean, at?: AttemptOf): string {
  const tail = at ? ` · attempt ${at.attempt}/${at.budget}` : ''
  if (fableAsked && alias === 'opus') return `tier=${pick.tier === 'premium' ? 'frontier' : pick.tier} → ${alias} (fable requested; fable is never spawned by the mod)${tail}`
  return `tier=${pick.tier} → ${alias} (${pick.source})${tail}`
}

const PICKED_BY: Readonly<Record<TierSource, string>> = {
  brief: "the brief header's tier=",
  caller: "the caller's model hint",
  classified: 'the classifier',
  floor: 'the standard floor',
  escalated: 'escalation one tier above the last refuted attempt',
  held: "the last attempt's tier (a respawn after a no-report is held there, never escalated)",
  resume: 'the resumed spawn',
}

/**
 * The spawn's debug line (GH-1 item 8): which source picked the tier, and
 * whether the classifier was called for it.
 * `T-7: tier=economy picked by the brief header's tier= (no classify call)`.
 */
export function tierPickLine(label: string, tier: Tier, pick: TierPick, callerModel: string | undefined, classifyCalled: boolean): string {
  const by = pick.source === 'caller' && callerModel ? `${PICKED_BY.caller} (${callerModel})` : PICKED_BY[pick.source]
  return `${label}: tier=${tier} picked by ${by} (${classifyCalled ? 'classify called' : 'no classify call'})`
}

/** What the classifier reads: the guide, then the task, cut to keep the call small. */
export function classifierText(prompt: string): string {
  const cut = prompt.length > 6000 ? prompt.slice(0, 6000) + '\n[…cut]' : prompt
  return `${TIER_LABEL_GUIDE}\n\nThe task:\n${cut}`
}

// ---- MOD-13: the effort a worker steps at ----------------------------------------
/** The levels `turn.step` names (the engine's ModelEffort). */
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export const EFFORTS: readonly Effort[] = ['low', 'medium', 'high', 'xhigh', 'max']
/** One entry of `effortByTier`: a level, or 0 / empty for the engine's own default. */
export type EffortSetting = Effort | 0 | ''
export type EffortTier = 'economy' | 'standard' | 'frontier'

/** Config `effortByTier` default: a standard card runs at medium, a frontier one at high. */
export const DEFAULT_EFFORT_BY_TIER: Readonly<Record<EffortTier, EffortSetting>> = { economy: 'low', standard: 'medium', frontier: 'high' }

const effortLevel = (v: unknown): Effort | undefined => {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : ''
  return (EFFORTS as readonly string[]).includes(s) ? (s as Effort) : undefined
}
export const isEffort = (v: unknown): v is Effort => typeof v === 'string' && (EFFORTS as readonly string[]).includes(v)

/**
 * The effort a worker's `turn.step` is rewritten to: the card's own `effort:`
 * when it names a level (`0` there keeps the engine's), else the tier's entry
 * (premium reads the frontier's). Undefined: leave the engine's default.
 */
export function effortFor(tier: Tier, cardEffort: string | undefined, table: Readonly<Record<EffortTier, EffortSetting>>): Effort | undefined {
  const own = effortLevel(cardEffort)
  if (own) return own
  if (cardEffort?.trim() === '0') return undefined
  return effortLevel(table[tier === 'premium' ? 'frontier' : tier])
}

/** The `/delegation` line: `effort: economy low · standard medium · frontier high`. */
export const effortText = (table: Readonly<Record<EffortTier, EffortSetting>>): string =>
  `effort: ${(['economy', 'standard', 'frontier'] as const).map(t => `${t} ${effortLevel(table[t]) ?? 'default'}`).join(' · ')}`
