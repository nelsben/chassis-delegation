import { test, expect, describe } from 'claude-code/testing'
import { world, sessionStart, HOME } from './harness'
import { REDACT_EMPTY } from '../hooks/lib/findings'
import { configPlan, cut, editDistance, inEffect, manifestDefaults, rowsByField, shownValue, unknownName, configShow, configShort, HOW, type CfgRow, type CfgView } from '../hooks/lib/configcmd'
import { CONFIG_TABLE, RESERVED, TABLE_FIELDS } from '../hooks/lib/configtable'
import { resolveOptions } from '../hooks/lib/configeff'

// MOD-66: /delegation config lists, shows and sets this mod's own options.
const K = 'chassis-delegation.'
type Row = { key: string; label: string; description?: string; kind: 'boolean' | 'number' | 'text' | 'choice'; value: boolean | number | string; options?: string[]; isLocked: boolean }
const ROW = (field: string, kind: Row['kind'], value: Row['value'], extra: Partial<Row> = {}): Row => ({ key: `${K}${field}`, label: field, description: `the ${field} option`, kind, value, isLocked: false, ...extra })
const ROWS: Row[] = [
  ROW('wakeOnVerdict', 'boolean', false, { description: 'wake the brain on a verdict' }),
  ROW('maxWorkers', 'number', 3),
  ROW('redact', 'text', ''),
  ROW('verdictVerbosity', 'choice', 'line', { options: ['line', 'full', 'silent'] }),
  ROW('briefDir', 'text', '/x/briefs'),
  ROW('autoEscalate', 'boolean', false, { isLocked: true }),
  ROW('theme', 'choice', 'dark', { key: 'theme', options: ['dark', 'light'] }),
]
const MANIFEST = JSON.stringify({
  userConfig: {
    wakeOnVerdict: { type: 'boolean', default: false },
    maxWorkers: { type: 'number', default: 3 },
    redact: { type: 'string', default: '' },
    verdictVerbosity: { type: 'string', options: ['line', 'full', 'silent'], default: 'line' },
    briefDir: { type: 'string', default: '' },
    autoEscalate: { type: 'boolean', default: false },
    driveWarn: { type: 'boolean', default: true },
  },
})
const USER_FILE = `${HOME}/.claude/chassis-delegation/options.json`
const cmd = (args: string) => ({ command: 'delegation', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }) as never

/** An inline plugin: `$.config.list()` answers the rows as they stand, `config.set` records and applies each set (or denies it). */
function setup(on: unknown, deny?: string, from: Record<string, unknown>[] = ROWS, throws?: string) {
  const w = world(on as never, { manifest: MANIFEST })
  const rows = from.map(r => ({ ...r })) as Row[]
  const sets: { key: string; value: unknown }[] = []
  const hook = on as unknown as (n: string, h: unknown) => void
  hook('config.list', () => ({ value: rows.map(r => ({ ...r })) }))
  if (!throws) hook('config.set', (_$: unknown, e: { key: string; value: unknown }) => {
    if (deny) return { deny }
    sets.push({ key: e.key, value: e.value })
    const r = rows.find(x => x.key === e.key)
    if (r) r.value = e.value as never
    return { value: e.value }
  })
  return { w, rows, sets }
}

