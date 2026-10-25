// Part 5B: the per-repo config file and its precedence. Pure: no `$`.
//
// `<root>/.chassis-delegation.json` (optional) carries what differs per repo.
// The mod reads it at session.start and on each dispatch. Precedence, lowest
// first: the built-in defaults < the repo file < the user's settings
// (`/config`). Maps (gateMap, agentTypes, tierMap, spendByTier, maxWorkersByTier) merge per key across the
// three layers; every other key is replaced whole by the higher layer.
//
// A settings field is "unset" when it holds its manifest default: an empty
// string, 0 for maxWorkers, false for autoEval. So settings can turn autoEval
// on for every repo, but only the repo file (or removing evalCommand) turns a
// repo's autoEval off.
import { DEFAULT_SPEND_BY_TIER } from './cost'
import { checkGateEntry, DEFAULT_DOMAINS } from './allow'
import { EMPTY_GATE_KEY } from './gates'
import { DEFAULT_EFFORT_BY_TIER, isEffort, isTier, type Alias, type Effort, type EffortSetting, type Tier } from './tier'
import { DEFAULT_EFFORT_NUDGE, effortNudgeOf, nudgeCardsFor, type EffortNudge } from './nudge'

export const REPO_CONFIG_FILE = '.chassis-delegation.json'

/** The domains the chassis board's cards use; a branch keeps a card's domain literally. */
export { DEFAULT_DOMAINS }

/** Card domain → the agent type /dispatch spawns (dispatcher, cross and shared are ops-style work). */
/**
 * None built in: no repo's own subagent types are assumed. /dispatch spawns a
 * domain's card on the type `agentTypes` names, else on a subagent type the
 * session offers under the domain's own name, else on general-purpose.
 */
export const DEFAULT_AGENT_TYPES: Readonly<Record<string, string>> = {}

/** Tier → alias; an alias, never an id, so the engine's release moves the ladder. */
export const DEFAULT_TIER_MAP: Readonly<Record<Tier, Alias>> = { economy: 'haiku', standard: 'sonnet', frontier: 'opus', premium: 'fable' }

export const DEFAULT_MAX_WORKERS = 2

/** GH-16: globs always subtracted from a repo=here delta (the brain's own scratch). */
/** GH-12: the folder the task cards live in, relative to the repo root. */
export const DEFAULT_CARD_DIR = 'agents/tasks'

