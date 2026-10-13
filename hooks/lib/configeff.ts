// MOD-73: the options the mod really runs with, and where each came from. Pure: no `$`.
//
// Four layers, lowest first: the built-in default < the repo file (.chassis-delegation.json,
// repo-scoped fields only) < yours (the user options file, any field) < host (a Claude Code
// settings row). A host value that is unset counts as absent: for a repo field its manifest
// sentinel ('', 0, false, and the 'off' settingsLayer reads as unset), for any field its
// manifest default, because the host fills every unlisted value with its default. A locked
// host row always counts. Maps merge per key across the layers (mergeConfig).
import { mergeConfig, parseRepoConfig, REPO_KEYS, settingsLayer, type Effective, type RepoConfig } from './repoconfig'
import { CONFIG_TABLE, type Source } from './configtable'

export type { Source }

/** The user options file, under HOME: `{ "<field>": <value> }` for any manifest field. */
export const userOptionsPath = (home: string): string => `${home.replace(/\/+$/, '')}/.claude/chassis-delegation/options.json`

/** The fields the repo file may carry: the repo keys the manifest declares. */
export const isRepoField = (field: string): boolean => (REPO_KEYS as readonly string[]).includes(field) && CONFIG_TABLE[field]?.scope === 'repo'

const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

/** The user options file's text → its values (known fields only) and what was wrong with it; a malformed file gives none. */
export function parseUserOptions(text: string | undefined): { options: Record<string, unknown>; errors: string[] } {
  if (text === undefined || text.trim() === '') return { options: {}, errors: [] }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    return { options: {}, errors: [`not valid JSON: ${String(err).slice(0, 120)} (ignored)`] }
  }
  if (!isObject(parsed)) return { options: {}, errors: ['not a JSON object (ignored)'] }
  const options: Record<string, unknown> = {}
  const errors: string[] = []
  for (const [k, v] of Object.entries(parsed)) {
    if (k.startsWith('_')) continue
    if (!CONFIG_TABLE[k]) errors.push(`${k}: no such option (ignored)`)
    else options[k] = v
  }
  return { options, errors }
}

/** A user-scoped value the mod can run with: the manifest kind's type, a number finite and 0 or more (defaultBudget 1 or more), a choice among its options. */
export function validUser(field: string, v: unknown): boolean {
  const e = CONFIG_TABLE[field]
  if (!e) return false
  if (typeof e.def === 'boolean') return typeof v === 'boolean'
  if (typeof e.def === 'number') return typeof v === 'number' && Number.isFinite(v) && v >= (field === 'defaultBudget' ? 1 : 0)
  if (e.choices) return typeof v === 'string' && e.choices.includes(v)
  return typeof v === 'string'
}

/** The host's value counts: a locked row always; else set, and neither the manifest default nor a repo field's unset sentinel. */
export function hostCounts(field: string, v: unknown, locked: ReadonlySet<string>): boolean {
  if (locked.has(field)) return v !== undefined
  if (v === undefined) return false
  const e = CONFIG_TABLE[field]
  if (e && same(v, e.def)) return false
  if (e?.scope === 'repo') return !(v === '' || v === 0 || v === false)
  return true
}

/** What the layers resolve to: the options readConfig reads, the merged repo-scoped values, each field's value and source. */
export type Resolved = {
  /** Every user-scoped field at its chosen value (host, else yours, else the default), for readConfig. */
  opts: Record<string, unknown>
  eff: Effective
  values: Record<string, unknown>
  sources: Record<string, Source>
  errors: string[]
}

const MAP_FIELDS: readonly string[] = ['gateMap', 'agentTypes', 'tierMap', 'spendByTier', 'effortByTier']
/** A map the user file holds as JSON text (as a /config row does) is read as its object. */
const mapText = (field: string, v: unknown): unknown => {
  if (!MAP_FIELDS.includes(field) || typeof v !== 'string') return v
  try {
    return JSON.parse(v) as unknown
  } catch {
    return v
  }
}

