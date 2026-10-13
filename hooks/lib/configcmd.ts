// MOD-66, MOD-73: /delegation config. The pure half: the options the mod runs with (each with
// its source, resolved in ./configeff.ts) shown short and human, one group or one field shown
// whole, and a typed `<field> <value>` parsed by the field's kind into a plan the caller carries
// out. The $ calls (list, set, the files) are in register.ts.
import { CONFIG_GROUPS, CONFIG_TABLE, GROUP_WORDS, OTHER_GROUP, RESERVED, TABLE_FIELDS, groupWord, type Render, type Source } from './configtable'
import { parseRepoConfig } from './repoconfig'
import { validUser } from './configeff'

export { CONFIG_GROUPS, CONFIG_TABLE, OTHER_GROUP }
export type { Source }

/** The prefix of this mod's `/config` rows: `<plugin>.<field>`. */
export const CONFIG_PREFIX = 'chassis-delegation.'

/** The part of a `$.config.list()` row the command reads. */
export type CfgRow = {
  key: string
  description?: string
  kind: 'boolean' | 'number' | 'text' | 'choice'
  value: unknown
  options?: readonly string[]
  isLocked: boolean
}

/** Field to its manifest default. */
export type CfgDefaults = Readonly<Record<string, unknown>>

/** The userConfig defaults of the manifest text; nothing when it does not parse. */
export function manifestDefaults(text: string | undefined): CfgDefaults {
  if (text === undefined) return {}
  try {
    const uc = (JSON.parse(text) as { userConfig?: Record<string, { default?: unknown }> }).userConfig ?? {}
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(uc)) if (v && typeof v === 'object' && 'default' in v) out[k] = v.default
    return out
  } catch {
    return {}
  }
}

/** What the manifest's userConfig says of one field. */
export type FieldSpec = { kind: CfgRow['kind']; options?: readonly string[]; description?: string; hasDefault: boolean; default?: unknown }

/** The userConfig fields of the manifest text, in order, with kind (type + options), choices, description, default. */
export function manifestFields(text: string | undefined): Record<string, FieldSpec> {
  if (text === undefined) return {}
  try {
    const uc = (JSON.parse(text) as { userConfig?: Record<string, { type?: string; options?: unknown; description?: string; default?: unknown }> }).userConfig ?? {}
    const out: Record<string, FieldSpec> = {}
    for (const [k, v] of Object.entries(uc)) {
      if (!v || typeof v !== 'object') continue
      const opts = Array.isArray(v.options) ? v.options.map(String) : undefined
      const kind: CfgRow['kind'] = v.type === 'boolean' ? 'boolean' : v.type === 'number' ? 'number' : opts && opts.length > 0 ? 'choice' : 'text'
      out[k] = { kind, ...(kind === 'choice' && opts ? { options: opts } : {}), ...(typeof v.description === 'string' ? { description: v.description } : {}), hasDefault: 'default' in v, ...('default' in v ? { default: v.default } : {}) }
    }
    return out
  } catch {
    return {}
  }
}

const rowPlugin = (r: CfgRow): string | undefined => (r as { provider?: { plugin?: string } }).provider?.plugin

/** This mod's rows of `$.config.list()` by field: a row is its own when its provider.plugin is the mod's name or its key starts with `<name>.`; it answers to its key after the prefix, its label, or the last part of its key. */
export function rowsByField(rows: readonly CfgRow[], plugin: string, fields: readonly string[]): Record<string, CfgRow> {
  const out: Record<string, CfgRow> = {}
  const pre = `${plugin}.`
  for (const r of rows) {
    if (!r || typeof r.key !== 'string') continue
    if (rowPlugin(r) !== plugin && !r.key.startsWith(pre)) continue
    const label = (r as { label?: string }).label
    const names = [r.key.startsWith(pre) ? r.key.slice(pre.length) : undefined, label, r.key.slice(r.key.lastIndexOf('.') + 1)].filter((x): x is string => !!x)
    const field = names.find(n => fields.includes(n)) ?? names[0]
    if (field && !(field in out)) out[field] = r
  }
  return out
}

