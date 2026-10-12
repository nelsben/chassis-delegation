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

/** What the command knows besides the host's rows: this mod's name, the manifest fields, the options it was activated with. */
export type CfgCtx = { plugin?: string; fields?: Readonly<Record<string, FieldSpec>>; live?: Readonly<Record<string, unknown>> }

const pluginOf = (ctx: CfgCtx): string => ctx.plugin ?? CONFIG_PREFIX.slice(0, -1)
const rowPlugin = (r: CfgRow): string | undefined => (r as { provider?: { plugin?: string } }).provider?.plugin
/** A host row is this mod's when its provider.plugin is the plugin's name or its key starts with `<name>.`. */
const mine = (rows: readonly CfgRow[], ctx: CfgCtx): CfgRow[] => rows.filter(r => rowPlugin(r) === pluginOf(ctx) || r.key.startsWith(`${pluginOf(ctx)}.`))
/** The names a row can answer to: its key after the prefix, its label, the last part of its key. */
const namesOf = (r: CfgRow, ctx: CfgCtx): string[] => {
  const label = (r as { label?: string }).label
  const pre = `${pluginOf(ctx)}.`
  return [r.key.startsWith(pre) ? r.key.slice(pre.length) : undefined, label, r.key.slice(r.key.lastIndexOf('.') + 1)].filter((x): x is string => !!x)
}
const fieldOf = (r: CfgRow, ctx: CfgCtx): string => namesOf(r, ctx)[0] ?? r.key
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

/** Every field the command knows: the manifest's (or the defaults' when given no fields), then this mod's rows with other names. */
function fieldsOf(rows: readonly CfgRow[], defaults: CfgDefaults, ctx: CfgCtx): Record<string, FieldSpec> {
  const out: Record<string, FieldSpec> = {}
  if (ctx.fields) Object.assign(out, ctx.fields)
  else for (const [k, d] of Object.entries(defaults)) out[k] = { kind: typeof d === 'boolean' ? 'boolean' : typeof d === 'number' ? 'number' : 'text', hasDefault: true, default: d }
  for (const r of mine(rows, ctx)) {
    const names = namesOf(r, ctx)
    if (!names.some(n => n in out)) out[names[0] ?? r.key] = { kind: r.kind, ...(r.options ? { options: r.options } : {}), hasDefault: false }
  }
  return out
}

type Known = { field: string; row?: CfgRow; spec: FieldSpec; kind: CfgRow['kind']; options?: readonly string[]; value: unknown; isDefault: boolean; locked: boolean; key: string }

function known(rows: readonly CfgRow[], defaults: CfgDefaults, ctx: CfgCtx, field: string): Known | undefined {
  const spec = fieldsOf(rows, defaults, ctx)[field]
  if (!spec) return undefined
  const row = mine(rows, ctx).find(r => namesOf(r, ctx).includes(field))
  const def = spec.hasDefault ? spec.default : field in defaults ? defaults[field] : undefined
  const hasDef = spec.hasDefault || field in defaults
  const value = row ? row.value : ctx.live && field in ctx.live ? ctx.live[field] : def
  const options = row?.options ?? spec.options
  return { field, ...(row ? { row } : {}), spec, kind: row?.kind ?? spec.kind, ...(options ? { options } : {}), value, isDefault: hasDef && same(value, def), locked: row?.isLocked ?? false, key: row ? row.key : `${pluginOf(ctx)}.${field}` }
}

/** A value as a line shows it: an empty string is `""`, a list is comma-joined. */
export function shown(v: unknown): string {
  if (Array.isArray(v)) return v.join(', ')
  return v === '' ? '""' : String(v)
}

const HOW = '/delegation config <field> shows one; /delegation config <field> <value> sets it'
const POINT = 'see /delegation config'
const line = (k: Known): string => `${k.field} = ${shown(k.value)}${k.isDefault ? ' (default)' : ''}${k.locked ? ' (locked)' : ''}`

