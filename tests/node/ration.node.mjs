// MOD-128: the rationing meter, pure: day keys, the day record, the allowance, pace, the health bar and its texts.
import { test, expect, describe } from './kit.mjs'

const R = () => import('../../hooks/lib/ration.ts')
const DAY = 86_400_000
const HOUR = 3_600_000
// local time throughout: 21 Oct 2026, a Wednesday
const at = (h = 0, m = 0, d = 21) => new Date(2026, 9, d, h, m).getTime()
const dayStart = at(0)
const rec = (over = {}) => ({ startPct: 30, startAt: dayStart + HOUR, resetsAt: dayStart + 3 * DAY, lastPct: 30, lastAt: dayStart + HOUR, used: 0, ...over })

describe('MOD-128: the red example', () => {
  test('bar(41, 7), allowance with three days left, and the footer text', async () => {
    const { bar, allowance, rationText } = await R()
    expect(bar(41, 7)).toBe('██▉░░░░')
    expect(allowance({ startPct: 30, startAt: dayStart, resetsAt: dayStart + 3 * DAY }, { rationDaily: 0 })).toBe(23.3)
    // day 3 of 7: 2.5 days into the window
    const now = at(12)
    const window = { kind: 'seven_day', percentUsed: 41, resetsAt: now + 4.5 * DAY }
    const record = rec({ startPct: 34.8, startAt: now - 4 * HOUR, resetsAt: window.resetsAt, lastPct: 41, used: 6.2 })
    expect(rationText(window, record, 8.4, 'on pace', now)).toBe('██▉░░░░ 41% · day 3/7 · today 6.2/8.4 · on pace')
  })
})

describe('MOD-128: dayKey and dayRecord', () => {
  test('dayKey is the local date', async () => {
    const { dayKey } = await R()
    expect(dayKey(at(0, 0, 5))).toBe('2026-10-05')
    expect(dayKey(at(23, 59, 5))).toBe('2026-10-05')
    expect(dayKey(at(0, 0, 6))).toBe('2026-10-06')
  })
  test('the first reading of the day starts it; later readings raise used', async () => {
    const { dayRecord } = await R()
    const resetsAt = dayStart + 5 * DAY
    const first = dayRecord(undefined, { percentUsed: 30, resetsAt }, at(9))
    expect(first).toEqual({ startPct: 30, startAt: at(9), resetsAt, lastPct: 30, lastAt: at(9), used: 0 })
    const second = dayRecord(first, { percentUsed: 36, resetsAt }, at(11))
    expect(second).toEqual({ startPct: 30, startAt: at(9), resetsAt, lastPct: 36, lastAt: at(11), used: 6 })
    // the same reading again changes nothing but nothing is lost
    expect(dayRecord(second, { percentUsed: 36, resetsAt }, at(11))).toEqual(second)
  })
  test('used is never negative', async () => {
    const { dayRecord } = await R()
    const resetsAt = dayStart + 5 * DAY
    const first = dayRecord(undefined, { percentUsed: 30, resetsAt }, at(9))
    expect(dayRecord(first, { percentUsed: 28, resetsAt }, at(10)).used).toBe(0)
  })
  test('a window that reset today starts from 0 at the moment resetsAt changed', async () => {
    const { dayRecord } = await R()
    const was = dayRecord(undefined, { percentUsed: 88, resetsAt: at(14) }, at(9))
    const now = dayRecord(was, { percentUsed: 3, resetsAt: at(14) + 7 * DAY }, at(15))
    expect(now).toEqual({ startPct: 0, startAt: at(15), resetsAt: at(14) + 7 * DAY, lastPct: 3, lastAt: at(15), used: 3 })
  })
})