/** What the command shows: every field, its value and source, the host's rows for the mod, the manifest's words, and what the mod derives (its issue repo, card folder). */
export type CfgView = {
  plugin: string
  /** The table's fields, then any the manifest adds. */
  fields: readonly string[]
  values: Readonly<Record<string, unknown>>
  sources: Readonly<Record<string, Source>>
  rows: Readonly<Record<string, CfgRow>>
  /** The manifest's description and kind of each field it declares. */
  specs?: Readonly<Record<string, FieldSpec>>
  /** The repo /delegation debrief post files in ('' = none) and the card folder, for the `in effect:` lines. */
  derived?: { issueRepo?: string; cardDir?: string }
}

// ---- human values ------------------------------------------------------------------

/** The longest line the short and grouped views print; the show view holds the whole value. */
export const LINE_MAX = 100
export const cut = (s: string, max = LINE_MAX): string => (s.length <= max ? s : `${s.slice(0, max - 1)}…`)

const num = (n: number): string => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100))
const tokens = (n: number): string => (n >= 1_000_000 && n % 100_000 === 0 ? `${num(n / 1_000_000)}M` : n >= 1000 ? `${num(n / 1000)}K` : num(n))
const dollars = (n: number): string => (n === 0 ? 'no cap' : `$${num(n)}`)
const NONE = '(none)'

/** A list held as an array or a comma string, as its items. */
const items = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === 'string' ? v.split(',') : []).map(x => x.trim()).filter(x => x !== '')
const entries = (v: unknown): [string, unknown][] => {
  let o = v
  if (typeof v === 'string' && v.trim() !== '') {
    try {
      o = JSON.parse(v)
    } catch {
      return []
    }
  }
  return o !== null && typeof o === 'object' && !Array.isArray(o) ? Object.entries(o as Record<string, unknown>).filter(([k]) => !k.startsWith('_')) : []
}

const renderOf = (field: string, v: unknown): Render => CONFIG_TABLE[field]?.render ?? (typeof v === 'boolean' ? 'bool' : typeof v === 'number' ? 'count' : 'text')

/** A value as a person reads it, by the field's kind: on/off, `20 min`, `6 h`, `$10` (`no cap` for 0), `200K`, `a→b, c→d`, the gate ids, a comma list, `(none)` for empty. */
export function shownValue(field: string, v: unknown): string {
  switch (renderOf(field, v)) {
    case 'bool':
      return v === true ? 'on' : v === false ? 'off' : String(v)
    case 'count':
      return typeof v === 'number' ? num(v) : String(v)
    case 'minutes':
      return typeof v === 'number' ? `${num(v)} min` : String(v)
    case 'hours':
      return typeof v === 'number' ? `${num(v)} h` : String(v)
    case 'dollars':
      return typeof v === 'number' ? dollars(v) : String(v)
    case 'tokens':
      return typeof v === 'number' ? tokens(v) : String(v)
    case 'map': {
      const e = entries(v)
      return e.length === 0 ? NONE : e.map(([k, x]) => `${k}→${String(x)}`).join(', ')
    }
    case 'dollarMap': {
      const e = entries(v)
      return e.length === 0 ? NONE : e.map(([k, x]) => `${k}→${typeof x === 'number' ? dollars(x) : String(x)}`).join(', ')
    }
    case 'effortMap': {
      const e = entries(v)
      return e.length === 0 ? NONE : e.map(([k, x]) => `${k}→${x === 0 || x === '' ? 'default' : String(x)}`).join(', ')
    }
    case 'gates': {
      const e = entries(v)
      return e.length === 0 ? NONE : e.map(([k]) => k).join(', ')
    }
    case 'list': {
      const l = items(v)
      return l.length === 0 ? NONE : l.join(', ')
    }
    default:
      return v === '' || v === undefined || v === null ? NONE : String(v)
  }
}