describe('MOD-66: /delegation config', () => {
  test('a boolean is set with on/off/true', async ($, on) => {
    const { sets } = setup(on)
    await $.session.start(sessionStart)
    const out = await $.command.run(cmd('config wakeOnVerdict true'))
    expect(out.text).toBe('wakeOnVerdict = on (host)')
    expect(sets).toEqual([{ key: 'chassis-delegation.wakeOnVerdict', value: true }])
  })

  test('the list (all): this mod only, one line each, the source of each, the last line', async ($, on) => {
    setup(on)
    await $.session.start(sessionStart)
    const lines = String((await $.command.run(cmd('config all'))).text).split('\n')
    expect(lines).toContain('wakeOnVerdict = off (default)')
    expect(lines).toContain('maxWorkers = 3 (host)')
    expect(lines).toContain('verdictVerbosity = line (default)')
    expect(lines).toContain('briefDir = /x/briefs (host)')
    expect(lines).toContain('autoEscalate = off (locked)')
    expect(lines.join('\n')).not.toContain('theme')
    expect(lines[lines.length - 1]).toBe(HOW)
  })

  test('showing one row: value, kind, choices, description', async ($, on) => {
    setup(on)
    await $.session.start(sessionStart)
    const t = String((await $.command.run(cmd('config verdictVerbosity'))).text)
    expect(t).toContain('verdictVerbosity = line (default)')
    expect(t).toContain('kind: choice')
    expect(t).toContain('choices: line, full, silent')
    expect(t).toContain('the verdictVerbosity option')
  })

  test('a number and a text row are set; text takes the rest of the line, "" is empty', async ($, on) => {
    const { sets, rows } = setup(on)
    await $.session.start(sessionStart)
    expect((await $.command.run(cmd('config maxWorkers 5'))).text).toBe('maxWorkers = 5 (host)')
    expect((await $.command.run(cmd('config redact acme, big corp'))).text).toBe('redact = acme, big corp (host)')
    await $.command.run(cmd('config redact ""'))
    expect(sets).toEqual([
      { key: 'chassis-delegation.maxWorkers', value: 5 },
      { key: 'chassis-delegation.redact', value: 'acme, big corp' },
      { key: 'chassis-delegation.redact', value: '' },
    ])
    expect(rows.find(r => r.label === 'maxWorkers')?.value).toBe(5)
    expect(String((await $.command.run(cmd('config'))).text)).toContain('\n maxWorkers = 5 (host)\n')
  })

  test('a deny is passed through, and a bad boolean, number, choice or unknown field set nothing', async ($, on) => {
    const { sets } = setup(on)
    await $.session.start(sessionStart)
    const bad = String((await $.command.run(cmd('config wakeOnVerdict maybe'))).text)
    expect(bad).toContain('wakeOnVerdict')
    expect(bad).toContain('/delegation config')
    expect(String((await $.command.run(cmd('config maxWorkers many'))).text)).toContain('/delegation config')
    expect(String((await $.command.run(cmd('config verdictVerbosity loud'))).text)).toContain('line, full, silent')
    const unknown = String((await $.command.run(cmd('config nosuch 1'))).text)
    expect(unknown).toContain('nosuch')
    expect(unknown).toContain('/delegation config')
    expect(String((await $.command.run(cmd('config theme light'))).text)).toContain('no option')
    expect(sets).toEqual([])
  })

  test('a deny reason from $.config.set is the answer; a locked row is refused before the host is asked', async ($, on) => {
    const { sets } = setup(on, 'managed by policy')
    await $.session.start(sessionStart)
    const out = String((await $.command.run(cmd('config wakeOnVerdict true'))).text)
    expect(out).toBe('wakeOnVerdict was not set: managed by policy')
    expect(String((await $.command.run(cmd('config autoEscalate true'))).text)).toBe('autoEscalate is locked by policy')
    expect(sets).toEqual([])
  })

  test('the usage line and REDACT_EMPTY name the command', async ($, on) => {
    setup(on)
    await $.session.start(sessionStart)
    expect(String((await $.command.run(cmd('nonsense'))).text)).toContain('config [<field> [<value>]]')
    expect(REDACT_EMPTY).toContain('/delegation config redact')
    expect(REDACT_EMPTY).not.toContain('/config to')
  })
})

/** A view of every field at the defaults, with these rows as the host's. */
function viewOf(rows: readonly CfgRow[], host: Record<string, unknown> = {}, user: Record<string, unknown> = {}): CfgView {
  const mine = rowsByField(rows, 'chassis-delegation', TABLE_FIELDS)
  const locked = new Set(Object.entries(mine).filter(([, r]) => r.isLocked).map(([f]) => f))
  const r = resolveOptions({ ...host, ...Object.fromEntries(Object.entries(mine).map(([f, x]) => [f, x.value])) }, user, {}, locked)
  return { plugin: 'chassis-delegation', fields: TABLE_FIELDS, values: r.values, sources: r.sources, rows: mine, derived: { issueRepo: 'o/n', cardDir: 'agents/tasks' } }
}

