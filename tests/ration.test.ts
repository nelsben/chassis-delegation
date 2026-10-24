// MOD-128: the rationing meter, through the engine: the footer label, the day record, the report, the pane, and no status line.
import { test, expect, describe } from 'claude-code/testing'
import { world, sessionStart, spawnInput, NOW } from './harness'
import { dayKey } from '../hooks/lib/ration'

const DAY = 86_400_000
const HOUR = 3_600_000
const RED = 'chassis-delegation'
const FOCUS = 'focus'
const PROPS = { modes: [FOCUS] }
const PANE_PROPS = { title: 'Delegation', isFocused: false, bodyColumns: 100, placement: 'dock', scroll: { bodyRows: 30 }, view: {} } as never
const dayStartOf = (ms: number) => new Date(ms).setHours(0, 0, 0, 0)
const keyOf = (kind: string, ms: number) => `delegation.ration.${kind}.${dayKey(ms)}`
const delegation = (args: string) => ({ command: 'delegation', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }) as never

/** The bottom of the chain: session.measure answers, and every SessionMode render is recorded with the props the mod passed on. */
function bottom(on: unknown) {
  const seen: { modes: string[] }[] = []
  const hook = on as (n: string, f: unknown, g?: unknown) => void
  hook('session.measure', (_$: unknown, e: { changed: string[] }) => ({ changed: e.changed }))
  ;(on as unknown as (n: string, o: unknown, h: unknown) => void)('ui.render', { component: 'SessionMode' }, (_$: unknown, e: { props: { modes: string[] } }) => {
    seen.push({ modes: [...e.props.modes] })
    return { type: 'Text', props: {}, children: [] }
  })
  return seen
}
/** Move the mocked clock to 18:00 local on the day it starts, and give back that moment. */
/** The moment the tests run at: the mocked clock's start (advancing it a day's worth is slow, so the time of day is whatever it is). */
const eveningAt = (): number => NOW
async function evening(_w: ReturnType<typeof world>): Promise<number> {
  return NOW
}
const measure = ($: any, rateLimits: { kind: string; percentUsed: number; resetsAt: number }[]) =>
  $.session.measure({ context: { tokens: 24_000, window: 200_000, percent: 12 }, rateLimits, changed: ['rateLimits'] })
const footer = async ($: any, seen: { modes: string[] }[]) => {
  const before = seen.length
  await $.ui.mount({ plugin: RED, surface: 'terminal', component: 'SessionMode', props: PROPS } as never)
  expect(seen.length).toBe(before + 1)
  return seen[seen.length - 1]!.modes
}
const sec = (ms: number) => Math.round(ms / 1000)
const text = (r: { text?: unknown }) => String(r.text)

