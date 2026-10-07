// Part 5B: the per-repo config file and its precedence. Pure: no `$`.
//
// `<root>/.chassis-delegation.json` (optional) carries what differs per repo.
// The mod reads it at session.start and on each dispatch. Precedence, lowest
// first: the built-in defaults < the repo file < the user's settings
// (`/config`). Maps (gateMap, agentTypes, tierMap, spendByTier) merge per key across the
// three layers; every other key is replaced whole by the higher layer.
//
// A settings field is "unset" when it holds its manifest default: an empty
// string, 0 for maxWorkers, false for autoEval. So settings can turn autoEval
// on for every repo, but only the repo file (or removing evalCommand) turns a
// repo's autoEval off.
import { DEFAULT_SPEND_BY_TIER } from './cost'
import { checkGateEntry, DEFAULT_DOMAINS } from './allow'
import type { Alias, Tier } from './tier'

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

/**
 * A ref git can take as one argv word: no leading `-` (never an option), no
 * `..` (a range, not a ref), no whitespace or shell syntax. `main`,
 * `origin/develop`, `HEAD`, `HEAD~2` and a sha pass.
 */
export const isGitRef = (s: string): boolean => /^(?!-)[A-Za-z0-9._/@^~{}+-]+$/.test(s) && !s.includes('..') && s.length <= 200

/** An ignore glob the brief header can carry: no whitespace, quote or `]]`. */
const IGNORE_GLOB = /^[^\s"]+$/

export type SpendTier = 'economy' | 'standard' | 'frontier'

export type RepoConfig = {
  gateMap?: Record<string, string>
  agentTypes?: Record<string, string>
  tierMap?: Partial<Record<Tier, Alias>>
  evalCommand?: string
  evalLiveCommand?: string
  briefTemplate?: string
  briefExtra?: string
  maxWorkers?: number
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
}

export const REPO_KEYS = ['gateMap', 'agentTypes', 'tierMap', 'evalCommand', 'evalLiveCommand', 'briefTemplate', 'briefExtra', 'maxWorkers', 'domains', 'worktreeRoot', 'cardDir', 'autoEval', 'baseRef', 'ignore', 'spendByTier'] as const
export type RepoKey = (typeof REPO_KEYS)[number]

export type Effective = {
  gateMap: Record<string, string>
  agentTypes: Record<string, string>
  tierMap: Record<Tier, Alias>
  evalCommand: string
  evalLiveCommand: string
  briefTemplate: string
  briefExtra: string
  maxWorkers: number
  domains: string[]
  worktreeRoot: string
  cardDir: string
  autoEval: boolean
  baseRef: string
  ignore: string[]
  spendByTier: Record<SpendTier, number>
  /** Which layer each key came from. */
  sources: Record<RepoKey, 'default' | 'repo' | 'settings'>
}

const TIER_NAMES = ['economy', 'standard', 'frontier', 'premium'] as const
const ALIASES = ['haiku', 'sonnet', 'opus', 'fable'] as const
const DOMAIN = /^[a-z][a-z0-9-]*$/

type Parsed = { config: RepoConfig; errors: string[] }

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)

/** A map of strings, `_`-keys (comments) skipped, non-strings named. */
function stringMap(key: string, v: unknown, errors: string[], where: string): Record<string, string> | undefined {
  if (!isObject(v)) {
    errors.push(`${key}${where}: not an object (ignored)`)
    return undefined
  }
  const out: Record<string, string> = {}
  for (const [k, x] of Object.entries(v)) {
    if (k.startsWith('_')) continue
    if (typeof x !== 'string') errors.push(`${key}.${k}${where}: not a string (ignored)`)
    else {
      // GH-11: a gate command the allowlist would refuse at verify time is refused now
      const c = key === 'gateMap' ? checkGateEntry(x) : undefined
      if (c && !c.ok) errors.push(`${key}.${k}${where}: ${c.reason} (ignored)`)
      else out[k] = x
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

/** One layer's values from a plain object (the repo file, or settings after JSON strings are parsed). */
function layerOf(obj: Record<string, unknown>, where: string, strict: boolean): Parsed {
  const errors: string[] = []
  const config: RepoConfig = {}
  for (const [key, v] of Object.entries(obj)) {
    if (key.startsWith('_')) continue
    switch (key) {
      case 'gateMap':
      case 'agentTypes': {
        const m = stringMap(key, v, errors, where)
        if (m) config[key] = m
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
      case 'spendByTier': {
        const m = spendByTierOf(v, errors, where)
        if (m) config.spendByTier = m
        break
      }
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
    if ((key === 'gateMap' || key === 'agentTypes' || key === 'tierMap' || key === 'spendByTier') && typeof v === 'string') {
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

/** defaults < repo < settings: maps merge per key, the rest is replaced whole. */
export function mergeConfig(repo: RepoConfig, settings: RepoConfig): Effective {
  const sources = Object.fromEntries(REPO_KEYS.map(k => [k, settings[k] !== undefined ? 'settings' : repo[k] !== undefined ? 'repo' : 'default'])) as Effective['sources']
  const pick = <K extends RepoKey>(k: K, fallback: NonNullable<RepoConfig[K]>): NonNullable<RepoConfig[K]> =>
    (settings[k] ?? repo[k] ?? fallback) as NonNullable<RepoConfig[K]>
  return {
    gateMap: { ...repo.gateMap, ...settings.gateMap },
    agentTypes: { ...DEFAULT_AGENT_TYPES, ...repo.agentTypes, ...settings.agentTypes },
    tierMap: { ...DEFAULT_TIER_MAP, ...repo.tierMap, ...settings.tierMap },
    evalCommand: pick('evalCommand', ''),
    evalLiveCommand: pick('evalLiveCommand', ''),
    briefTemplate: pick('briefTemplate', ''),
    briefExtra: pick('briefExtra', ''),
    maxWorkers: pick('maxWorkers', DEFAULT_MAX_WORKERS),
    domains: [...pick('domains', [...DEFAULT_DOMAINS])],
    worktreeRoot: pick('worktreeRoot', ''),
    cardDir: pick('cardDir', DEFAULT_CARD_DIR),
    autoEval: settings.autoEval === true || repo.autoEval === true,
    baseRef: pick('baseRef', ''),
    ignore: [...pick('ignore', [...DEFAULT_IGNORE])],
    spendByTier: { ...DEFAULT_SPEND_BY_TIER, ...repo.spendByTier, ...settings.spendByTier },
    sources,
  }
}