describe('MOD-128: allowance', () => {
  test('pace-to-reset: the points left over the days left, one decimal', async () => {
    const { allowance } = await R()
    const o = { rationDaily: 0 }
    for (const [days, want] of [[1, 70], [2, 35], [3, 23.3], [4, 17.5], [5, 14], [6, 11.7], [7, 10]]) {
      expect(allowance(rec({ startPct: 30, resetsAt: dayStart + days * DAY }), o)).toBe(want)
    }
  })
  test('fractional days left round up, and there is always at least one', async () => {
    const { allowance } = await R()
    const o = { rationDaily: 0 }
    expect(allowance(rec({ startPct: 0, resetsAt: dayStart + 2.2 * DAY }), o)).toBe(33.3)
    expect(allowance(rec({ startPct: 0, resetsAt: dayStart + 0.4 * DAY }), o)).toBe(100)
    expect(allowance(rec({ startPct: 50, resetsAt: dayStart - HOUR }), o)).toBe(50)
  })
  test('the day is counted from its start, not from the first reading', async () => {
    const { allowance } = await R()
    expect(allowance(rec({ startAt: dayStart + 20 * HOUR, startPct: 0, resetsAt: dayStart + 2.5 * DAY }), { rationDaily: 0 })).toBe(33.3)
  })
  test('rationDaily wins when set', async () => {
    const { allowance } = await R()
    expect(allowance(rec(), { rationDaily: 12 })).toBe(12)
  })
})

describe('MOD-128: pace', () => {
  test('on pace while used <= allowance * elapsed + 0.5; ahead past that; over from the allowance on', async () => {
    const { pace } = await R()
    const now = at(12) // half the day gone
    expect(pace(rec({ used: 2 }), 8, now)).toBe('on pace')
    expect(pace(rec({ used: 4.5 }), 8, now)).toBe('on pace') // the boundary: 8 * 0.5 + 0.5
    expect(pace(rec({ used: 4.6 }), 8, now)).toBe('ahead by 0.6')
    expect(pace(rec({ used: 7.9 }), 8, now)).toBe('ahead by 3.9')
    expect(pace(rec({ used: 8 }), 8, now)).toBe('over by 0.0')
    expect(pace(rec({ used: 9.25 }), 8, now)).toBe('over by 1.3')
  })
  test('a spent window with nothing used today is on pace', async () => {
    const { pace } = await R()
    expect(pace(rec({ used: 0 }), 0, at(12))).toBe('on pace')
  })
})

describe('MOD-128: surplus', () => {
  test('what earlier days left under a fixed daily allowance, never below 0', async () => {
    const { surplus } = await R()
    expect(surplus([rec({ used: 6 }), rec({ used: 9 }), rec({ used: 7 })], 10)).toBe(8)
    expect(surplus([rec({ used: 14 }), rec({ used: 9 })], 10)).toBe(0)
    expect(surplus([], 10)).toBe(0)
    expect(surplus([rec({ used: 3 })], 0)).toBe(0)
  })
})

describe('MOD-128: the health bar', () => {
  test('segments', async () => {
    const { segments } = await R()
    expect(segments('seven_day')).toBe(7)
    expect(segments('five_hour')).toBe(5)
  })
  test('bar: empty, partial, full', async () => {
    const { bar } = await R()
    expect(bar(0, 7)).toBe('░░░░░░░')
    expect(bar(41, 7)).toBe('██▉░░░░')
    expect(bar(100, 7)).toBe('███████')
    expect(bar(50, 7)).toBe('███▌░░░')
  })
  test('bar: a five-cell window', async () => {
    const { bar } = await R()
    expect(bar(40, 5)).toBe('██░░░')
    expect(bar(30, 5)).toBe('█▌░░░')
    expect(bar(100, 5)).toBe('█████')
  })
  test('bar: the partial cell rounds to the nearest eighth; a zero eighth is a bare cell', async () => {
    const { bar } = await R()
    // one cell of 7 is 14.2857 points; 1 point is 0.07 of a cell = 0.56 eighths -> 1
    expect(bar(1, 7)).toBe('▏░░░░░░')
    // 0.5 point is 0.035 of a cell = 0.28 eighths -> 0
    expect(bar(0.5, 7)).toBe('░░░░░░░')
    // 7 points is half a cell = 4 eighths
    expect(bar(7, 7)).toBe('▌░░░░░░')
    // 13.9 points is 0.973 of a cell = 7.8 eighths -> 8: the whole cell
    expect(bar(13.9, 7)).toBe('█░░░░░░')
  })
  test('dayIndex: the first day, the last, and the reset moment', async () => {
    const { dayIndex } = await R()
    const resetsAt = at(14) + 3 * DAY
    const start = resetsAt - 7 * DAY
    expect(dayIndex(start, resetsAt, 7)).toBe(1)
    expect(dayIndex(start + DAY - 1, resetsAt, 7)).toBe(1)
    expect(dayIndex(start + DAY, resetsAt, 7)).toBe(2)
    expect(dayIndex(resetsAt - 1, resetsAt, 7)).toBe(7)
    expect(dayIndex(resetsAt, resetsAt, 7)).toBe(7)
    expect(dayIndex(start - DAY, resetsAt, 7)).toBe(1)
    // five_hour: one cell per hour
    const r5 = at(15)
    expect(dayIndex(r5 - 5 * HOUR + 2.5 * HOUR, r5, 5)).toBe(3)
  })
})