/** A relative folder: no leading `/`, no `..` segment, no whitespace or quote. */
export const isCardDir = (s: string): boolean => /^[^\s"'\\]+$/.test(s) && !s.startsWith('/') && !s.split('/').includes('..')

export const DEFAULT_IGNORE: readonly string[] = ['.delegation/**']

/** GH-111: the ignore set a repo=here delta always subtracts: the configured globs plus the card folder, so a new card is never in the worker's delta. */
export const ignoreWithCards = (ignore: readonly string[], cardDir: string): string[] => {
  const card = `${cardDir.replace(/^\/+|\/+$/g, '') || DEFAULT_CARD_DIR}/**`
  return ignore.includes(card) ? [...ignore] : [...ignore, card]
}

/**
 * A ref git can take as one argv word: no leading `-` (never an option), no
 * `..` (a range, not a ref), no whitespace or shell syntax. `main`,
 * `origin/develop`, `HEAD`, `HEAD~2` and a sha pass.
 */
export const isGitRef = (s: string): boolean => /^(?!-)[A-Za-z0-9._/@^~{}+-]+$/.test(s) && !s.includes('..') && s.length <= 200

/** An ignore glob the brief header can carry: no whitespace, quote or `]]`. */
const IGNORE_GLOB = /^[^\s"]+$/

/** GH-113: what a premium brain may do itself: off, warn (a row), deny. */
export type DelegateOnly = 'off' | 'warn' | 'deny'
const DELEGATE_ONLY: readonly string[] = ['off', 'warn', 'deny']

/** MOD-21: whether a consistent verdict is followed by a read-only reviewer: never, always, or only for frontier and premium cards. */
export type ReviewMode = 'off' | 'on' | 'on-frontier'
export const REVIEW_MODES: readonly ReviewMode[] = ['off', 'on', 'on-frontier']

export type SpendTier = 'economy' | 'standard' | 'frontier'

export type RepoConfig = {
  gateMap?: Record<string, string>
  /** MOD-98: gateMap entries the gate checker refused, id → why; they are not in gateMap. */
  refusedGates?: Record<string, string>
  /** MOD-143: gate id → the command merge runs in the worktree before it rebases, for a card that names that gate. */
  mergeCheckMap?: Record<string, string>
  agentTypes?: Record<string, string>
  tierMap?: Partial<Record<Tier, Alias>>
  evalCommand?: string
  evalLiveCommand?: string
  briefTemplate?: string
  briefExtra?: string
  /** MOD-124 (#188): a gitignored rules file (repo-relative or absolute) copied into every brief under a section the debrief drops. */
  briefLocal?: string
  maxWorkers?: number
  /** MOD-131 (#219): a second, lower ceiling under maxWorkers for the briefed workers of a tier (a whole number of 1 or more); a tier the map lacks takes the total alone. */
  maxWorkersByTier?: Partial<Record<Tier, number>>
  domains?: string[]
  worktreeRoot?: string
  /** GH-12: where the task cards live, relative to the root; default agents/tasks. */
  cardDir?: string
  autoEval?: boolean
  /** GH-16: the delta's base when the brief names none; empty = origin/main → main → origin/master → master. */
  baseRef?: string
  /** GH-16: globs always subtracted from a repo=here delta. */
  ignore?: string[]
  /** GH-106: dollars one attempt may spend, per tier (economy, standard, frontier); 0 = no ceiling. */
  spendByTier?: Partial<Record<SpendTier, number>>
  /** MOD-13: the effort a worker steps at, per tier. */
  effortByTier?: Partial<Record<SpendTier, EffortSetting>>
  /** MOD-114: the brain's effort nudge: the cards glob ("" = off) and the up and down words. */
  effortNudge?: Partial<EffortNudge>
  /** GH-113: the brain on opus or fable may not edit source (warn: a row; deny: refused); default off. */
  delegateOnly?: DelegateOnly
  /** MOD-7: owner/name of the repo /delegation debrief post files issues in. MOD-18: unset = the mod's own repository (the manifest's); "" = posting is off. */
  issueRepo?: string
  /** MOD-21: a read-only reviewer after a consistent verdict (off | on | on-frontier); default off. */
  review?: ReviewMode
  /** MOD-21: the tier the reviewer runs at; unset = one below the worker's. */
  reviewTier?: Tier
}

export const REPO_KEYS = ['gateMap', 'mergeCheckMap', 'agentTypes', 'tierMap', 'evalCommand', 'evalLiveCommand', 'briefTemplate', 'briefExtra', 'briefLocal', 'maxWorkers', 'maxWorkersByTier', 'domains', 'worktreeRoot', 'cardDir', 'autoEval', 'baseRef', 'ignore', 'spendByTier', 'effortByTier', 'effortNudge', 'delegateOnly', 'issueRepo', 'review', 'reviewTier'] as const
export type RepoKey = (typeof REPO_KEYS)[number]

export type Effective = {
  gateMap: Record<string, string>
  /** MOD-98: gateMap ids a layer wrote that the gate checker refused (and no layer defines validly), id → why. */
  refusedGates: Record<string, string>
  mergeCheckMap: Record<string, string>
  agentTypes: Record<string, string>
  tierMap: Record<Tier, Alias>
  evalCommand: string
  evalLiveCommand: string
  briefTemplate: string
  briefExtra: string
  briefLocal: string
  maxWorkers: number
  maxWorkersByTier: Partial<Record<Tier, number>>
  domains: string[]
  worktreeRoot: string
  cardDir: string
  autoEval: boolean
  baseRef: string
  ignore: string[]
  spendByTier: Record<SpendTier, number>
  effortByTier: Record<SpendTier, EffortSetting>
  effortNudge: EffortNudge
  delegateOnly: DelegateOnly
  issueRepo: string
  review: ReviewMode
  /** '' = one tier below the worker's. */
  reviewTier: Tier | ''
  /** Which layer each key came from (settings: the host's /config rows; yours: the user options file). */
  sources: Record<RepoKey, 'default' | 'repo' | 'yours' | 'settings'>
}

const TIER_NAMES = ['economy', 'standard', 'frontier', 'premium'] as const
const ALIASES = ['haiku', 'sonnet', 'opus', 'fable'] as const
const DOMAIN = /^[a-z][a-z0-9-]*$/
const OWNER_NAME = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

type Parsed = { config: RepoConfig; errors: string[] }

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)

// ---- MOD-143: merge checks ------------------------------------------------------------------
/** The placeholders merge fills in a merge check, and the sample values the gate checker sees them as. */
const MERGE_CHECK_SAMPLE: Readonly<Record<string, string>> = { '{card}': 'MOD-1', '{sha}': '0000000000000000000000000000000000000000' }

/**
 * MOD-143: why a merge check command is refused, or undefined when it may stand. The rule is the gate map's
 * (checkGateEntry), with `{card}` and `{sha}` read as sample values; a merge check is one command, never a chain.
 */
export function mergeCheckRefusal(cmd: string): string | undefined {
  if (cmd.trim() === '') return 'an empty command'
  if (cmd.includes(' && ')) return 'a merge check is one command; chain nothing with &&'
  let sample = cmd
  for (const [k, v] of Object.entries(MERGE_CHECK_SAMPLE)) sample = sample.split(k).join(v)
  const c = checkGateEntry(sample)
  return c.ok ? undefined : c.reason
}

/** MOD-143: a merge check split into words, then `{card}`, `{sha}` and `{worktree}` replaced inside each word; any other `{x}` stays as written. */
export function fillMergeCheck(cmd: string, v: { card: string; sha: string; worktree: string }): string[] {
  return cmd
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w.split('{card}').join(v.card).split('{sha}').join(v.sha).split('{worktree}').join(v.worktree))
}