const off = (v: unknown) => v !== true
const empty = (v: unknown) => typeof v !== 'string' || v.trim() === ''
const gitOff = (values: Readonly<Record<string, unknown>>) => (values.gitGuard === false ? 'unused (gitGuard is off)' : undefined)

/**
 * MOD-73: the `in effect:` line of the show view, when what the mod does differs from the
 * value it holds. Every derived case the mod has: a value that is replaced (0 workers, 0
 * events, a budget under 1), a value that needs another (autoEval and evalLive without their
 * commands, probeModels without ids, postFindings without an issue repo), an empty value with a
 * built-in meaning, the card folder always ignored, and a value that waits on a switch that is off.
 */
export function inEffect(field: string, values: Readonly<Record<string, unknown>>, derived: CfgView['derived'] = {}): string | undefined {
  const v = values[field]
  const unused = (sw: string) => (off(values[sw]) ? `unused (${sw} is off)` : undefined)
  switch (field) {
    case 'autoEval':
      return v === true && empty(values.evalCommand) ? 'off (no evalCommand)' : undefined
    case 'evalLive':
      if (v !== true) return undefined
      if (empty(values.evalLiveCommand)) return 'off (no evalLiveCommand)'
      return off(values.autoEval) || empty(values.evalCommand) ? 'off (the live test follows a clean autoEval run, and that is off)' : undefined
    case 'reviewTier':
      if (values.review === 'off') return 'unused (review is off)'
      return empty(v) ? 'one tier below the worker' : undefined
    case 'maxWorkers':
      return v === 0 ? '2' : undefined
    case 'freshSessionTokens':
      return v === 0 ? 'off' : undefined
    case 'readyFallbackMinutes':
      return v === 0 ? 'never (a waiting task waits for you)' : undefined
    case 'debriefMinEvents':
      return v === 0 ? '1' : unused('autoDebrief')
    case 'debriefIdleMinutes':
    case 'debriefMinNewLines':
    case 'debriefCooldownHours':
    case 'debriefAgent':
      return unused('autoDebrief')
    case 'evalIdleMinutes':
    case 'evalAgent':
      return off(values.autoEval) ? 'unused (autoEval is off)' : empty(values.evalCommand) ? 'unused (no evalCommand)' : undefined
    case 'evalLiveCommand':
    case 'evalLiveMaxUsd':
    case 'sessionUsdCap':
      return unused('evalLive')
    case 'candidateIds':
      return unused('probeModels')
    case 'probeModels':
      return v === true && items(values.candidateIds).length === 0 ? 'off (no candidateIds)' : undefined
    case 'guardBranches':
      return gitOff(values) ?? (items(v).length === 0 ? 'main, master' : undefined)
    case 'driveWarnTokens':
      return unused('driveWarn')
    case 'postFindings':
      return v !== 'off' && derived.issueRepo === '' ? 'off (no issue repo)' : undefined
    case 'baseRef':
      return empty(v) ? 'origin/main → main → origin/master → master' : undefined
    case 'worktreeRoot':
      return empty(v) ? 'a folder beside the repo, <repo>-<task>' : undefined
    case 'briefDir':
      return empty(v) ? '<repo>/.delegation/briefs' : undefined
    case 'briefTemplate':
      return empty(v) ? "the mod's own hooks/templates/brief.md" : undefined
    case 'ignore': {
      const card = `${(derived.cardDir ?? '').replace(/^\/+|\/+$/g, '') || 'agents/tasks'}/**`
      const l = items(v)
      return l.includes(card) ? undefined : [...l, card].join(', ')
    }
    case 'delegateOnly':
      return v !== 'off' ? 'only while the main assistant runs on opus or fable' : undefined
    case 'defaultBudget':
      return typeof v === 'number' && (v < 1 || !Number.isInteger(v)) ? String(v >= 1 ? Math.floor(v) : 3) : undefined
    default:
      return undefined
  }
}

