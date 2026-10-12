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

/** The groups of `/delegation config`, in the order they print; fields the table lacks print last under {@link OTHER_GROUP}. */
export const CONFIG_GROUPS = ['Workers and models', 'Checking the work', 'Where things go', 'Debriefs', 'Evals', 'Guards and nudges for the brain', 'Display'] as const
export const OTHER_GROUP = 'Other'

/** MOD-70: every manifest userConfig field, its group and a one-line plain-English summary (at most 90 characters; a test holds both ways). */
const ROWS_: readonly (readonly [string, (typeof CONFIG_GROUPS)[number], string])[] = [
  ['tierMap', 'Workers and models', 'Which model each level of worker runs on: economy, standard or frontier'],
  ['spendByTier', 'Workers and models', 'The most dollars one worker attempt may spend, for each level'],
  ['effortByTier', 'Workers and models', 'How hard a worker thinks at each level, from low to max'],
  ['defaultBudget', 'Workers and models', 'How many tries a task gets when its instructions do not say'],
  ['maxWorkers', 'Workers and models', 'How many workers may run at the same time; more wait in line'],
  ['agentTypes', 'Workers and models', 'Which kind of helper agent handles each kind of task'],
  ['domains', 'Workers and models', 'The kinds of task you can hand to a worker'],
  ['autoEscalate', 'Workers and models', 'After a failed try, send the worker back in once without asking you'],
  ['probeModels', 'Workers and models', 'Once a day, check whether new models you listed are available'],
  ['candidateIds', 'Workers and models', 'The model ids to check for, separated by commas'],
  ['gateMap', 'Checking the work', 'The commands that re-run the checks a task names, so results can be trusted'],
  ['applyAmends', 'Checking the work', 'Let a worker widen the files it may touch on its own; narrowing still asks you'],
  ['review', 'Checking the work', 'Have a second, read-only agent check what a worker says it did'],
  ['reviewTier', 'Checking the work', 'How capable the second checker is; empty means one level below the worker'],
  ['verdictVerbosity', 'Checking the work', 'How much detail shows when a worker\'s result is judged'],
  ['ledgerFile', 'Checking the work', 'Keep a log of every judged attempt inside the repo'],
  ['baseRef', 'Checking the work', 'The branch or commit that a worker\'s changes are compared against'],
  ['ignore', 'Checking the work', 'Files and folders left out when counting what a worker changed'],
  ['briefDir', 'Where things go', 'The folder where worker instructions are saved'],
  ['briefTemplate', 'Where things go', 'A file to use as the layout for worker instructions'],
  ['briefExtra', 'Where things go', 'Extra lines added to every worker\'s instructions, such as a test command'],
  ['worktreeRoot', 'Where things go', 'The folder where each worker\'s separate copy of the repo is made'],
  ['cardDir', 'Where things go', 'The folder, inside the repo, that holds your task cards'],
  ['autoDebrief', 'Debriefs', 'When you stop for a while, write a short write-up of what went wrong or right'],
  ['debriefIdleMinutes', 'Debriefs', 'Minutes of quiet before the mod checks whether a write-up is due'],
  ['debriefMinNewLines', 'Debriefs', 'How much new session activity must pile up before a write-up is worth it'],
  ['debriefMinEvents', 'Debriefs', 'How many corrections, refusals or failures must pile up before a write-up'],
  ['debriefCooldownHours', 'Debriefs', 'The least number of hours between two automatic write-ups'],
  ['debriefAgent', 'Debriefs', 'The kind of helper agent that writes the write-up'],
  ['redact', 'Debriefs', 'Words, such as company or product names, hidden in anything posted publicly'],
  ['postFindings', 'Debriefs', 'Whether findings are posted to the issue tracker: ask first, or post on their own'],
  ['autoEval', 'Evals', 'When new work lands on main and you are idle, run your test command once'],
  ['evalIdleMinutes', 'Evals', 'Minutes of quiet before the mod looks for new work on main'],
  ['evalCommand', 'Evals', 'The command a helper agent runs to test new work on main'],
  ['evalLive', 'Evals', 'After a clean first check, also run the costlier real-world test once a session'],
  ['evalLiveCommand', 'Evals', 'The command a helper agent runs for the real-world test'],
  ['evalLiveMaxUsd', 'Evals', 'The most dollars one real-world test run may spend'],
  ['sessionUsdCap', 'Evals', 'No real-world test starts if it would push the session past this many dollars'],
  ['evalAgent', 'Evals', 'The kind of helper agent that runs the tests'],
  ['gitGuard', 'Guards and nudges for the brain', 'Block commits and pushes on protected branches, so you branch first'],
  ['guardBranches', 'Guards and nudges for the brain', 'The protected branches, separated by commas'],
  ['delegateOnly', 'Guards and nudges for the brain', 'Stop the main assistant doing a worker\'s job: off, warn, or refuse'],
  ['driveWarn', 'Guards and nudges for the brain', 'Warn when the main assistant repeats or polls the same thing in a big session'],
  ['driveWarnTokens', 'Guards and nudges for the brain', 'How big the session must be, in tokens, before that warning shows'],
  ['freshSessionTokens', 'Guards and nudges for the brain', 'Suggest a fresh session once this many tokens are in use; 0 turns it off'],
  ['wakeOnVerdict', 'Guards and nudges for the brain', 'Start a new turn on its own when a worker\'s result has been judged'],
  ['readyFallbackMinutes', 'Guards and nudges for the brain', 'Minutes before a waiting task is started for you if you have not started it'],
  ['classifierSecondOpinion', 'Guards and nudges for the brain', 'In a dry run, also ask a classifier how hard a task is and show both answers'],
  ['dashboardBand', 'Display', 'Show a status strip above the prompt while workers are busy or waiting'],
]