/** MOD-143: the merge checks a card runs: its own `merge_check:` when it has one, else every map entry whose id is in its gate list, in gate order. */
export function mergeChecksFor(own: string | undefined, gates: readonly string[], map: Readonly<Record<string, string>>): string[] {
  if (own !== undefined && own.trim() !== '') return [own.trim()]
  const out: string[] = []
  for (const g of gates) {
    const cmd = Object.prototype.hasOwnProperty.call(map, g) ? map[g] : undefined
    if (cmd !== undefined && !out.includes(cmd)) out.push(cmd)
  }
  return out
}

const mergeCheckResult = (cmd: string): { ok: true } | { ok: false; reason: string } => {
  const why = mergeCheckRefusal(cmd)
  return why === undefined ? { ok: true } : { ok: false, reason: why }
}

/** A map of strings, `_`-keys (comments) skipped, non-strings named. */
function stringMap(key: string, v: unknown, errors: string[], where: string, refused?: Record<string, string>): Record<string, string> | undefined {
  if (!isObject(v)) {
    errors.push(`${key}${where}: not an object (ignored)`)
    return undefined
  }
  const out: Record<string, string> = {}
  for (const [k, x] of Object.entries(v)) {
    if (k.startsWith('_') && !(key === 'gateMap' && k === EMPTY_GATE_KEY)) continue
    if (typeof x !== 'string') errors.push(`${key}.${k}${where}: not a string (ignored)`)
    else if (key === 'gateMap' && k === EMPTY_GATE_KEY) out[k] = x // MOD-122: a gate id, checked below against the map
    else {
      // GH-11: a gate command the allowlist would refuse at verify time is refused now
      const c = key === 'gateMap' ? checkGateEntry(x) : key === 'mergeCheckMap' ? mergeCheckResult(x) : undefined
      if (c && !c.ok) {
        errors.push(`${key}.${k}${where}: ${c.reason} (ignored)`)
        if (refused) refused[k] = c.reason
      } else out[k] = x
    }
  }
  // MOD-122: _empty names a gate id the same map has (not a command)
  if (key === 'gateMap' && EMPTY_GATE_KEY in out) {
    const id = (out[EMPTY_GATE_KEY] as string).trim()
    if (id !== EMPTY_GATE_KEY && Object.prototype.hasOwnProperty.call(out, id)) out[EMPTY_GATE_KEY] = id
    else {
      errors.push(`gateMap.${EMPTY_GATE_KEY}${where}: ${JSON.stringify(id)} names no gate id in the map (ignored)`)
      delete out[EMPTY_GATE_KEY]
    }
  }
  return Object.keys(out).length > 0 ? out : undefined
}