// ---- the views -----------------------------------------------------------------------

export const HOW = 'all: /delegation config all · one group: /delegation config <group> · one: /delegation config <field> · set: /delegation config <field> <value>'

const groupOf = (field: string): string => CONFIG_TABLE[field]?.group ?? OTHER_GROUP
const ALL_GROUPS: readonly string[] = [...CONFIG_GROUPS, OTHER_GROUP]
const fieldLine = (view: CfgView, f: string): string => cut(`${f} = ${shownValue(f, view.values[f])} (${view.sources[f] ?? 'default'})`)

/** `/delegation config`: one count line, then only the fields set (source not default) under their group headings, then how to see or set the rest. */
export function configShort(view: CfgView): string {
  const set = view.fields.filter(f => (view.sources[f] ?? 'default') !== 'default')
  const count = (s: Source) => set.filter(f => view.sources[f] === s).length
  const head = `${view.plugin}: ${view.fields.length} options, ${set.length} set (${count('repo')} repo, ${count('yours')} yours, ${count('host')} host, ${count('locked')} locked)`
  if (set.length === 0) return [head, `all ${view.fields.length} at their defaults`, HOW].join('\n')
  const body = ALL_GROUPS.flatMap(g => {
    const of = set.filter(f => groupOf(f) === g)
    return of.length === 0 ? [] : [g, ...of.map(f => cut(` ${f} = ${shownValue(f, view.values[f])} (${view.sources[f]})`))]
  })
  return [head, ...body, HOW].join('\n')
}

/** One group block in the `all` shape: the heading, then each field's line with its summary under it, indented. */
const block = (view: CfgView, g: string): string[] => {
  const of = view.fields.filter(f => groupOf(f) === g)
  return of.length === 0 ? [] : [[g, ...of.flatMap(f => [fieldLine(view, f), ...(CONFIG_TABLE[f] ? [`  ${CONFIG_TABLE[f].summary}`] : [])])].join('\n')]
}

/** `/delegation config all`: every field, grouped, each with its summary. */
export const configAll = (view: CfgView): string => [...ALL_GROUPS.flatMap(g => block(view, g)), HOW].join('\n\n')

/** `/delegation config <group>`: that group in the `all` shape. */
export const configGroup = (view: CfgView, g: string): string => [...block(view, g), HOW].join('\n\n')

const kindWord = (field: string, view: CfgView): string => {
  const r = CONFIG_TABLE[field]?.render
  if (!r) return view.rows[field]?.kind ?? view.specs?.[field]?.kind ?? 'text'
  return r === 'bool' ? 'boolean' : r === 'choice' ? 'choice' : ['count', 'minutes', 'hours', 'dollars', 'tokens'].includes(r) ? 'number' : 'text'
}

/** `/delegation config <field>`: the whole value and its source, the summary, the kind and choices, what is in effect, the scope, the description, how to set it. */
export function configShow(view: CfgView, field: string): string {
  const v = view.values[field]
  const e = CONFIG_TABLE[field]
  const effect = inEffect(field, view.values, view.derived)
  const gates = e?.render === 'gates' ? entries(v).map(([k, x]) => `  ${k}: ${String(x)}`) : []
  const choices = e?.choices ?? view.rows[field]?.options ?? view.specs?.[field]?.options
  const description = view.rows[field]?.description ?? view.specs?.[field]?.description
  return [
    `${field} = ${shownValue(field, v)} (${view.sources[field] ?? 'default'})`,
    ...gates,
    ...(e ? [`  ${e.summary}`] : []),
    `kind: ${kindWord(field, view)}`,
    ...(choices && choices.length > 0 ? [`choices: ${choices.join(', ')}`] : []),
    ...(effect !== undefined ? [`in effect: ${effect}`] : []),
    e?.scope === 'repo' ? `scope: repo (set with /delegation config repo ${field} <value>; also from your options)` : 'scope: user',
    ...(description ? [description] : []),
    `set it: /delegation config ${field} <value> · back to the default: /delegation config ${field} default`,
  ].join('\n')
}