describe('MOD-66: the pure half', () => {
  const rows = ROWS.map(r => ({ ...r })) as CfgRow[]
  const view = viewOf(rows)
  test('the plan parses by kind: boolean words, whole numbers for maxWorkers, choices, text as typed', () => {
    expect(configPlan(view, ' wakeOnVerdict   off ')).toEqual({ set: { key: 'chassis-delegation.wakeOnVerdict', field: 'wakeOnVerdict', value: false, host: false } })
    expect(configPlan(view, 'wakeOnVerdict Yes')).toEqual({ set: { key: 'chassis-delegation.wakeOnVerdict', field: 'wakeOnVerdict', value: true, host: true } })
    expect('text' in configPlan(view, 'maxWorkers Infinity')).toBe(true)
    expect('text' in configPlan(view, 'maxWorkers 2x')).toBe(true)
    // MOD-73: the value is checked as the mod reads it: a whole number of 1 or more
    expect(configPlan(view, 'maxWorkers 2.5')).toEqual({ text: 'maxWorkers: needs a whole number of 1 or more; nothing set' })
    expect(configPlan(view, 'verdictVerbosity full')).toEqual({ set: { key: 'chassis-delegation.verdictVerbosity', field: 'verdictVerbosity', value: 'full', host: 'full' } })
    expect(configPlan(view, 'briefDir  /a b/c')).toEqual({ set: { key: 'chassis-delegation.briefDir', field: 'briefDir', value: '/a b/c', host: '/a b/c' } })
    expect(configPlan(view, 'briefDir ""')).toEqual({ set: { key: 'chassis-delegation.briefDir', field: 'briefDir', value: '', host: '' } })
  })
  test('the manifest default reads as nothing when the manifest does not parse', () => {
    expect(manifestDefaults('not json')).toEqual({})
    expect(manifestDefaults(undefined)).toEqual({})
  })
})