describe('MOD-128: daySegments', () => {
  test('each state', async () => {
    const { daySegments } = await R()
    const cells = [rec({ used: 8 }), rec({ used: 10 }), rec({ used: 10.9 }), rec({ used: 12 }), rec({ used: 2 }), undefined, undefined]
    const out = daySegments(cells, 5, 10)
    expect(out.map(c => c.state)).toEqual(['under', 'under', 'near', 'over', 'today', 'future', 'future'])
    expect(out[0]).toEqual({ used: 8, share: 10, state: 'under', known: true })
    expect(out[4]).toEqual({ used: 2, share: 10, state: 'today', known: true })
    expect(out[5]).toEqual({ used: 0, share: 10, state: 'future', known: false })
  })
  test('a day before the mod had a record is unknown', async () => {
    const { daySegments } = await R()
    const out = daySegments([undefined, rec({ used: 3 })], 2, r => 6)
    expect(out[0]).toEqual({ used: 0, share: 6, state: 'under', known: false })
    expect(out[1].state).toBe('today')
  })
})

describe('MOD-128: the texts', () => {
  const now = at(12)
  const window = { kind: 'seven_day', percentUsed: 41, resetsAt: now + 4.5 * DAY + 4 * HOUR }
  const record = rec({ startPct: 34.8, startAt: now - 4 * HOUR, resetsAt: window.resetsAt, lastPct: 41, used: 6.2 })
  test('rationText: a surplus shows after the allowance; five_hour counts hours', async () => {
    const { rationText } = await R()
    expect(rationText(window, record, 8.4, 'ahead by 1.0', now, 1.2)).toBe('██▉░░░░ 41% · day 3/7 · today 6.2/8.4 (+1.2) · ahead by 1.0')
    const w5 = { kind: 'five_hour', percentUsed: 40, resetsAt: now + 2.5 * HOUR }
    expect(rationText(w5, record, 8.4, 'on pace', now)).toBe('██░░░ 40% · hour 3/5 · today 6.2/8.4 · on pace')
  })
  test('rationReport: the bar line with the reset, today, and the days so far', async () => {
    const { rationReport } = await R()
    const days = [rec({ used: 12.1, startAt: now - 2 * DAY }), rec({ used: 9, startAt: now - DAY }), record]
    const text = rationReport(window, record, 8.4, 'on pace', now, days)
    expect(text.split('\n')).toEqual([
      '██▉░░░░ 41% · day 3/7 · today 6.2/8.4 · on pace · resets 4d 16h',
      'today: 6.2 of 8.4 window points used, on pace',
      'days: Mon 12.1 · Tue 9.0 · Wed 6.2*',
    ])
  })
  test('rationReport: a day without a record is a dash', async () => {
    const { rationReport } = await R()
    const text = rationReport(window, record, 8.4, 'on pace', now, [undefined, rec({ used: 9 }), record])
    expect(text.split('\n')[2]).toBe('days: Mon – · Tue 9.0 · Wed 6.2*')
  })
})
