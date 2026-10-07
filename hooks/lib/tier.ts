// Tier precedence and tier → alias mapping. Pure: no `$`.
//
// Precedence (SPEC part 1): the brief header's `tier=` (the contract; `model=`
// there is advisory) > the caller's explicit `model` > the classifier. A
// header without `tier=` floors at standard (the chassis default) and never
// asks the classifier. A respawn after a failed attempt is escalated one tier
// above that attempt (never below the brief's own tier).

export type Tier = 'economy' | 'standard' | 'frontier' | 'premium'
export type Alias = 'haiku' | 'sonnet' | 'opus' | 'fable'
export type TierSource = 'brief' | 'caller' | 'classified' | 'floor' | 'escalated' | 'resume'
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
}

/**
 * The classifier is asked only when nothing else decides: no header (a header
 * with a tier is the contract, one without floors at standard) AND no
 * caller-model hint (GH-1 item 8: a call per delegation otherwise).
 */
export const needsClassifier = (input: Pick<PickInput, 'hadHeader' | 'headerTier' | 'callerModel'>): boolean =>
  !input.hadHeader && !isTier(input.headerTier) && !input.callerModel

export function pickTier(input: PickInput): TierPick {
  let pick: TierPick
  if (isTier(input.headerTier)) pick = { tier: input.headerTier, source: 'brief' }
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

/**
 * The notice under the spawn. When fable was requested and opus spawns, it
 * says so at the tier the spawn runs at (GH-1 item 8), so the rewrite
 * never hides a tier: `tier=frontier → opus (fable requested; …)`.
 */
export function noticeText(pick: TierPick, alias: Alias, fableAsked: boolean): string {
  if (fableAsked && alias === 'opus') return `tier=${pick.tier === 'premium' ? 'frontier' : pick.tier} → ${alias} (fable requested; fable is never spawned by the mod)`
  return `tier=${pick.tier} → ${alias} (${pick.source})`
}

const PICKED_BY: Readonly<Record<TierSource, string>> = {
  brief: "the brief header's tier=",
  caller: "the caller's model hint",
  classified: 'the classifier',
  floor: 'the standard floor',
  escalated: 'escalation one tier above the last failed attempt',
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