// MOD-68: the list does not depend on the host's rows.
const ENGINE_ONLY = [{ key: 'theme', label: 'theme', kind: 'choice', value: 'dark', options: ['dark', 'light'], isLocked: false, provider: { plugin: 'engine' } }]
describe('MOD-68: /delegation config without host rows', () => {
  test('a host that lists no rows for the mod still gives every field; MOD-73: the no-rows line is gone (no rows is normal)', async ($, on) => {
    setup(on, undefined, ENGINE_ONLY)
    await $.session.start(sessionStart)
    const lines = String((await $.command.run(cmd('config all'))).text).split('\n')
    expect(lines).toContain('wakeOnVerdict = off (default)')
    expect(lines).toContain('driveWarn = on (default)')
    expect(lines).toContain('redact = (none) (default)')
    expect(lines.join('\n')).not.toContain('theme')
    expect(lines[lines.length - 1]).toBe(HOW)
    expect(String((await $.command.run(cmd('config'))).text)).not.toContain('lists no rows')
  })

  test('a row keyed differently but with provider.plugin = chassis-delegation is used, and its key is passed to set', async ($, on) => {
    const row = { key: 'plugins.cd.wakeOnVerdict', label: 'wakeOnVerdict', kind: 'boolean', value: true, isLocked: false, provider: { plugin: 'chassis-delegation' } }
    const { sets } = setup(on, undefined, [row, ...ENGINE_ONLY])
    await $.session.start(sessionStart)
    const t = String((await $.command.run(cmd('config all'))).text)
    expect(t).toContain('wakeOnVerdict = on (host)')
    expect(t).toContain('redact = (none) (default)')
    await $.command.run(cmd('config wakeOnVerdict off'))
    expect(sets).toEqual([{ key: 'plugins.cd.wakeOnVerdict', value: false }])
  })

  test('MOD-73: with no row, set writes the user options file (the host is not asked) and parses by the field kind', async ($, on) => {
    const { sets, w } = setup(on, undefined, ENGINE_ONLY)
    await $.session.start(sessionStart)
    expect((await $.command.run(cmd('config maxWorkers 5'))).text).toBe('maxWorkers = 5 (yours)')
    expect(JSON.parse(w.files.get(USER_FILE) ?? '{}')).toEqual({ maxWorkers: 5 })
    expect(String((await $.command.run(cmd('config maxWorkers many'))).text)).toContain('takes a number')
    expect(String((await $.command.run(cmd('config verdictVerbosity loud'))).text)).toContain('line, full, silent')
    const show = String((await $.command.run(cmd('config verdictVerbosity'))).text)
    expect(show).toContain('kind: choice')
    expect(show).toContain('choices: line, full, silent')
    expect(sets).toEqual([])
  })

  test('MOD-73: a host that cannot set (no config.set at all) is never asked when it lists no row: the value goes to the user options file', async ($, on) => {
    const { w } = setup(on, undefined, ENGINE_ONLY, 'no handler')
    await $.session.start(sessionStart)
    expect(String((await $.command.run(cmd('config wakeOnVerdict true'))).text)).toBe('wakeOnVerdict = on (yours)')
    expect(JSON.parse(w.files.get(USER_FILE) ?? '{}')).toEqual({ wakeOnVerdict: true })
  })

  test('a denied set of a listed row answers "<field> was not set: <the host reason>"; a "no /config row" refusal falls back to the user options file', async ($, on) => {
    const row = { key: 'chassis-delegation.wakeOnVerdict', label: 'wakeOnVerdict', kind: 'boolean', value: false, isLocked: false }
    setup(on, 'managed by policy', [row, ...ENGINE_ONLY])
    await $.session.start(sessionStart)
    expect((await $.command.run(cmd('config wakeOnVerdict true'))).text).toBe('wakeOnVerdict was not set: managed by policy')
  })

  test('MOD-73: a listed row the host refuses as having no /config row: the value goes to the user options file', async ($, on) => {
    const row = { key: 'chassis-delegation.wakeOnVerdict', label: 'wakeOnVerdict', kind: 'boolean', value: false, isLocked: false }
    const { w } = setup(on, 'no /config row for chassis-delegation.wakeOnVerdict', [row, ...ENGINE_ONLY])
    await $.session.start(sessionStart)
    expect((await $.command.run(cmd('config wakeOnVerdict true'))).text).toBe('wakeOnVerdict = on (yours)')
    expect(JSON.parse(w.files.get(USER_FILE) ?? '{}')).toEqual({ wakeOnVerdict: true })
  })
})