function tierMapOf(v: unknown, errors: string[], where: string): Partial<Record<Tier, Alias>> | undefined {
  const raw = stringMap('tierMap', v, errors, where)
  if (!raw) return undefined
  const out: Partial<Record<Tier, Alias>> = {}
  for (const [k, x] of Object.entries(raw)) {
    if (!(TIER_NAMES as readonly string[]).includes(k)) errors.push(`tierMap.${k}${where}: not a tier (economy, standard, frontier, premium) (ignored)`)
    else if (!(ALIASES as readonly string[]).includes(x)) errors.push(`tierMap.${k}${where}: ${x} is not haiku, sonnet, opus or fable (ignored)`)
    else out[k as Tier] = x as Alias
  }
  return Object.keys(out).length > 0 ? out : undefined
}

function domainsOf(v: unknown, errors: string[], where: string): string[] | undefined {
  const list = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : undefined
  if (!list) {
    errors.push(`domains${where}: needs a list of words (ignored)`)
    return undefined
  }
  const out: string[] = []
  for (const item of list) {
    const d = typeof item === 'string' ? item.trim() : ''
    if (d === '') continue
    if (DOMAIN.test(d)) {
      if (!out.includes(d)) out.push(d)
    } else errors.push(`domains${where}: ${JSON.stringify(d || item)} is not a lowercase word (ignored)`)
  }
  return out.length > 0 ? out : undefined
}

/** GH-16: `ignore` as a list of globs (an array, or a comma string from /config); a bad entry is named and dropped. */
function ignoreOf(v: unknown, errors: string[], where: string): string[] | undefined {
  const list = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : undefined
  if (!list) {
    errors.push(`ignore${where}: needs a list of globs (ignored)`)
    return undefined
  }
  const out: string[] = []
  for (const item of list) {
    const g = typeof item === 'string' ? item.trim() : undefined
    if (g === '') continue
    if (g !== undefined && IGNORE_GLOB.test(g) && !g.includes(']]')) {
      if (!out.includes(g)) out.push(g)
    } else errors.push(`ignore${where}: ${JSON.stringify(g ?? item)} is not a glob (no spaces, quotes or ]]) (ignored)`)
  }
  return out
}

