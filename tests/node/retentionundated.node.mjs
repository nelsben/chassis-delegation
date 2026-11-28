// MOD-420 (#600): over PRESSURE_BYTES the store prune also deletes undated records of the plan's families whose task is closed or gone. Pure.
import { test, expect, describe } from './kit.mjs'
import { retentionPlan, PRESSURE_BYTES, TARGET_BYTES } from '../../hooks/lib/retention.ts'

const DAY = 24 * 60 * 60 * 1000
const NOW = 1_800_000_000_000
const KB = 1024
const blob = n => 'x'.repeat(n)

// one dated filler record of a closed task (recent, so the old pass leaves it)
const filler = (id, bytes, at = NOW - DAY) => [[`delegation.tasks.${id}`, [{ at, verdict: 'merged', pad: blob(bytes) }]]]
// enough filler to put the store `over` PRESSURE_BYTES by `extra` bytes once `rest` is added
const sizeOf = entries => JSON.stringify(Object.fromEntries(entries)).length
function padTo(target, rest, id = 'F-1') {
  const need = target - sizeOf(rest) - 200
  return filler(id, Math.max(0, need))
}
// F-1 (the filler of `over`) is an open task, so only the undated pass can act
const run = (entries, extra = {}) => retentionPlan({ entries, now: NOW, ...extra, open: ['F-1', ...(extra.open ?? [])] })

const UNDATED = [
  ['delegation.postedRow.adhoc-1a2b3c4d:1:1', { row: 'r' }],
  ['delegation.posted.adhoc-1a2b3c4d:1:1', true],
  ['delegation.both.ag-gone', ['a/b.ts']],
  ['delegation.postedRow.T-9:1:1', { row: 'r' }],
  ['delegation.cardClass.T-9@/some/repo', { class: 'x' }],
]
const over = rest => [...padTo(PRESSURE_BYTES + 50 * KB, rest), ...rest]
const under = rest => [...filler('F-1', 10 * KB), ...rest]

describe('MOD-420: the undated pass', () => {
  test('over pressure, undated records of a gone task go', () => {
    const plan = run(over(UNDATED))
    expect(plan.before).toBeGreaterThan(PRESSURE_BYTES)
    for (const [k] of UNDATED) expect(plan.delete).toContain(k)
  })
  test('under pressure, nothing undated is deleted', () => {
    const plan = run(under(UNDATED))
    expect(plan.before).toBeLessThan(PRESSURE_BYTES)
    expect(plan.delete).toEqual([])
  })
  test('over pressure, an open task keeps its undated records', () => {
    const rest = [['delegation.postedRow.T-9:1:1', { row: 'r' }], ['delegation.cardClass.T-9@/some/repo', { class: 'x' }]]
    const plan = run(over(rest), { open: ['T-9'] })
    expect(plan.delete).toEqual([])
  })
  test('over pressure, a task with a pending attempt younger than the retain time keeps its undated records', () => {
    const rest = [
      ['delegation.tasks.T-9@/some/repo', [{ verdict: 'pending', at: NOW - DAY }]],
      ['delegation.postedRow.T-9@/some/repo:1:1', { row: 'r' }],
      ['delegation.cardClass.T-9@/some/repo', { class: 'x' }],
    ]
    const plan = run(over(rest))
    expect(plan.delete).toEqual([])
  })
  test('over pressure, a keep key stays', () => {
    const plan = run(over(UNDATED), { keep: ['delegation.both.ag-gone'] })
    expect(plan.delete).not.toContain('delegation.both.ag-gone')
    expect(plan.delete).toContain('delegation.postedRow.adhoc-1a2b3c4d:1:1')
  })
  test('over pressure, global and session keys with no timestamp stay', () => {
    const globals = [
      ['delegation.adhoc', [{ a: 1 }]],
      ['delegation.evals', [{ a: 1 }]],
      ['delegation.alias.sonnet', 'claude-sonnet'],
      ['delegation.updateCheck', { x: 1 }],
      ['delegation.brain.1', { x: 1 }],
      ['delegation.postAsk.1', { x: 1 }],
      ['delegation.prune', { x: 1 }],
      ['delegation.recent.sid1', ['line']],
      ['delegation.ration.sonnet.2026-01-01', { n: 1 }],
    ]
    const plan = run(over([...globals, ...UNDATED]))
    for (const [k] of globals) expect(plan.delete).not.toContain(k)
    expect(plan.delete).toContain('delegation.both.ag-gone')
  })
  test('a both log is resolved through the agent pointer to its spawn task, so an open task keeps it', () => {
    const rest = [
      ['delegation.agent.ag-1', 'k1'],
      ['delegation.spawn.k1', { task: 'T-5' }],
      ['delegation.both.ag-1', ['a/b.ts']],
    ]
    expect(run(over(rest), { open: ['T-5'] }).delete).toEqual([])
    expect(run(over(rest)).delete).toContain('delegation.both.ag-1')
  })
  test('the new families are reached: tierReason, effortReason, baseSha', () => {
    const rest = [
      ['delegation.tierReason.T-9@/r', 'why'],
      ['delegation.effortReason.T-9@/r', 'why'],
      ['delegation.baseSha./r/docs/T-9.brief.md', 'abc123'],
    ]
    const plan = run(over(rest))
    for (const [k] of rest) expect(plan.delete).toContain(k)
  })
  test('undated first: a young dated record stays when the undated ones are enough', () => {
    const undated = Array.from({ length: 10 }, (_, i) => [`delegation.postedRow.adhoc-0000000${i}:1:1`, { row: blob(60 * KB) }])
    const dated = filler('Y-1', 100 * KB, NOW - 2 * DAY)
    const base = [...dated, ...undated]
    // filler brings the store to 3.5 MiB + 20 KiB; the undated 600 KiB take it under TARGET (3 MiB) only if enough go
    const pad = filler('F-2', Math.floor(PRESSURE_BYTES + 20 * KB - sizeOf(base)), NOW - DAY)
    const entries = [...pad, ...base]
    const plan = run(entries, { open: [] })
    expect(plan.before).toBeGreaterThan(PRESSURE_BYTES)
    // 3.5 MiB + 20 KiB - 3 MiB = 532 KiB is needed and the undated records hold 600 KiB
    expect(plan.after).toBeLessThan(TARGET_BYTES)
    expect(plan.delete).not.toContain('delegation.tasks.Y-1')
    expect(plan.delete).not.toContain('delegation.tasks.F-2')
  })
  test('the pass stops under TARGET_BYTES', () => {
    const undated = Array.from({ length: 40 }, (_, i) => [`delegation.postedRow.adhoc-${String(10000000 + i)}:1:1`, { row: blob(50 * KB) }])
    const pad = filler('F-2', Math.floor(PRESSURE_BYTES + 20 * KB - sizeOf(undated)), NOW - DAY)
    const plan = run([...pad, ...undated], { open: [] })
    expect(plan.after).toBeLessThan(TARGET_BYTES)
    const dropped = plan.delete.filter(k => k.startsWith('delegation.postedRow.adhoc-'))
    expect(dropped.length).toBeGreaterThan(0)
    expect(dropped.length).toBeLessThan(undated.length)
    // the undated keys are in key order at the end of the list
    expect(plan.delete).toEqual([...plan.delete.filter(k => !k.startsWith('delegation.postedRow.')), ...[...dropped].sort()])
  })
})