/** Field to its group and summary. */
export const CONFIG_TABLE: Readonly<Record<string, { group: (typeof CONFIG_GROUPS)[number]; summary: string }>> = Object.fromEntries(ROWS_.map(([f, group, summary]) => [f, { group, summary }]))

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

/** `/delegation config`: the options of this mod in named groups (a heading, then each `field = value` with its summary on the next line, indented two spaces), then how to show or set one; and, when the host gave no row for this mod, a line that says so. */
export function configList(rows: readonly CfgRow[], defaults: CfgDefaults, ctx: CfgCtx = {}): string {
  const fields = Object.keys(fieldsOf(rows, defaults, ctx))
  const block = (name: string, of: readonly string[]): string[] => (of.length === 0 ? [] : [[name, ...of.flatMap(f => [line(known(rows, defaults, ctx, f) as Known), ...(CONFIG_TABLE[f] ? [`  ${CONFIG_TABLE[f].summary}`] : [])])].join('\n')])
  const groups = [...CONFIG_GROUPS.flatMap(g => block(g, ROWS_.filter(r => r[1] === g && fields.includes(r[0])).map(r => r[0]))), ...block(OTHER_GROUP, fields.filter(f => !CONFIG_TABLE[f]))]
  const none = mine(rows, ctx).length === 0
  return [...groups, [HOW, ...(none ? [`the host lists no rows for ${pluginOf(ctx)} (${rows.length} row${rows.length === 1 ? '' : 's'} listed, none its own), so these are the mod's own values; a set may be refused on this screen, and the /config menu in a terminal sets the same options`] : [])].join('\n')].join('\n\n')
}

const unknownField = (field: string, ctx: CfgCtx): string => `no option "${field}" in ${pluginOf(ctx)}; ${POINT}`

/** `/delegation config <field>`: the value, the kind, the choices and the description. */
export function configShow(rows: readonly CfgRow[], defaults: CfgDefaults, field: string, ctx: CfgCtx = {}): string {
  const k = known(rows, defaults, ctx, field)
  if (!k) return unknownField(field, ctx)
  const description = k.row?.description ?? k.spec.description
  return [
    line(k),
    ...(CONFIG_TABLE[field] ? [`  ${CONFIG_TABLE[field].summary}`] : []),
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