/** GH-106: `spendByTier` as tier → dollars (0 or more); a bad entry is named and dropped. */
function spendByTierOf(v: unknown, errors: string[], where: string): Partial<Record<SpendTier, number>> | undefined {
  if (!isObject(v)) {
    errors.push(`spendByTier${where}: not an object (ignored)`)
    return undefined
  }
  const out: Partial<Record<SpendTier, number>> = {}
  for (const [k, x] of Object.entries(v)) {
    if (k.startsWith('_')) continue
    if (!(['economy', 'standard', 'frontier'] as readonly string[]).includes(k)) errors.push(`spendByTier.${k}${where}: not a tier (economy, standard, frontier) (ignored)`)
    else if (typeof x !== 'number' || !Number.isFinite(x) || x < 0) errors.push(`spendByTier.${k}${where}: needs dollars, 0 or more (ignored)`)
    else out[k as SpendTier] = x
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/** MOD-131 (#219): `maxWorkersByTier` as tier → a whole number of 1 or more, any of the four tiers; a bad entry is named and dropped. */
function maxWorkersByTierOf(v: unknown, errors: string[], where: string): Partial<Record<Tier, number>> | undefined {
  if (!isObject(v)) {
    errors.push(`maxWorkersByTier${where}: not an object (ignored)`)
    return undefined
  }
  const out: Partial<Record<Tier, number>> = {}
  for (const [k, x] of Object.entries(v)) {
    if (k.startsWith('_')) continue
    if (!isTier(k)) errors.push(`maxWorkersByTier.${k}${where}: not a tier (economy, standard, frontier, premium) (ignored)`)
    else if (typeof x !== 'number' || !Number.isInteger(x) || x < 1) errors.push(`maxWorkersByTier.${k}${where}: needs a whole number of 1 or more (ignored)`)
    else out[k] = x
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/** MOD-13: `effortByTier` as tier → low…max, or 0 / "" for the engine's default; a bad entry is named and dropped. */
function effortByTierOf(v: unknown, errors: string[], where: string): Partial<Record<SpendTier, EffortSetting>> | undefined {
  if (!isObject(v)) {
    errors.push(`effortByTier${where}: not an object (ignored)`)
    return undefined
  }
  const out: Partial<Record<SpendTier, EffortSetting>> = {}
  for (const [k, x] of Object.entries(v)) {
    if (k.startsWith('_')) continue
    if (!(['economy', 'standard', 'frontier'] as readonly string[]).includes(k)) errors.push(`effortByTier.${k}${where}: not a tier (economy, standard, frontier) (ignored)`)
    else if (x === 0 || x === '') out[k as SpendTier] = x
    else if (typeof x === 'string' && isEffort(x.trim().toLowerCase())) out[k as SpendTier] = x.trim().toLowerCase() as Effort
    else errors.push(`effortByTier.${k}${where}: needs low, medium, high, xhigh or max (or 0 for the engine's default) (ignored)`)
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/** One layer's values from a plain object (the repo file, or settings after JSON strings are parsed). */
function layerOf(obj: Record<string, unknown>, where: string, strict: boolean): Parsed {
  const errors: string[] = []
  const config: RepoConfig = {}
  for (const [key, v] of Object.entries(obj)) {
    if (key.startsWith('_')) continue
    switch (key) {
      case 'mergeCheckMap': {
        const m = stringMap(key, v, errors, where)
        if (m) config.mergeCheckMap = m
        break
      }
      case 'gateMap':
      case 'agentTypes': {
        const refused: Record<string, string> = {}
        const m = stringMap(key, v, errors, where, key === 'gateMap' ? refused : undefined)
        if (m) config[key] = m
        if (Object.keys(refused).length > 0) config.refusedGates = refused
        break
      }
      case 'tierMap': {
        const m = tierMapOf(v, errors, where)
        if (m) config.tierMap = m
        break
      }
      case 'evalCommand':
      case 'evalLiveCommand':
      case 'briefTemplate':
      case 'briefExtra':
      case 'briefLocal':
      case 'worktreeRoot':
        if (typeof v !== 'string') errors.push(`${key}${where}: not a string (ignored)`)
        else if (v.trim() !== '') config[key] = key === 'worktreeRoot' ? v.trim().replace(/\/+$/, '') : v
        break
      case 'cardDir':
        if (typeof v !== 'string') errors.push(`cardDir${where}: not a string (ignored)`)
        else if (v.trim() !== '') {
          const d = v.trim().replace(/\/+$/, '')
          if (d !== '' && isCardDir(d)) config.cardDir = d
          else errors.push(`cardDir${where}: ${JSON.stringify(v)} is not a relative folder (no leading /, no ..) (ignored)`)
        }
        break
      case 'maxWorkers':
        if (typeof v === 'number' && Number.isInteger(v) && v >= 1) config.maxWorkers = v
        else if (!(v === 0 && !strict)) errors.push(`maxWorkers${where}: needs a whole number of 1 or more (ignored)`)
        break
      case 'maxWorkersByTier': {
        const m = maxWorkersByTierOf(v, errors, where)
        if (m) config.maxWorkersByTier = m
        break
      }
      case 'spendByTier': {
        const m = spendByTierOf(v, errors, where)
        if (m) config.spendByTier = m
        break
      }
      case 'effortByTier': {
        const m = effortByTierOf(v, errors, where)
        if (m) config.effortByTier = m
        break
      }
      case 'effortNudge': {
        const m = effortNudgeOf(v, errors, where)
        if (m) config.effortNudge = m
        break
      }
      case 'delegateOnly':
        if (typeof v !== 'string' || !DELEGATE_ONLY.includes(v.trim())) errors.push(`delegateOnly${where}: needs off, warn or deny (ignored)`)
        // in /config "off" is the manifest default: unset, so the repo file's value shows through
        else if (strict || v.trim() !== 'off') config.delegateOnly = v.trim() as DelegateOnly
        break
      case 'review':
        if (typeof v !== 'string' || !(REVIEW_MODES as readonly string[]).includes(v.trim())) errors.push(`review${where}: needs off, on or on-frontier (ignored)`)
        // in /config "off" is the manifest default: unset, so the repo file's value shows through
        else if (strict || v.trim() !== 'off') config.review = v.trim() as ReviewMode
        break
      case 'reviewTier':
        if (typeof v !== 'string') errors.push(`reviewTier${where}: not a string (ignored)`)
        else if (v.trim() !== '') {
          if (isTier(v.trim())) config.reviewTier = v.trim() as Tier
          else errors.push(`reviewTier${where}: needs economy, standard, frontier or premium (ignored)`)
        }
        break
      case 'issueRepo':
        if (typeof v !== 'string') errors.push(`issueRepo${where}: not a string (ignored)`)
        else if (v.trim() !== '') {
          if (OWNER_NAME.test(v.trim())) config.issueRepo = v.trim()
          else errors.push(`issueRepo${where}: ${JSON.stringify(v)} is not owner/name (ignored)`)
        } else if (strict) config.issueRepo = '' // MOD-18: the repo file's own "" turns posting off; in /config an empty string is "unset"
        break
      case 'domains': {
        const d = domainsOf(v, errors, where)
        if (d) config.domains = d
        break
      }
      case 'autoEval':
        if (typeof v !== 'boolean') errors.push(`autoEval${where}: not true or false (ignored)`)
        else if (v || strict) config.autoEval = v
        break
      case 'baseRef':
        if (typeof v !== 'string') errors.push(`baseRef${where}: not a string (ignored)`)
        else if (v.trim() !== '') {
          if (isGitRef(v.trim())) config.baseRef = v.trim()
          else errors.push(`baseRef${where}: ${JSON.stringify(v)} is not a git ref (ignored)`)
        }
        break
      case 'ignore': {
        // the repo file may say [] (nothing ignored); /config's empty string is "unset"
        const list = ignoreOf(v, errors, where)
        if (list && (strict || list.length > 0)) config.ignore = list
        break
      }
      default:
        if (strict) errors.push(`${key}${where}: unknown key (ignored)`)
    }
  }
  return { config, errors }
}

/** The repo file's text → its layer and the problems found (each value checked on its own). */
export function parseRepoConfig(text: string): Parsed {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    return { config: {}, errors: [`the file is not valid JSON: ${String(err).slice(0, 120)}`] }
  }
  if (!isObject(parsed)) return { config: {}, errors: ['the file is not a JSON object'] }
  return layerOf(parsed, '', true)
}

/**
 * The user's settings (`options`) → a layer: the map keys are JSON strings
 * there; an empty string, 0 or false is unset (the manifest default).
 */
export function settingsLayer(options: Readonly<Record<string, unknown>>): Parsed {
  const obj: Record<string, unknown> = {}
  const errors: string[] = []
  for (const key of REPO_KEYS) {
    const v = options[key]
    if (v === undefined || v === '' || v === 0 || v === false) continue
    if ((key === 'gateMap' || key === 'mergeCheckMap' || key === 'agentTypes' || key === 'tierMap' || key === 'spendByTier' || key === 'maxWorkersByTier' || key === 'effortByTier' || key === 'effortNudge') && typeof v === 'string') {
      try {
        obj[key] = JSON.parse(v)
      } catch {
        errors.push(`${key} (settings): not valid JSON (ignored)`)
      }
    } else obj[key] = v
  }
  const layer = layerOf(obj, ' (settings)', false)
  return { config: layer.config, errors: [...errors, ...layer.errors] }
}

/**
 * defaults < repo < user < settings: maps merge per key, the rest is replaced whole. MOD-73:
 * `user` is the user options file's layer (yours), between the repo file and the host's rows.
 */
export function mergeConfig(repo: RepoConfig, settings: RepoConfig, user: RepoConfig = {}): Effective {
  const sources = Object.fromEntries(REPO_KEYS.map(k => [k, settings[k] !== undefined ? 'settings' : user[k] !== undefined ? 'yours' : repo[k] !== undefined ? 'repo' : 'default'])) as Effective['sources']
  const pick = <K extends RepoKey>(k: K, fallback: NonNullable<RepoConfig[K]>): NonNullable<RepoConfig[K]> =>
    (settings[k] ?? user[k] ?? repo[k] ?? fallback) as NonNullable<RepoConfig[K]>
  const gateMap = { ...repo.gateMap, ...user.gateMap, ...settings.gateMap }
  const refusedGates = Object.fromEntries(Object.entries({ ...repo.refusedGates, ...user.refusedGates, ...settings.refusedGates }).filter(([id]) => !(id in gateMap)))
  const cardDir = pick('cardDir', DEFAULT_CARD_DIR)
  const effortNudge = { ...DEFAULT_EFFORT_NUDGE, ...repo.effortNudge, ...user.effortNudge, ...settings.effortNudge }
  // MOD-121: no layer set `cards` -> the card folder as resolved; an explicit glob wins and "" turns the nudge off
  if (settings.effortNudge?.cards === undefined && user.effortNudge?.cards === undefined && repo.effortNudge?.cards === undefined) effortNudge.cards = nudgeCardsFor(cardDir)
  return {
    gateMap,
    refusedGates,
    mergeCheckMap: { ...repo.mergeCheckMap, ...user.mergeCheckMap, ...settings.mergeCheckMap },
    agentTypes: { ...DEFAULT_AGENT_TYPES, ...repo.agentTypes, ...user.agentTypes, ...settings.agentTypes },
    tierMap: { ...DEFAULT_TIER_MAP, ...repo.tierMap, ...user.tierMap, ...settings.tierMap },
    evalCommand: pick('evalCommand', ''),
    evalLiveCommand: pick('evalLiveCommand', ''),
    briefTemplate: pick('briefTemplate', ''),
    briefExtra: pick('briefExtra', ''),
    briefLocal: pick('briefLocal', ''),
    maxWorkers: pick('maxWorkers', DEFAULT_MAX_WORKERS),
    maxWorkersByTier: { ...repo.maxWorkersByTier, ...user.maxWorkersByTier, ...settings.maxWorkersByTier },
    domains: [...pick('domains', [...DEFAULT_DOMAINS])],
    worktreeRoot: pick('worktreeRoot', ''),
    cardDir,
    autoEval: settings.autoEval === true || (user.autoEval ?? repo.autoEval) === true,
    baseRef: pick('baseRef', ''),
    ignore: [...pick('ignore', [...DEFAULT_IGNORE])],
    spendByTier: { ...DEFAULT_SPEND_BY_TIER, ...repo.spendByTier, ...user.spendByTier, ...settings.spendByTier },
    effortByTier: { ...DEFAULT_EFFORT_BY_TIER, ...repo.effortByTier, ...user.effortByTier, ...settings.effortByTier },
    effortNudge,
    delegateOnly: pick('delegateOnly', 'off'),
    issueRepo: pick('issueRepo', ''),
    review: pick('review', 'off'),
    reviewTier: settings.reviewTier ?? user.reviewTier ?? repo.reviewTier ?? '',
    sources,
  }
}

// ---- MOD-18: the mod's own tracker ---------------------------------------------------

/** `owner/name` out of a manifest URL field: github.com in any form (https, ssh, git+, `github:`), or a bare owner/name; '' otherwise. */
function githubOwnerName(url: string): string {
  const u = url.trim().replace(/^git\+/, '')
  const short = /^(?:github:)?([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)$/.exec(u)
  const web = /^(?:[a-z+]+:\/\/(?:[^@/]+@)?|[^@/\s]+@)github\.com[:/]([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:[/#?].*)?$/i.exec(u)
  const found = web ? `${web[1]}/${web[2]}` : (short?.[1] ?? '').replace(/\.git$/, '')
  return OWNER_NAME.test(found) ? found : ''
}

/** The mod's own repository, owner/name, out of the manifest's `repository` (a string or {url}) or `homepage`; '' = it names none on github.com. */
export function manifestRepo(manifestText: string | undefined): string {
  let m: unknown
  try {
    m = JSON.parse(manifestText ?? '')
  } catch {
    return ''
  }
  if (!isObject(m)) return ''
  const repository = isObject(m.repository) ? m.repository.url : m.repository
  for (const field of [repository, m.homepage]) {
    if (typeof field !== 'string') continue
    const found = githubOwnerName(field)
    if (found !== '') return found
  }
  return ''
}

/**
 * The repo `/delegation debrief post` files in. A value the repo file or /config set wins, an
 * explicit "" in the repo file turns posting off, and a key left unset takes the mod's own
 * repository (`own: true`), so a finding can be posted from any repo the mod runs in.
 */
export function resolveIssueRepo(eff: Pick<Effective, 'issueRepo' | 'sources'>, manifestText: string | undefined): { repo: string; own: boolean } {
  if (eff.sources.issueRepo !== 'default') return { repo: eff.issueRepo, own: false }
  const repo = manifestRepo(manifestText)
  return { repo, own: repo !== '' }
}