/** `/delegation config`: one line per option of this mod, then how to show or set one; and, when the host gave no row for this mod, a line that says so. */
export function configList(rows: readonly CfgRow[], defaults: CfgDefaults, ctx: CfgCtx = {}): string {
  const lines = Object.keys(fieldsOf(rows, defaults, ctx)).map(f => line(known(rows, defaults, ctx, f) as Known))
  const none = mine(rows, ctx).length === 0
  return [...lines, HOW, ...(none ? [`the host lists no rows for ${pluginOf(ctx)} (${rows.length} row${rows.length === 1 ? '' : 's'} listed, none its own), so these are the mod's own values; a set may be refused on this screen, and the /config menu in a terminal sets the same options`] : [])].join('\n')
}

const unknownField = (field: string, ctx: CfgCtx): string => `no option "${field}" in ${pluginOf(ctx)}; ${POINT}`

/** `/delegation config <field>`: the value, the kind, the choices and the description. */
export function configShow(rows: readonly CfgRow[], defaults: CfgDefaults, field: string, ctx: CfgCtx = {}): string {
  const k = known(rows, defaults, ctx, field)
  if (!k) return unknownField(field, ctx)
  const description = k.row?.description ?? k.spec.description
  return [
    line(k),
    `kind: ${k.kind}`,
    ...(k.kind === 'choice' && k.options ? [`choices: ${k.options.join(', ')}`] : []),
    ...(description ? [description] : []),
    `set it: /delegation config ${field} <value>`,
  ].join('\n')
}

const TRUE = ['true', 'on', 'yes']
const FALSE = ['false', 'off', 'no']

/** A typed value parsed by the kind: the value, or why it is not one. */
export function parseTyped(f: string, kind: CfgRow['kind'], options: readonly string[] | undefined, typed: string): { value: boolean | number | string } | { error: string } {
  const t = typed.trim()
  if (kind === 'boolean') {
    const w = t.toLowerCase()
    if (TRUE.includes(w)) return { value: true }
    if (FALSE.includes(w)) return { value: false }
    return { error: `${f} takes true or false (or on, off, yes, no), not ${JSON.stringify(t)}; ${POINT}` }
  }
  if (kind === 'number') {
    const n = t === '' ? Number.NaN : Number(t)
    return Number.isFinite(n) ? { value: n } : { error: `${f} takes a number, not ${JSON.stringify(t)}; ${POINT}` }
  }
  if (kind === 'choice') {
    const opts = options ?? []
    return opts.includes(t) ? { value: t } : { error: `${f} takes one of ${opts.join(', ')}, not ${JSON.stringify(t)}; ${POINT}` }
  }
  return { value: typed === '""' ? '' : typed }
}

/** What `/delegation config <rest>` does: answer in text, or set one row (the caller makes the $ call). */
export type ConfigPlan = { text: string } | { set: { key: string; field: string; value: boolean | number | string } }

export function configPlan(rows: readonly CfgRow[], defaults: CfgDefaults, rest: string, ctx: CfgCtx = {}): ConfigPlan {
  const t = rest.trim()
  if (t === '') return { text: configList(rows, defaults, ctx) }
  const m = /^(\S+)(?:\s+([\s\S]*))?$/.exec(t)
  const field = m?.[1] ?? t
  const typed = m?.[2]
  if (typed === undefined || typed.trim() === '') return { text: configShow(rows, defaults, field, ctx) }
  const k = known(rows, defaults, ctx, field)
  if (!k) return { text: unknownField(field, ctx) }
  const parsed = parseTyped(field, k.kind, k.options, typed)
  if ('error' in parsed) return { text: parsed.error }
  return { set: { key: k.key, field, value: parsed.value } }
}

/** The answer once `$.config.set` has answered: set, or why it was not (the host's reason as given). */
export const setAnswer = (field: string, value: unknown, deny?: string): string => (deny !== undefined ? `${field} was not set: ${deny}` : `${field} set to ${shown(value)}; the mod reloads with it`)