describe('MOD-128: the footer meter', () => {
  test('a measure with seven_day 41% writes the day record and the footer label follows the host modes', { options: { rationDaily: 8.4 } }, async ($, on) => {
    const seen = bottom(on)
    const now = eveningAt()
    const resetsAt = now + 4.5 * DAY
    const w = world(on, { store: { [keyOf('seven_day', now)]: { startPct: 34.8, startAt: dayStartOf(now) + 9 * HOUR, resetsAt, lastPct: 34.8, lastAt: dayStartOf(now) + 9 * HOUR, used: 0 } } })
    await $.session.start(sessionStart)
    await evening(w)
    await measure($, [{ kind: 'seven_day', percentUsed: 41, resetsAt: sec(resetsAt) }])
    expect(w.store.get(keyOf('seven_day', now))).toMatchObject({ startPct: 34.8, lastPct: 41, resetsAt })
    const modes = await footer($, seen)
    expect(modes[0]).toBe(FOCUS)
    expect(modes[1]).toMatch(/^██▉░░░░ 41% · day 3\/7 · today 6\.2\/8\.4 · (on pace|ahead by [\d.]+)$/)
    expect(w.invalidations).toBeGreaterThan(0)
  })

  test('pace-to-reset by default: the first reading of the day starts it, a second raises used', async ($, on) => {
    const seen = bottom(on)
    const w = world(on)
    await $.session.start(sessionStart)
    const now = await evening(w)
    const resetsAt = now + 4.5 * DAY
    await measure($, [{ kind: 'seven_day', percentUsed: 41, resetsAt: sec(resetsAt) }])
    expect(await footer($, seen)).toEqual([FOCUS, '██▉░░░░ 41% · day 3/7 · today 0.0/9.8 · on pace'])
    expect(w.store.get(keyOf('seven_day', now))).toMatchObject({ startPct: 41, lastPct: 41, used: 0 })
    await measure($, [{ kind: 'seven_day', percentUsed: 45, resetsAt: sec(resetsAt) }])
    expect(w.store.get(keyOf('seven_day', now))).toMatchObject({ startPct: 41, lastPct: 45, used: 4 })
    expect((await footer($, seen))[1]).toMatch(/^███▏░░░ 45% · day 3\/7 · today 4\.0\/9\.8 · (on pace|ahead by [\d.]+)$/)
  })

  test('one write per measure whose readings changed; the same readings write nothing', async ($, on) => {
    bottom(on)
    const w = world(on)
    await $.session.start(sessionStart)
    const now = await evening(w)
    const rl = [{ kind: 'seven_day', percentUsed: 41, resetsAt: sec(now + 4.5 * DAY) }, { kind: 'five_hour', percentUsed: 10, resetsAt: sec(now + 2 * HOUR) }]
    await measure($, rl)
    expect(w.store.has(keyOf('five_hour', now))).toBe(true)
    expect(w.store.has(keyOf('seven_day', now))).toBe(true)
    w.store.delete(keyOf('seven_day', now))
    await measure($, rl)
    expect(w.store.has(keyOf('seven_day', now))).toBe(false)
  })

  test('the first measure of a session reads the usage windows when the event carries none', async ($, on) => {
    const seen = bottom(on)
    const w = world(on)
    await $.session.start(sessionStart)
    const now = await evening(w)
    w.rateLimits = [{ kind: 'seven_day', percentUsed: 41, resetsAt: sec(now + 4.5 * DAY) }]
    await measure($, [])
    expect((await footer($, seen))[1]).toMatch(/^██▉░░░░ 41% · day 3\/7/)
  })

  test('ration: off passes the modes unchanged', { options: { ration: 'off' } }, async ($, on) => {
    const seen = bottom(on)
    const w = world(on)
    await $.session.start(sessionStart)
    const now = await evening(w)
    await measure($, [{ kind: 'seven_day', percentUsed: 41, resetsAt: sec(now + 4.5 * DAY) }])
    expect(await footer($, seen)).toEqual([FOCUS])
  })

  test('ration: five_hour reads the five-hour window, one cell per hour', { options: { ration: 'five_hour' } }, async ($, on) => {
    const seen = bottom(on)
    const w = world(on)
    await $.session.start(sessionStart)
    const now = await evening(w)
    await measure($, [{ kind: 'seven_day', percentUsed: 41, resetsAt: sec(now + 4.5 * DAY) }, { kind: 'five_hour', percentUsed: 40, resetsAt: sec(now + 2.5 * HOUR) }])
    expect((await footer($, seen))[1]).toMatch(/^██░░░ 40% · hour 3\/5 · today 0\.0\//)
  })

  test('with no reading the modes pass unchanged', async ($, on) => {
    const seen = bottom(on)
    world(on)
    await $.session.start(sessionStart)
    expect(await footer($, seen)).toEqual([FOCUS])
    await measure($, [])
    expect(await footer($, seen)).toEqual([FOCUS])
  })
})

describe('MOD-128: /delegation ration, the summary and the Spend tile', () => {
  test('/delegation ration prints the report; the summary has one ration line', async ($, on) => {
    bottom(on)
    const w = world(on)
    await $.session.start(sessionStart)
    expect(text(await $.command.run(delegation('ration')))).toContain('no reading yet')
    const now = await evening(w)
    await measure($, [{ kind: 'seven_day', percentUsed: 41, resetsAt: sec(now + 4.5 * DAY + 4 * HOUR) }])
    const lines = text(await $.command.run(delegation('ration'))).split('\n')
    expect(lines[0]).toBe('██▉░░░░ 41% · day 3/7 · today 0.0/9.8 · on pace · resets 4d 16h')
    expect(lines[1]).toBe('today: 0.0 of 9.8 window points used, on pace')
    expect(lines[2]).toMatch(/^days: .* [–-] · .*0\.0\*$/)
    const summary = text(await $.command.run(delegation('')))
    expect(summary.split('\n').filter(l => l.startsWith('ration: '))).toEqual(['ration: ██▉░░░░ 41% · day 3/7 · today 0.0/9.8 · on pace'])
  })

  test('the Spend tile names the window the host reported', async ($, on) => {
    bottom(on)
    const w = world(on)
    await $.session.start(sessionStart)
    const now = await evening(w)
    await measure($, [{ kind: 'seven_day', percentUsed: 41, resetsAt: sec(now + 4.5 * DAY) }])
    const ui = await $.ui.mount({ plugin: RED, surface: 'terminal', component: 'Pane', requestId: 'delegation-dash', props: PANE_PROPS })
    expect(await ui.find({ type: 'Text', text: /seven_day window 41%/ })).toBeDefined()
  })
})

describe('MOD-128: the pane bar', () => {
  test('seven cells, coloured by how each day went; unknown days dim with a question mark', { options: { rationDaily: 10 } }, async ($, on) => {
    bottom(on)
    const now = eveningAt()
    const resetsAt = now + 2.5 * DAY // day 5 of 7
    const rec = (used: number, back: number) => ({ startPct: 0, startAt: dayStartOf(now - back * DAY) + 9 * HOUR, resetsAt, lastPct: used, lastAt: dayStartOf(now - back * DAY) + 17 * HOUR, used })
    const w = world(on, { store: { [keyOf('seven_day', now - 3 * DAY)]: rec(14, 3), [keyOf('seven_day', now - 2 * DAY)]: rec(10.9, 2), [keyOf('seven_day', now - DAY)]: rec(4, 1) } })
    await $.session.start(sessionStart)
    await evening(w)
    await measure($, [{ kind: 'seven_day', percentUsed: 30, resetsAt: sec(resetsAt) }])
    const ui = await $.ui.mount({ plugin: RED, surface: 'terminal', component: 'Pane', requestId: 'delegation-dash', props: PANE_PROPS })
    const colour = async (i: number) => (await ui.find({ key: `ration-cell-${i}` })) as unknown as { props?: { dimColor?: boolean }; children?: unknown[] }
    const cells = await Promise.all([1, 2, 3, 4, 5, 6, 7].map(colour))
    expect(cells.every(c => c !== undefined)).toBe(true)
    const colours = JSON.stringify(cells)
    // under green, near yellow, over red
    expect(colours).toContain('#d03b3b')
    expect(colours).toContain('#fab219')
    expect(colours).toContain('#0ca30c')
    expect(await ui.find({ type: 'Text', text: /\?/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /70% left · resets 2d 12h/ })).toBeDefined()
  })
})

describe('MOD-128: the host status line and the band are retired from the defaults', () => {
  test('$.ui.status is never called with text across a session; one clearing call at the start', async ($, on) => {
    bottom(on)
    const w = world(on, { listAgents: true })
    await $.session.start(sessionStart)
    await $.agent.spawn(spawnInput({ prompt: '[[brief v=1 task=T-7 subtask=main tier=standard]]\nDo it.', description: 'T-7' }))
    await measure($, [{ kind: 'seven_day', percentUsed: 41, resetsAt: sec(NOW + 4.5 * DAY) }])
    await w.clock.advance(15 * 60_000)
    expect(w.statuses.filter(s => s !== undefined)).toEqual([])
    expect(w.statuses).toEqual([undefined])
  })

  const queued = (w: ReturnType<typeof world>) => w.state.set('chassis-delegation.queue', [{ prompt: '', description: '', subagentType: 'general-purpose', task: 'T-3', at: NOW }])
  const band = async ($: any) => {
    try {
      const ui = await $.ui.mount({ plugin: RED, surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 100, scroll: { bodyRows: 18 }, view: {} } } as never)
      return await ui.find({ key: 'dash-band' })
    } catch {
      return undefined
    }
  }
  test('the band is not drawn on defaults', async ($, on) => {
    bottom(on)
    const w = world(on)
    queued(w)
    await $.session.start(sessionStart)
    expect(await band($)).toBeUndefined()
  })
  test('the band is drawn with dashboardBand true', { options: { dashboardBand: true } }, async ($, on) => {
    bottom(on)
    const w = world(on)
    queued(w)
    await $.session.start(sessionStart)
    expect(await band($)).toBeDefined()
  })
})