// ---- names -----------------------------------------------------------------------------

/** Damerau-Levenshtein distance (optimal string alignment). */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)))
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      const row = d[i] as number[]
      const up = d[i - 1] as number[]
      row[j] = Math.min((up[j] as number) + 1, (row[j - 1] as number) + 1, (up[j - 1] as number) + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) row[j] = Math.min(row[j] as number, ((d[i - 2] as number[])[j - 2] as number) + 1)
    }
  return (d[a.length] as number[])[b.length] as number
}

const prefixLen = (a: string, b: string): number => {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  return i
}

/** The field a typed name means, in any case. */
export const findField = (typed: string, fields: readonly string[]): string | undefined => fields.find(f => f === typed) ?? fields.find(f => f.toLowerCase() === typed.toLowerCase())

/** The answer to a name no field has: the nearest field (Damerau-Levenshtein 3 or less, or a shared prefix of 4 or more letters, any case), else where the list is. */
export function unknownName(typed: string, fields: readonly string[]): string {
  const t = typed.toLowerCase()
  const near = fields
    .map((f, i) => ({ f, i, d: editDistance(t, f.toLowerCase()), p: prefixLen(t, f.toLowerCase()) }))
    .filter(x => x.d <= 3 || x.p >= 4)
    .sort((a, b) => a.d - b.d || b.p - a.p || a.i - b.i)[0]
  return near ? `no option "${typed}"; did you mean ${near.f}?` : `no option "${typed}"; /delegation config all lists them`
}

// ---- values ------------------------------------------------------------------------------

const TRUE = ['true', 'on', 'yes']
const FALSE = ['false', 'off', 'no']
const POINT = 'see /delegation config'

/** A typed value parsed by a /config row's kind: the value, or why it is not one. */
export function parseTyped(f: string, kind: CfgRow['kind'], options: readonly string[] | undefined, typed: string): { value: boolean | number | string } | { error: string } {
  const t = typed.trim()
  if (kind === 'boolean') {
    const w = t.toLowerCase()
    if (TRUE.includes(w)) return { value: true }
    if (FALSE.includes(w)) return { value: false }
    return { error: `${f} takes on or off (or true, false, yes, no), not ${JSON.stringify(t)}; ${POINT} ${f}` }
  }
  if (kind === 'number') {
    const n = t === '' ? Number.NaN : Number(t)
    return Number.isFinite(n) ? { value: n } : { error: `${f} takes a number, not ${JSON.stringify(t)}; ${POINT} ${f}` }
  }
  if (kind === 'choice') {
    const opts = options ?? []
    const hit = opts.find(o => o.toLowerCase() === t.toLowerCase())
    return hit !== undefined ? { value: hit } : { error: `${f} takes one of ${opts.join(', ')}, not ${JSON.stringify(t)}; ${POINT} ${f}` }
  }
  return { value: typed === '""' ? '' : typed }
}

/** A number as a person types it for the field's kind: `20`, `20 min`, `6h`, `$10`, `no cap`, `200K`. */
function numberOf(render: Render, typed: string): number {
  let t = typed.trim().toLowerCase().replace(/[_,]/g, '')
  if (render === 'dollars' && (t === 'no cap' || t === 'none')) return 0
  if (render === 'dollars') t = t.replace(/^\$/, '').replace(/\s*usd$/, '')
  if (render === 'minutes') t = t.replace(/\s*(min|mins|minutes|m)$/, '')
  if (render === 'hours') t = t.replace(/\s*(h|hr|hrs|hours)$/, '')
  let scale = 1
  if (render === 'tokens') {
    const m = /^(.*?)\s*([km])$/.exec(t)
    if (m) {
      t = m[1] as string
      scale = m[2] === 'k' ? 1000 : 1_000_000
    }
  }
  return t === '' ? Number.NaN : Number(t) * scale
}