/** The repo-scoped values as the view shows them, out of Effective. */
const repoValue = (eff: Effective, field: string): unknown => (eff as unknown as Record<string, unknown>)[field]

/**
 * defaults < repo < yours < host for every field. `host` is the activation options with any
 * listed /config row's value over it; `locked` names the fields a locked row holds.
 */
export function resolveOptions(host: Readonly<Record<string, unknown>>, user: Readonly<Record<string, unknown>>, repo: RepoConfig, locked: ReadonlySet<string> = new Set()): Resolved {
  const errors: string[] = []
  const hostRepo: Record<string, unknown> = {}
  const userRepo: Record<string, unknown> = {}
  const opts: Record<string, unknown> = {}
  const values: Record<string, unknown> = {}
  const sources: Record<string, Source> = {}
  for (const [field, e] of Object.entries(CONFIG_TABLE)) {
    const h = host[field]
    const hostOn = hostCounts(field, h, locked)
    if (e.scope === 'repo') {
      if (hostOn) hostRepo[field] = h
      if (field in user && !locked.has(field)) userRepo[field] = mapText(field, user[field])
      continue
    }
    const u = user[field]
    if (hostOn && (locked.has(field) || validUser(field, h))) {
      opts[field] = h
      sources[field] = locked.has(field) ? 'locked' : 'host'
    } else if (u !== undefined && !locked.has(field) && validUser(field, u)) {
      opts[field] = u
      sources[field] = 'yours'
    } else {
      if (u !== undefined && !locked.has(field)) errors.push(`${field} (yours): ${JSON.stringify(u)} is not a value it takes (ignored)`)
      opts[field] = e.def
      sources[field] = 'default'
    }
    values[field] = opts[field]
  }
  const settings = settingsLayer(hostRepo)
  // yours is read as the repo file is (strict): false, 'off' and [] are values there, not "unset"
  const mine = parseRepoConfig(JSON.stringify(userRepo))
  errors.push(...settings.errors, ...mine.errors.map(x => x.replace(/^(\S+): /, '$1 (yours): ')))
  const eff = mergeConfig(repo, settings.config, mine.config)
  for (const field of Object.keys(CONFIG_TABLE)) {
    if (CONFIG_TABLE[field]?.scope !== 'repo') continue
    const s = (eff.sources as Record<string, string>)[field] ?? 'default'
    sources[field] = s === 'settings' ? (locked.has(field) ? 'locked' : 'host') : (s as Source)
    values[field] = repoValue(eff, field)
  }
  return { opts, eff, values, sources, errors }
}

/** The user options file's new text with `field` set to `value`, or removed when `value` is undefined; other keys kept, 2-space JSON. */
export function userFileWith(text: string | undefined, field: string, value: unknown): string {
  let obj: Record<string, unknown> = {}
  try {
    const p = JSON.parse(text ?? '{}') as unknown
    if (isObject(p)) obj = p
  } catch {
    obj = {}
  }
  const next = { ...obj }
  if (value === undefined) delete next[field]
  else next[field] = value
  return `${JSON.stringify(next, null, 2)}\n`
}

/** The repo file's new text with `field` set (or removed when `value` is undefined), every other key and `_` comment kept in place; undefined when the file is not a JSON object. */
export function repoFileWith(text: string | undefined, field: string, value: unknown): string | undefined {
  let obj: Record<string, unknown> = {}
  if (text !== undefined && text.trim() !== '') {
    try {
      const p = JSON.parse(text) as unknown
      if (!isObject(p)) return undefined
      obj = p
    } catch {
      return undefined
    }
  }
  const next: Record<string, unknown> = {}
  let placed = false
  for (const [k, v] of Object.entries(obj)) {
    if (k === field) {
      if (value !== undefined) next[k] = value
      placed = true
    } else next[k] = v
  }
  if (!placed && value !== undefined) next[field] = value
  return `${JSON.stringify(next, null, 2)}\n`
}
