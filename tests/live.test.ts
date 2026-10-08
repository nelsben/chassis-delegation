// GH-112: the live delegation model (pure): the spend series, the events, the worktree rows, spend by model.
import { test, expect, describe } from 'claude-code/testing'
import { events, familyOf, sampleEvery, spendByModel, spendSeries, SPEND_CAP, worktreeRows, type SpendPoint } from '../hooks/lib/live'
import type { AttemptRecord } from '../hooks/lib/attempts'

const NOW = 10_000_000
const rec = (o: Partial<AttemptRecord> & { task: string }): AttemptRecord => ({
  subtask: 'main',
  attempt: 1,
  kind: 'spawn',
  lineage: 1,
  tier: 'standard',
  alias: 'sonnet',
  verdict: 'pending',
  at: NOW - 600_000,
  ...o,
})

describe('GH-112: the spend series', () => {
  test('samples append in order and a non-finite dollar is dropped', () => {
    const a = spendSeries(undefined, { t: 1, usd: 0.5 })
    const b = spendSeries(a, { t: 2, usd: 0.75 })
    expect(b).toEqual([{ t: 1, usd: 0.5 }, { t: 2, usd: 0.75 }])
    expect(spendSeries(b, { t: 3, usd: Number.NaN })).toEqual(b)
  })
  test('capped at the last 240 points', () => {
    let s: SpendPoint[] = []
    for (let i = 0; i < SPEND_CAP + 60; i++) s = spendSeries(s, { t: i, usd: i / 100 })
    expect(SPEND_CAP).toBe(240)
    expect(s).toHaveLength(240)
    expect(s[0]).toEqual({ t: 60, usd: 0.6 })
    expect(s.at(-1)?.t).toBe(299)
  })
  test('sampled every 15 s while a worker is live or queued, every 60 s otherwise', () => {
    expect(sampleEvery(true)).toBe(15_000)
    expect(sampleEvery(false)).toBe(60_000)
  })
})

describe('GH-112: model families and spend by model', () => {
  test('a family from an alias or a resolved id; anything else is other', () => {
    expect(familyOf('sonnet')).toBe('sonnet')
    expect(familyOf('claude-opus-5')).toBe('opus')
    expect(familyOf('claude-haiku-5-5')).toBe('haiku')
    expect(familyOf('fable')).toBe('other')
    expect(familyOf(undefined)).toBe('other')
  })
  test('dollars, tokens and cards verified per family; anything not haiku/sonnet/opus folds into other', () => {
    const rows = spendByModel([
      rec({ task: 'A', alias: 'sonnet', usd: 1.5, tokens: 1000, verdict: 'verified' }),
      rec({ task: 'B', alias: 'sonnet', usd: 1.6, tokens: 2000, verdict: 'refuted' }),
      rec({ task: 'B', attempt: 2, alias: 'opus', resolvedModel: 'claude-opus-5', usd: 3, tokens: 500, verdict: 'verified' }),
      rec({ task: 'C', alias: 'fable', usd: 2, tokens: 10, verdict: 'verified' }),
      rec({ task: 'D', alias: 'gizmo', usd: 1, tokens: 5, verdict: 'unverified' }),
    ])
    expect(rows.map(r => r.family)).toEqual(['haiku', 'sonnet', 'opus', 'other'])
    expect(rows.find(r => r.family === 'sonnet')).toMatchObject({ usd: 3.1, tokens: 3000, verified: 1 })
    expect(rows.find(r => r.family === 'opus')).toMatchObject({ usd: 3, tokens: 500, verified: 1 })
    expect(rows.find(r => r.family === 'haiku')).toMatchObject({ usd: 0, tokens: 0, verified: 0 })
    expect(rows.find(r => r.family === 'other')).toMatchObject({ usd: 3, tokens: 15, verified: 1 })
  })
})

describe('GH-112: events', () => {
  test('a spawn and a verdict time per attempt, with task, family and verdict', () => {
    const ev = events([rec({ task: 'A', at: NOW - 500, verdict: 'verified', verdictAt: NOW - 100 }), rec({ task: 'B', alias: 'opus', at: NOW - 300 })], 0)
    expect(ev).toEqual([
      { t: NOW - 500, kind: 'spawn', task: 'A', family: 'sonnet' },
      { t: NOW - 300, kind: 'spawn', task: 'B', family: 'opus' },
      { t: NOW - 100, kind: 'verdict', task: 'A', family: 'sonnet', verdict: 'verified' },
    ])
  })
  test('nothing before the session began', () => {
    expect(events([rec({ task: 'A', at: 5 })], 10)).toEqual([])
  })
})

const PORCELAIN = [
  'worktree /r/acme-app', 'HEAD aaa', 'branch refs/heads/main', '',
  'worktree /r/acme-app-T-1', 'HEAD bbb', 'branch refs/heads/agent/mod/T-1', '',
  'worktree /r/acme-app-T-9', 'HEAD ccc', 'branch refs/heads/agent/ops/T-9', '',
  'worktree /elsewhere/other', 'HEAD ddd', 'branch refs/heads/x', '',
].join('\n')

describe('GH-112: the worktree rows', () => {
  const input = {
    root: '/r/acme-app',
    porcelain: PORCELAIN,
    now: NOW,
    budget: 3,
    liveAt: { 'T-1': NOW - (4 * 60 + 12) * 1000 },
    queue: [{ task: 'T-3', subtask: 'main' }],
    records: [
      rec({ task: 'T-1', resolvedModel: 'claude-sonnet-5-5', tokens: 1000, usd: 1.5 }),
      rec({ task: 'T-2', alias: 'haiku', resolvedModel: 'claude-haiku-5-5', verdict: 'verified', usd: 0.2, tokens: 500, at: NOW - 900_000 }),
    ],
  }
  test('task, model, state, folder and branch, tokens, cost, attempt', () => {
    const rows = worktreeRows(input)
    expect(rows[0]).toMatchObject({ task: 'T-1', family: 'sonnet', model: 'claude-sonnet-5-5', state: 'live 04:12', folder: 'acme-app-T-1', branch: 'agent/mod/T-1', tokens: 1000, usd: 1.5, attempt: '1/3' })
    expect(rows.find(r => r.task === 'T-2')).toMatchObject({ family: 'haiku', state: 'verified', folder: '–', attempt: '1/3' })
  })
  test('a queued task and a worktree on disk with no record each get a row; the main checkout and strangers do not', () => {
    const rows = worktreeRows(input)
    expect(rows.find(r => r.task === 'T-3')?.state).toBe('queued #1')
    expect(rows.find(r => r.task === 'T-9')).toMatchObject({ state: 'on disk', folder: 'acme-app-T-9', branch: 'agent/ops/T-9' })
    expect(rows.map(r => r.task).sort()).toEqual(['T-1', 'T-2', 'T-3', 'T-9'])
  })
  test('a worktreeRoot names the folder the rows look under', () => {
    const rows = worktreeRows({ ...input, root: '/r/acme-app', worktreeRoot: '/wt', porcelain: 'worktree /wt/acme-app-T-5\nHEAD e\nbranch refs/heads/agent/mod/T-5\n', records: [], queue: [] })
    expect(rows.map(r => r.task)).toEqual(['T-5'])
  })
})
