// MOD-250: a spawn is a briefed worker of a task only while the task is open: a prompt that merely names the brief of a task closed since its last dispatch runs ad hoc.
import { test, expect, describe } from 'claude-code/testing'
import { world, spawnInput, ROOT, NOW } from './harness'
import { reviewMarker } from '../hooks/lib/review'

const BRIEF = `${ROOT}/.delegation/briefs/MOD-9.brief.md`
const REL = '.delegation/briefs/MOD-9.brief.md'
const LEDGER = `${ROOT}/.delegation/ledger.jsonl`
const HEADER = '[[brief v=1 task=MOD-9 subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid= gate=node budget=2-attempts report=chassis.report.v1]]'
const TASKS = `delegation.tasks.MOD-9@${ROOT}`
const HANDOFF = `delegation.handoff.${BRIEF}`
const CLOSED = 'MOD-9 is closed; this agent runs ad hoc'
const rec = { task: 'MOD-9', subtask: 'main', attempt: 1, kind: 'spawn', lineage: 1, tier: 'standard', alias: 'sonnet', verdict: 'consistent', at: 1, retired: 'merged', briefPath: BRIEF }
const ledger = (rows: Record<string, unknown>[]) => rows.map(r => JSON.stringify(r)).join('\n') + '\n'
const merged = (at: number) => ({ kind: 'merged', task: 'MOD-9', sha: 'abc1234', at })
const setup = (on: any, o: { rows?: Record<string, unknown>[]; handoffAt?: number; attempts?: boolean } = {}) =>
  world(on, {
    files: { [BRIEF]: HEADER + '\nbody', [LEDGER]: ledger(o.rows ?? []) },
    dirs: { [`${ROOT}/.delegation`]: ['ledger.jsonl'] },
    store: { ...(o.attempts ? { [TASKS]: [rec] } : {}), ...(o.handoffAt !== undefined ? { [HANDOFF]: { cwd: ROOT, at: o.handoffAt } } : {}) },
  })
const stored = (w: { store: Map<string, unknown> }) => (w.store.get(TASKS) ?? []) as { attempt: number }[]
const said = (w: { notices: string[]; debugLogs: string[] }) => [...w.notices, ...w.debugLogs].join('\n')

describe('MOD-250: a closed task\'s brief path named in passing does not brief a spawn', () => {
  test('(1) a prompt that only mentions the brief after the task merged is ad hoc: no attempt, one quiet line', async ($, on) => {
    const w = setup(on, { rows: [merged(NOW - 10)], attempts: true })
    await $.agent.spawn(spawnInput({ prompt: `Scout the repo. For background see ${REL}, which is already merged.` }))
    expect(stored(w).map(r => r.attempt)).toEqual([1])
    expect(said(w)).not.toContain('attempt 2/2')
    expect(said(w)).toContain(CLOSED)
  })

  test('(1b) the absolute path in passing is the same', async ($, on) => {
    const w = setup(on, { rows: [merged(NOW - 10)], attempts: true })
    await $.agent.spawn(spawnInput({ prompt: `Look at ${BRIEF} for context.` }))
    expect(stored(w).map(r => r.attempt)).toEqual([1])
    expect(said(w)).toContain(CLOSED)
  })

  test('(2) a prompt naming the brief in relative form right after a dispatch is briefed', async ($, on) => {
    const w = setup(on, { rows: [merged(NOW - 10)], handoffAt: NOW - 5, attempts: true })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${REL}. Read it whole, then follow it exactly.` }))
    expect(stored(w).map(r => r.attempt)).toEqual([1, 2])
    expect(said(w)).not.toContain(CLOSED)
  })

  test('(2b) an open task (no accept or merged row) is briefed with no dispatch record', async ($, on) => {
    const w = setup(on, { rows: [{ kind: 'spawn', task: 'MOD-9', at: NOW - 10 }] })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${REL}.` }))
    expect(stored(w).map(r => r.attempt)).toEqual([1])
    expect(said(w)).not.toContain(CLOSED)
  })

  test('(3) a spawn carrying an inline [[brief]] header is briefed', async ($, on) => {
    const w = world(on, { files: { [LEDGER]: ledger([]) }, dirs: { [`${ROOT}/.delegation`]: ['ledger.jsonl'] } })
    await $.agent.spawn(spawnInput({ prompt: HEADER + '\nDo the thing.' }))
    expect(stored(w).map(r => r.attempt)).toEqual([1])
    expect(said(w)).not.toContain(CLOSED)
  })

  test('(4) a review-marker spawn is decided by the marker first, closed task or not', async ($, on) => {
    const w = setup(on, { rows: [merged(NOW - 10)], attempts: true })
    await $.agent.spawn(spawnInput({ prompt: `${reviewMarker({ task: 'MOD-9', subtask: 'main', attempt: 1 })}\nReview the work against ${REL}.` }))
    expect(stored(w).map(r => r.attempt)).toEqual([1, 1])
    expect(stored(w).length).toBe(2)
    expect(said(w)).not.toContain(CLOSED)
  })
})
