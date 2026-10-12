import { test, expect, describe } from 'claude-code/testing'
import { world, sessionStart } from './harness'
import { REDACT_EMPTY } from '../hooks/lib/findings'
import { configPlan, manifestDefaults, type CfgRow } from '../hooks/lib/configcmd'

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
    expect(out.text).toBe('wakeOnVerdict set to true; the mod reloads with it')
    expect(sets).toEqual([{ key: 'chassis-delegation.wakeOnVerdict', value: true }])
  })

  test('the list: this mod only, one line each, the default and locked marks, the last line', async ($, on) => {
    setup(on)
    await $.session.start(sessionStart)
    const lines = String((await $.command.run(cmd('config'))).text).split('\n')
    expect(lines).toContain('wakeOnVerdict = false (default)')
    expect(lines).toContain('maxWorkers = 3 (default)')
    expect(lines).toContain('verdictVerbosity = line (default)')
    expect(lines).toContain('briefDir = /x/briefs')
    expect(lines).toContain('autoEscalate = false (default) (locked)')
    expect(lines.join('\n')).not.toContain('theme')
    expect(lines[lines.length - 1]).toBe('/delegation config <field> shows one; /delegation config <field> <value> sets it')
  })

  test('showing one row: value, kind, choices, description', async ($, on) => {
    setup(on)
    await $.session.start(sessionStart)
    const t = String((await $.command.run(cmd('config verdictVerbosity'))).text)
    expect(t).toContain('verdictVerbosity = line')
    expect(t).toContain('kind: choice')
    expect(t).toContain('choices: line, full, silent')
    expect(t).toContain('the verdictVerbosity option')
  })

  test('a number and a text row are set; text takes the rest of the line, "" is empty', async ($, on) => {
    const { sets, rows } = setup(on)
    await $.session.start(sessionStart)
    expect((await $.command.run(cmd('config maxWorkers 5'))).text).toBe('maxWorkers set to 5; the mod reloads with it')
    expect((await $.command.run(cmd('config redact acme, big corp'))).text).toBe('redact set to acme, big corp; the mod reloads with it')
    await $.command.run(cmd('config redact ""'))
    expect(sets).toEqual([
      { key: 'chassis-delegation.maxWorkers', value: 5 },
      { key: 'chassis-delegation.redact', value: 'acme, big corp' },
      { key: 'chassis-delegation.redact', value: '' },
    ])
    expect(rows.find(r => r.label === 'maxWorkers')?.value).toBe(5)
    expect(String((await $.command.run(cmd('config'))).text)).toContain('maxWorkers = 5')
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

  test('a deny reason from $.config.set is the answer', async ($, on) => {
    const { sets } = setup(on, 'managed by policy')
    await $.session.start(sessionStart)
    const out = String((await $.command.run(cmd('config autoEscalate true'))).text)
    expect(out).toContain('managed by policy')
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

describe('MOD-66: the pure half', () => {
  const rows = ROWS.map(r => ({ ...r })) as CfgRow[]
  const defaults = manifestDefaults(MANIFEST)
  test('the plan parses by kind: boolean words, finite numbers, choices, text as typed', () => {
    expect(configPlan(rows, defaults, ' wakeOnVerdict   off ')).toEqual({ set: { key: 'chassis-delegation.wakeOnVerdict', field: 'wakeOnVerdict', value: false } })
    expect(configPlan(rows, defaults, 'wakeOnVerdict Yes')).toEqual({ set: { key: 'chassis-delegation.wakeOnVerdict', field: 'wakeOnVerdict', value: true } })
    expect('text' in configPlan(rows, defaults, 'maxWorkers Infinity')).toBe(true)
    expect('text' in configPlan(rows, defaults, 'maxWorkers 2x')).toBe(true)
    expect(configPlan(rows, defaults, 'maxWorkers 2.5')).toEqual({ set: { key: 'chassis-delegation.maxWorkers', field: 'maxWorkers', value: 2.5 } })
    expect(configPlan(rows, defaults, 'verdictVerbosity full')).toEqual({ set: { key: 'chassis-delegation.verdictVerbosity', field: 'verdictVerbosity', value: 'full' } })
    expect(configPlan(rows, defaults, 'briefDir  /a b/c')).toEqual({ set: { key: 'chassis-delegation.briefDir', field: 'briefDir', value: '/a b/c' } })
    expect(configPlan(rows, defaults, 'briefDir ""')).toEqual({ set: { key: 'chassis-delegation.briefDir', field: 'briefDir', value: '' } })
  })
  test('the manifest default reads as nothing when the manifest does not parse', () => {
    expect(manifestDefaults('not json')).toEqual({})
    expect(manifestDefaults(undefined)).toEqual({})
  })
})

// MOD-68: the list does not depend on the host's rows.
const ENGINE_ONLY = [{ key: 'theme', label: 'theme', kind: 'choice', value: 'dark', options: ['dark', 'light'], isLocked: false, provider: { plugin: 'engine' } }]
describe('MOD-68: /delegation config without host rows', () => {
  test('a host that lists no rows for the mod still gives every manifest field, then the no-rows line', async ($, on) => {
    setup(on, undefined, ENGINE_ONLY)
    await $.session.start(sessionStart)
    const lines = String((await $.command.run(cmd('config'))).text).split('\n')
    expect(lines).toContain('wakeOnVerdict = false (default)')
    expect(lines).toContain('driveWarn = true (default)')
    expect(lines).toContain('redact = "" (default)')
    expect(lines.join('\n')).not.toContain('theme')
    const last = lines[lines.length - 1] ?? ''
    expect(last).toContain('lists no rows for chassis-delegation')
    expect(last).toContain('1 row listed')
    expect(last).toContain('may be refused')
    expect(last).toContain('/config menu in a terminal')
  })

  test('a row keyed differently but with provider.plugin = chassis-delegation is used, and its key is passed to set', async ($, on) => {
    const row = { key: 'plugins.cd.wakeOnVerdict', label: 'wakeOnVerdict', kind: 'boolean', value: true, isLocked: false, provider: { plugin: 'chassis-delegation' } }
    const { sets } = setup(on, undefined, [row, ...ENGINE_ONLY])
    await $.session.start(sessionStart)
    const t = String((await $.command.run(cmd('config'))).text)
    expect(t).toContain('wakeOnVerdict = true')
    expect(t).toContain('redact = "" (default)')
    await $.command.run(cmd('config wakeOnVerdict off'))
    expect(sets).toEqual([{ key: 'plugins.cd.wakeOnVerdict', value: false }])
  })

  test('with no row, set uses chassis-delegation.<field> and the manifest kind', async ($, on) => {
    const { sets } = setup(on, undefined, ENGINE_ONLY)
    await $.session.start(sessionStart)
    expect((await $.command.run(cmd('config maxWorkers 5'))).text).toBe('maxWorkers set to 5; the mod reloads with it')
    expect(String((await $.command.run(cmd('config maxWorkers many'))).text)).toContain('takes a number')
    expect(String((await $.command.run(cmd('config verdictVerbosity loud'))).text)).toContain('line, full, silent')
    const show = String((await $.command.run(cmd('config verdictVerbosity'))).text)
    expect(show).toContain('kind: choice')
    expect(show).toContain('choices: line, full, silent')
    expect(sets).toEqual([{ key: 'chassis-delegation.maxWorkers', value: 5 }])
  })

  test('a set the host cannot do answers "<field> was not set: <reason>", and a deny gives its reason verbatim', async ($, on) => {
    setup(on, undefined, ENGINE_ONLY, 'no handler')
    await $.session.start(sessionStart)
    const t = String((await $.command.run(cmd('config wakeOnVerdict true'))).text)
    expect(t.startsWith('wakeOnVerdict was not set: ')).toBe(true)
    expect(t.length).toBeGreaterThan('wakeOnVerdict was not set: '.length)
  })

  test('a denied set answers "<field> was not set: <the host reason>"', async ($, on) => {
    setup(on, 'managed by policy', ENGINE_ONLY)
    await $.session.start(sessionStart)
    expect((await $.command.run(cmd('config wakeOnVerdict true'))).text).toBe('wakeOnVerdict was not set: managed by policy')
  })
})
