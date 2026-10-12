// MOD-66: /delegation config. The pure half: the rows of `$.config.list()` that belong to
// this mod, shown as lines, and a typed value parsed by the row's kind. The $ calls
// (list, set, reading the manifest) are in register.ts.

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

const mine = (rows: readonly CfgRow[]): CfgRow[] => rows.filter(r => r.key.startsWith(CONFIG_PREFIX))
const fieldOf = (r: CfgRow): string => r.key.slice(CONFIG_PREFIX.length)
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

/** A value as a line shows it: an empty string is `""`, a list is comma-joined. */
export function shown(v: unknown): string {
  if (Array.isArray(v)) return v.join(', ')
  return v === '' ? '""' : String(v)
}

const HOW = '/delegation config <field> shows one; /delegation config <field> <value> sets it'
const POINT = 'see /delegation config'

/** `/delegation config`: one line per option of this mod, then how to show or set one. */
export function configList(rows: readonly CfgRow[], defaults: CfgDefaults): string {
  const lines = mine(rows).map(r => {
    const f = fieldOf(r)
    const isDefault = f in defaults && same(r.value, defaults[f])
    return `${f} = ${shown(r.value)}${isDefault ? ' (default)' : ''}${r.isLocked ? ' (locked)' : ''}`
  })
  return [...lines, HOW].join('\n')
}

const find = (rows: readonly CfgRow[], field: string): CfgRow | undefined => mine(rows).find(r => fieldOf(r) === field)
const unknownField = (field: string): string => `no option "${field}" in chassis-delegation; ${POINT}`

/** `/delegation config <field>`: the value, the kind, the choices and the description. */
export function configShow(rows: readonly CfgRow[], defaults: CfgDefaults, field: string): string {
  const r = find(rows, field)
  if (!r) return unknownField(field)
  const isDefault = field in defaults && same(r.value, defaults[field])
  return [
    `${field} = ${shown(r.value)}${isDefault ? ' (default)' : ''}${r.isLocked ? ' (locked)' : ''}`,
    `kind: ${r.kind}`,
    ...(r.kind === 'choice' && r.options ? [`choices: ${r.options.join(', ')}`] : []),
    ...(r.description ? [r.description] : []),
    `set it: /delegation config ${field} <value>`,
  ].join('\n')
}

const TRUE = ['true', 'on', 'yes']
const FALSE = ['false', 'off', 'no']

/** A typed value parsed by the row's kind: the value, or why it is not one. */
export function parseValue(row: CfgRow, typed: string): { value: boolean | number | string } | { error: string } {
  const f = fieldOf(row)
  const t = typed.trim()
  if (row.kind === 'boolean') {
    const w = t.toLowerCase()
    if (TRUE.includes(w)) return { value: true }
    if (FALSE.includes(w)) return { value: false }
    return { error: `${f} takes true or false (or on, off, yes, no), not ${JSON.stringify(t)}; ${POINT}` }
  }
  if (row.kind === 'number') {
    const n = t === '' ? Number.NaN : Number(t)
    return Number.isFinite(n) ? { value: n } : { error: `${f} takes a number, not ${JSON.stringify(t)}; ${POINT}` }
  }
  if (row.kind === 'choice') {
    const opts = row.options ?? []
    return opts.includes(t) ? { value: t } : { error: `${f} takes one of ${opts.join(', ')}, not ${JSON.stringify(t)}; ${POINT}` }
  }
  return { value: typed === '""' ? '' : typed }
}

/** What `/delegation config <rest>` does: answer in text, or set one row (the caller makes the $ call). */
export type ConfigPlan = { text: string } | { set: { key: string; field: string; value: boolean | number | string } }

export function configPlan(rows: readonly CfgRow[], defaults: CfgDefaults, rest: string): ConfigPlan {
  const t = rest.trim()
  if (t === '') return { text: configList(rows, defaults) }
  const m = /^(\S+)(?:\s+([\s\S]*))?$/.exec(t)
  const field = m?.[1] ?? t
  const typed = m?.[2]
  if (typed === undefined || typed.trim() === '') return { text: configShow(rows, defaults, field) }
  const row = find(rows, field)
  if (!row) return { text: unknownField(field) }
  const parsed = parseValue(row, typed)
  if ('error' in parsed) return { text: parsed.error }
  return { set: { key: row.key, field, value: parsed.value } }
}

/** The answer once `$.config.set` has answered: set, or its deny reason. */
export const setAnswer = (field: string, value: unknown, deny?: string): string => (deny !== undefined ? deny : `${field} set to ${shown(value)}; the mod reloads with it`)