// MOD-70: named groups, a summary under each option, Other for a field the table lacks.
describe('MOD-70: /delegation config in groups', () => {
  test('group headings come in order, a field line is followed by its indented summary, a blank line separates groups', async ($, on) => {
    setup(on)
    await $.session.start(sessionStart)
    const text = String((await $.command.run(cmd('config all'))).text)
    const lines = text.split('\n')
    const heads = ['Workers and models', 'Checking the work', 'Where things go', 'Guards and nudges for the brain']
    const at = heads.map(h => lines.indexOf(h))
    expect(at.every(i => i >= 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    const i = lines.indexOf('maxWorkers = 3 (host)')
    expect(i).toBeGreaterThan(at[0] as number)
    expect(lines[i + 1]?.startsWith('  ')).toBe(true)
    expect((lines[i + 1] ?? '').trim().length).toBeGreaterThan(0)
    expect(lines[(at[1] as number) - 1]).toBe('')
    expect(lines[lines.length - 1]).toBe(HOW)
    expect(text).not.toContain('\nOther\n')
  })

  test('a manifest field the table lacks lists under Other, last, with no summary', async ($, on) => {
    const manifest = JSON.stringify({ userConfig: { maxWorkers: { type: 'number', default: 3 }, brandNewThing: { type: 'boolean', default: true } } })
    on('config.list', () => ({ value: [] }))
    const w = world(on as never, { manifest })
    expect(w).toBeDefined()
    await $.session.start(sessionStart)
    const lines = String((await $.command.run(cmd('config all'))).text).split('\n')
    const o = lines.indexOf('Other')
    expect(o).toBeGreaterThan(lines.indexOf('Workers and models'))
    expect(lines[o + 1]).toBe('brandNewThing = on (default)')
    expect(lines[o + 2]).toBe('')
  })

  test('showing one option puts its summary under the value line, before the kind', async ($, on) => {
    setup(on)
    await $.session.start(sessionStart)
    const lines = String((await $.command.run(cmd('config verdictVerbosity'))).text).split('\n')
    expect(lines[0]).toBe('verdictVerbosity = line (default)')
    expect(lines[1]?.startsWith('  ')).toBe(true)
    expect(lines[2]).toBe('kind: choice')
  })
})

// MOD-73: one truth, settable everywhere, short by default, human values.
const REPO_FILE = '/repo/acme-app/.chassis-delegation.json'
const say = async ($: { command: { run: (c: never) => Promise<{ text?: unknown }> } }, args: string): Promise<string> => String((await $.command.run(cmd(`config ${args}`.trim()))).text)
const bare = (on: unknown, files: Record<string, string> = {}) => world(on as never, { manifest: MANIFEST, files })

describe('MOD-73: /delegation config shows what the mod runs with', () => {
  test('MOD-78: modelGlyphs: empty lists the built-in map on its in effect line; off and pairs show none', async ($, on) => {
    bare(on)
    await $.session.start(sessionStart)
    expect(await say($, 'modelGlyphs')).toContain('in effect: haiku=🟢, sonnet=🔵, opus=🟣, fable=🟠, other=⚪')
    await say($, 'modelGlyphs off')
    expect(await say($, 'modelGlyphs')).not.toContain('in effect')
  })

  test('nothing set: the count line, "all 57 at their defaults", the how-to line, nothing else', async ($, on) => {
    bare(on)
    await $.session.start(sessionStart)
    expect((await say($, '')).split('\n')).toEqual(['chassis-delegation: 57 options, 0 set (0 repo, 0 yours, 0 host, 0 locked)', 'all 57 at their defaults', HOW])
  })

  test('the short view lists only what is set, by group, one line each, with the source; any case finds the name', async ($, on) => {
    bare(on, { [REPO_FILE]: JSON.stringify({ gateMap: { node: 'node t.mjs', validate: 'v' }, maxWorkers: 3 }) })
    await $.session.start(sessionStart)
    expect(await say($, 'maxworkers 4')).toBe('maxWorkers = 4 (yours)')
    expect(await say($, 'DEBRIEFIDLEMINUTES 45')).toBe('debriefIdleMinutes = 45 min (yours)')
    expect((await say($, '')).split('\n')).toEqual([
      'chassis-delegation: 57 options, 3 set (1 repo, 2 yours, 0 host, 0 locked)',
      'Workers and models',
      ' maxWorkers = 4 (yours)',
      'Checking the work',
      ' gateMap = node, validate (repo)',
      'Debriefs',
      ' debriefIdleMinutes = 45 min (yours)',
      HOW,
    ])
  })

  test('the all view and a group view: every field with its source, values a person reads, the summary under each', async ($, on) => {
    bare(on, { [REPO_FILE]: JSON.stringify({ maxWorkers: 3, tierMap: { premium: 'opus' } }) })
    await $.session.start(sessionStart)
    const all = (await say($, 'all')).split('\n')
    expect(all).toContain('maxWorkers = 3 (repo)')
    expect(all).toContain('tierMap = economy→haiku, standard→sonnet, frontier→opus, premium→opus (repo)')
    expect(all).toContain('debriefIdleMinutes = 20 min (default)')
    expect(all).toContain('debriefCooldownHours = 6 h (default)')
    expect(all).toContain('evalLiveMaxUsd = $1 (default)')
    expect(all).toContain('driveWarnTokens = 200K (default)')
    expect(all).toContain('guardBranches = main, master (default)')
    expect(all).toContain('redact = (none) (default)')
    expect(all).toContain('debriefAgent = general-purpose (default)')
    expect(all).toContain('dashboardBand = off (default)')
    expect(all.filter(l => l !== HOW).every(l => l.length <= 100)).toBe(true)
    const g = (await say($, 'Debriefs')).split('\n')
    expect(g[0]).toBe('Debriefs')
    expect(g).toContain('debriefCooldownHours = 6 h (default)')
    expect(g).not.toContain('maxWorkers = 3 (repo)')
    expect(g[g.length - 1]).toBe(HOW)
    expect((await say($, 'guards')).split('\n')[0]).toBe('Guards and nudges for the brain')
  })

  test('an unknown name: the nearest field (edit distance 3 or a shared 4-letter prefix), else where the list is', async ($, on) => {
    bare(on)
    await $.session.start(sessionStart)
    expect(await say($, 'maxWorker 3')).toBe('no option "maxWorker"; did you mean maxWorkers?')
    expect(await say($, 'debriefCooldown')).toBe('no option "debriefCooldown"; did you mean debriefCooldownHours?')
    expect(await say($, 'qqqqzzzz')).toBe('no option "qqqqzzzz"; /delegation config all lists them')
  })

  test('the show view: the whole value, gate commands each on a line, in effect, scope, how to set', async ($, on) => {
    bare(on, { [REPO_FILE]: JSON.stringify({ gateMap: { node: 'node --no-warnings t.mjs', validate: 'node --no-warnings b.mjs' }, autoEval: true }) })
    await $.session.start(sessionStart)
    const gm = (await say($, 'gatemap')).split('\n')
    expect(gm[0]).toBe('gateMap = node, validate (repo)')
    expect(gm).toContain('  node: node --no-warnings t.mjs')
    expect(gm).toContain('  validate: node --no-warnings b.mjs')
    expect(gm).toContain('scope: repo (set with /delegation config repo gateMap <value>; also from your options)')
    expect(await say($, 'autoEval')).toContain('in effect: off (no evalCommand)')
    expect(await say($, 'reviewTier')).toContain('unused (review is off)')
    const mw = await say($, 'maxWorkers')
    expect(mw).not.toContain('in effect')
    // MOD-131: the per-tier cap, empty, says it is the total alone
    expect(await say($, 'maxWorkersByTier')).toContain('in effect: none: maxWorkers alone')
    expect(await say($, 'maxWorkersByTier frontier=2, standard=5')).toBe('maxWorkersByTier = frontier 2, standard 5 (yours)')
    expect(await say($, 'maxWorkersByTier')).not.toContain('in effect')
    expect(await say($, 'maxWorkersByTier frontier=x')).toContain('frontier takes a number')
    const wake = (await say($, 'wakeOnVerdict')).split('\n')
    expect(wake).toContain('scope: user')
    expect(wake[wake.length - 1]).toBe('set it: /delegation config wakeOnVerdict <value> · back to the default: /delegation config wakeOnVerdict default')
  })

  test('<field> default removes it from your options; the field is back at the default', async ($, on) => {
    const w = bare(on)
    await $.session.start(sessionStart)
    expect(await say($, 'wakeOnVerdict on')).toBe('wakeOnVerdict = on (yours)')
    expect(await say($, 'redact acme, big corp')).toBe('redact = acme, big corp (yours)')
    expect(JSON.parse(w.files.get(USER_FILE) ?? '{}')).toEqual({ wakeOnVerdict: true, redact: 'acme, big corp' })
    expect(await say($, 'wakeOnVerdict default')).toBe('wakeOnVerdict = off (default)')
    expect(JSON.parse(w.files.get(USER_FILE) ?? '{}')).toEqual({ redact: 'acme, big corp' })
  })

  test('repo <field> <value> writes the repo file, keeping its other keys and _ comments, 2-space JSON; a personal field is refused', async ($, on) => {
    const w = bare(on, { [REPO_FILE]: '{"_comment":"team settings","maxWorkers":3,"domains":["mod"]}\n' })
    await $.session.start(sessionStart)
    expect(await say($, 'repo maxWorkers 5')).toBe('maxWorkers = 5 (repo)')
    expect(w.files.get(REPO_FILE)).toBe('{\n  "_comment": "team settings",\n  "maxWorkers": 5,\n  "domains": [\n    "mod"\n  ]\n}\n')
    expect(await say($, 'repo domains mod, docs')).toBe('domains = mod, docs (repo)')
    expect(JSON.parse(w.files.get(REPO_FILE) ?? '{}').domains).toEqual(['mod', 'docs'])
    const refused = await say($, 'repo wakeOnVerdict on')
    expect(refused).toContain('personal')
    expect(JSON.parse(w.files.get(REPO_FILE) ?? '{}').wakeOnVerdict).toBe(undefined)
    expect(await say($, 'maxWorkers')).toContain('maxWorkers = 5 (repo)')
  })

  test('yours beats repo; a host row beats yours; a host row equal to the default counts as unset', async ($, on) => {
    const { w } = setup(on)
    w.files.set(REPO_FILE, JSON.stringify({ domains: ['mod'] }))
    await $.session.start(sessionStart)
    expect(await say($, 'repo domains app')).toBe('domains = app (repo)')
    expect(await say($, 'maxWorkers')).toContain('maxWorkers = 3 (host)')
    // verdictVerbosity's host row is at its default, so yours wins
    w.files.set(USER_FILE, JSON.stringify({ verdictVerbosity: 'full', briefDir: '/mine', domains: ['web'] }))
    expect(await say($, 'verdictVerbosity')).toContain('verdictVerbosity = full (yours)')
    expect(await say($, 'briefDir')).toContain('briefDir = /x/briefs (host)')
    expect(await say($, 'domains')).toContain('domains = web (yours)')
  })

  test('a locked row refuses a set and a reset', async ($, on) => {
    const { sets } = setup(on)
    await $.session.start(sessionStart)
    expect(await say($, 'autoEscalate on')).toBe('autoEscalate is locked by policy')
    expect(await say($, 'autoescalate default')).toBe('autoEscalate is locked by policy')
    expect(sets).toEqual([])
  })

  test('a malformed user options file is toasted and logged once, and ignored', async ($, on) => {
    const w = bare(on, { [USER_FILE]: '{ maxWorkers: 3' })
    await $.session.start(sessionStart)
    expect(await say($, '')).toContain('0 set')
    await say($, '')
    const toasts = w.toasts.filter(t => JSON.stringify(t).includes('options.json'))
    expect(toasts.length).toBe(1)
    expect(w.debugLogs.some(l => String(l).includes('options.json'))).toBe(true)
  })

  test('the user file is reread when it changes: a hand edit applies at the next hook', async ($, on) => {
    const w = bare(on)
    await $.session.start(sessionStart)
    w.files.set(USER_FILE, JSON.stringify({ maxWorkers: 6 }))
    expect(await say($, '')).toContain(' maxWorkers = 6 (yours)')
  })

  test('/delegation status and /delegation config agree on what is set', async ($, on) => {
    bare(on, { [REPO_FILE]: JSON.stringify({ maxWorkers: 3 }) })
    await $.session.start(sessionStart)
    await say($, 'gitGuard off')
    await say($, 'tierMap economy=sonnet')
    const status = String((await $.command.run(cmd('status'))).text)
    expect(status).toContain('max workers 3')
    expect(status).toContain('git guard off')
    expect(status).toContain('economy→sonnet')
    expect(await say($, 'tierMap')).toContain('tierMap = economy→sonnet, standard→sonnet, frontier→opus, premium→fable (yours)')
  })
})

describe('MOD-73: the pure half', () => {
  test('values as a person reads them, and lines cut at 100 characters with …', () => {
    expect(shownValue('autoEval', true)).toBe('on')
    expect(shownValue('debriefIdleMinutes', 20)).toBe('20 min')
    expect(shownValue('debriefCooldownHours', 6)).toBe('6 h')
    expect(shownValue('sessionUsdCap', 10)).toBe('$10')
    expect(shownValue('sessionUsdCap', 0)).toBe('no cap')
    expect(shownValue('freshSessionTokens', 400000)).toBe('400K')
    expect(shownValue('tierMap', { economy: 'haiku', standard: 'sonnet' })).toBe('economy→haiku, standard→sonnet')
    expect(shownValue('gateMap', '{"validate":"v","node":"n"}')).toBe('validate, node')
    expect(shownValue('domains', ['mod', 'docs'])).toBe('mod, docs')
    expect(shownValue('briefDir', '')).toBe('(none)')
    expect(shownValue('reviewTier', 'sonnet')).toBe('sonnet')
    const long = cut('x'.repeat(150))
    expect(long.length).toBe(100)
    expect(long.endsWith('…')).toBe(true)
  })

  test('names: the reserved words are never fields; the distance counts a swap as one', () => {
    for (const r of RESERVED) expect(TABLE_FIELDS.map(f => f.toLowerCase())).not.toContain(r)
    expect(editDistance('maxwrokers', 'maxworkers')).toBe(1)
    expect(unknownName('gatemaps', TABLE_FIELDS)).toBe('no option "gatemaps"; did you mean gateMap?')
  })

  test('in effect: the derived cases the mod has', () => {
    const v = (o: Record<string, unknown>) => ({ ...Object.fromEntries(Object.entries(CONFIG_TABLE).map(([f, e]) => [f, e.def])), ...o })
    expect(inEffect('maxWorkers', v({ maxWorkers: 0 }))).toBe('2')
    expect(inEffect('reviewTier', v({ review: 'on', reviewTier: '' }))).toBe('one tier below the worker')
    expect(inEffect('autoEval', v({ autoEval: true, evalCommand: '' }))).toBe('off (no evalCommand)')
    expect(inEffect('autoEval', v({ autoEval: true, evalCommand: 'x' }))).toBe(undefined)
    expect(inEffect('probeModels', v({ probeModels: true, candidateIds: '' }))).toBe('off (no candidateIds)')
    expect(inEffect('postFindings', v({}), { issueRepo: '' })).toBe('off (no issue repo)')
    expect(inEffect('ignore', v({ ignore: [] }), { cardDir: 'docs/cards' })).toBe('docs/cards/**')
  })
})

describe('MOD-98: /delegation config shows a refused gate (#160)', () => {
  const view = (refusedGates?: Record<string, string>): CfgView => ({
    plugin: 'chassis-delegation',
    fields: ['gateMap'],
    values: { gateMap: { test: 'npm test' } },
    sources: { gateMap: 'repo' },
    rows: {},
    ...(refusedGates ? { refusedGates } : {}),
  })

  test('the show view lists each refused entry and its reason on one line under gateMap', () => {
    const out = configShow(view({ envgate: 'a gate may not run env' }), 'gateMap').split('\n')
    expect(out).toContain('  envgate: refused: a gate may not run env')
    expect(out.indexOf('  envgate: refused: a gate may not run env')).toBeGreaterThan(out.indexOf('  test: npm test'))
  })

  test('the short view carries it under the gateMap line', () => {
    const out = configShort(view({ envgate: 'a gate may not run env' })).split('\n')
    const at = out.findIndex(l => l.includes('gateMap = test (repo)'))
    expect(out[at + 1]).toBe('  envgate: refused: a gate may not run env')
  })

  test('nothing refused adds no line', () => {
    expect(configShow(view(), 'gateMap')).not.toContain('refused')
  })
})