/** A map typed as JSON, or as `key=value, key→value` pairs (gate commands separated by `;`). */
function mapOf(render: Render, typed: string): Record<string, unknown> | string {
  const t = typed.trim()
  if (t === '""' || t === '' || t === '{}') return {}
  if (t.startsWith('{')) {
    try {
      const o = JSON.parse(t) as unknown
      if (o !== null && typeof o === 'object' && !Array.isArray(o)) return o as Record<string, unknown>
    } catch {
      // falls to the message below
    }
    return 'takes a JSON object, such as {"economy":"haiku"}, or key=value pairs'
  }
  const out: Record<string, unknown> = {}
  for (const pair of t.split(render === 'gates' ? ';' : ',')) {
    const m = /^\s*([^=→:]+?)\s*(?:=|→|:)\s*(.*?)\s*$/.exec(pair)
    if (!m || (m[1] as string) === '') return `takes key=value pairs${render === 'gates' ? ' separated by ;' : ''}, or a JSON object`
    const k = m[1] as string
    const x = m[2] as string
    if (render === 'dollarMap') {
      const n = numberOf('dollars', x)
      if (!Number.isFinite(n)) return `${k} takes dollars, not ${JSON.stringify(x)}`
      out[k] = n
    } else if (render === 'effortMap') out[k] = x === '0' || x.toLowerCase() === 'default' ? 0 : x
    else out[k] = x
  }
  return out
}

/** A typed value for a field: what the user options file (or, `forRepoFile`, the repo file) stores, what a /config row takes, or why it is not one. */
export function valueFor(field: string, typed: string, forRepoFile = false): { value: unknown; host: boolean | number | string } | { error: string } {
  const e = CONFIG_TABLE[field]
  if (!e) return { error: `no option "${field}"` }
  const r = e.render
  let value: unknown
  if (r === 'bool') {
    const p = parseTyped(field, 'boolean', undefined, typed)
    if ('error' in p) return p
    value = p.value
  } else if (r === 'choice') {
    const p = parseTyped(field, 'choice', e.choices, typed)
    if ('error' in p) return p
    value = p.value
  } else if (['count', 'minutes', 'hours', 'dollars', 'tokens'].includes(r)) {
    const n = numberOf(r, typed)
    if (!Number.isFinite(n)) return { error: `${field} takes a number${r === 'minutes' ? ' of minutes' : r === 'hours' ? ' of hours' : r === 'dollars' ? ' of dollars (0 = no cap)' : r === 'tokens' ? ' of tokens (200K, 1M)' : ''}, not ${JSON.stringify(typed.trim())}; ${POINT} ${field}` }
    value = n
  } else if (r === 'map' || r === 'dollarMap' || r === 'effortMap' || r === 'gates') {
    const m = mapOf(r, typed)
    if (typeof m === 'string') return { error: `${field} ${m}; ${POINT} ${field}` }
    value = m
  } else if (r === 'list') {
    const l = typed.trim() === '""' ? [] : items(typed)
    value = forRepoFile ? l : l.join(', ')
  } else value = typed.trim() === '""' ? '' : typed.trim()
  // the same checks the mod reads the value with
  if (e.scope === 'repo') {
    const errs = parseRepoConfig(JSON.stringify({ [field]: value })).errors
    if (errs.length > 0) return { error: `${(errs[0] ?? '').replace(/ \(ignored\)$/, '')}; nothing set` }
  } else if (!validUser(field, value)) return { error: `${field} does not take ${JSON.stringify(typed.trim())}; ${POINT} ${field}` }
  const host = typeof value === 'object' && value !== null ? (Array.isArray(value) ? value.join(', ') : JSON.stringify(value)) : (value as boolean | number | string)
  return { value, host }
}

// ---- the plan ------------------------------------------------------------------------------

/** What `/delegation config <rest>` does: answer in text, or change one value (the caller makes the $ calls and answers with the field's line). */
export type ConfigPlan =
  | { text: string }
  /** Set in a /config row (`key`) when the host lists one, else in the user options file. */
  | { set: { field: string; value: unknown; host: boolean | number | string; key?: string } }
  /** Back to the default: removed from the user options file, and a /config row (`key`) set to the manifest default. */
  | { unset: { field: string; key?: string; def?: unknown } }
  /** Written to (or, with `value` undefined, removed from) the repo file. */
  | { repo: { field: string; value: unknown } }

export function configPlan(view: CfgView, rest: string): ConfigPlan {
  const t = rest.trim()
  if (t === '') return { text: configShort(view) }
  const m = /^(\S+)(?:\s+([\s\S]*))?$/.exec(t)
  const word = m?.[1] ?? t
  const typed = (m?.[2] ?? '').trim()
  const w = word.toLowerCase()
  if (w === 'all') return { text: typed === '' ? configAll(view) : 'usage: /delegation config all' }
  if (GROUP_WORDS.includes(w)) {
    const g = CONFIG_GROUPS.find(x => groupWord(x) === w) as string
    return { text: typed === '' ? configGroup(view, g) : `${w} is a group of options (${g}); /delegation config ${w} lists it` }
  }
  if (w === 'default') return { text: 'usage: /delegation config <field> default' }
  if (w === 'repo') {
    const rm = /^(\S+)(?:\s+([\s\S]*))?$/.exec(typed)
    if (!rm) return { text: 'usage: /delegation config repo <field> <value>' }
    const field = findField(rm[1] as string, view.fields)
    if (!field) return { text: unknownName(rm[1] as string, view.fields) }
    if (CONFIG_TABLE[field]?.scope !== 'repo') return { text: `${field} is personal: the repo file does not take it; set it with /delegation config ${field} <value>` }
    const value = (rm[2] ?? '').trim()
    if (value === '') return { text: `usage: /delegation config repo ${field} <value>` }
    if (value.toLowerCase() === 'default') return { repo: { field, value: undefined } }
    const v = valueFor(field, value, true)
    return 'error' in v ? { text: v.error } : { repo: { field, value: v.value } }
  }
  const field = findField(word, view.fields)
  if (!field || RESERVED.includes(field)) return { text: unknownName(word, view.fields) }
  if (typed === '') return { text: configShow(view, field) }
  const row = view.rows[field]
  if (row?.isLocked || view.sources[field] === 'locked') return { text: `${field} is locked by policy` }
  if (typed.toLowerCase() === 'default') return { unset: { field, ...(row ? { key: row.key, def: CONFIG_TABLE[field]?.def ?? view.specs?.[field]?.default } : {}) } }
  if (!CONFIG_TABLE[field]) {
    // a manifest field the table lacks: by the manifest's kind
    const spec = view.specs?.[field]
    const p = parseTyped(field, row?.kind ?? spec?.kind ?? 'text', row?.options ?? spec?.options, typed)
    if ('error' in p) return { text: p.error }
    return { set: { field, value: p.value, host: p.value, ...(row ? { key: row.key } : {}) } }
  }
  const v = valueFor(field, typed)
  if ('error' in v) return { text: v.error }
  return { set: { field, value: v.value, host: v.host, ...(row ? { key: row.key } : {}) } }
}

/** The answer once a value is changed: its line, as the list shows it. */
export const fieldAnswer = (field: string, value: unknown, source: Source): string => `${field} = ${shownValue(field, value)} (${source})`

/** The fields the command knows: the table's, then any the manifest adds. */
export const viewFields = (specs: Readonly<Record<string, FieldSpec>> | undefined): string[] => [...TABLE_FIELDS, ...Object.keys(specs ?? {}).filter(f => !CONFIG_TABLE[f])]
