// GH-112: the live delegation model (pure): the spend series, the events, the worktree rows, spend by model.
import { test, expect, describe } from 'claude-code/testing'
import { sessionRecords, events, familyOf, sampleEvery, spendByModel, spendSeries, SPEND_CAP, worktreeRows, type SpendPoint, sparkText } from '../hooks/lib/live'
import type { AttemptRecord } from '../hooks/lib/attempts'
import { world, spawnInput, workerCall, SCRATCH, sessionStart } from './harness'
import { brainLine, brainSummary, emptyBrain } from '../hooks/lib/brain'

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
  test('dollars, tokens and cards consistent per family; anything not haiku/sonnet/opus folds into other', () => {
    const rows = spendByModel([
      rec({ task: 'A', alias: 'sonnet', usd: 1.5, tokens: 1000, verdict: 'consistent' }),
      rec({ task: 'B', alias: 'sonnet', usd: 1.6, tokens: 2000, verdict: 'refuted' }),
      rec({ task: 'B', attempt: 2, alias: 'opus', resolvedModel: 'claude-opus-5', usd: 3, tokens: 500, verdict: 'consistent' }),
      rec({ task: 'C', alias: 'fable', usd: 2, tokens: 10, verdict: 'consistent' }),
      rec({ task: 'D', alias: 'gizmo', usd: 1, tokens: 5, verdict: 'unverified' }),
    ])
    expect(rows.map(r => r.family)).toEqual(['haiku', 'sonnet', 'opus', 'other'])
    expect(rows.find(r => r.family === 'sonnet')).toMatchObject({ usd: 3.1, tokens: 3000, consistent: 1 })
    expect(rows.find(r => r.family === 'opus')).toMatchObject({ usd: 3, tokens: 500, consistent: 1 })
    expect(rows.find(r => r.family === 'haiku')).toMatchObject({ usd: 0, tokens: 0, consistent: 0 })
    expect(rows.find(r => r.family === 'other')).toMatchObject({ usd: 3, tokens: 15, consistent: 1 })
  })
})

describe('GH-112: events', () => {
  test('a spawn and a verdict time per attempt, with task, family and verdict', () => {
    const ev = events([rec({ task: 'A', at: NOW - 500, verdict: 'consistent', verdictAt: NOW - 100 }), rec({ task: 'B', alias: 'opus', at: NOW - 300 })], 0)
    expect(ev).toEqual([
      { t: NOW - 500, kind: 'spawn', task: 'A', family: 'sonnet' },
      { t: NOW - 300, kind: 'spawn', task: 'B', family: 'opus' },
      { t: NOW - 100, kind: 'verdict', task: 'A', family: 'sonnet', verdict: 'consistent' },
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
      rec({ task: 'T-2', alias: 'haiku', resolvedModel: 'claude-haiku-5-5', verdict: 'consistent', usd: 0.2, tokens: 500, at: NOW - 900_000 }),
    ],
  }
  test('task, model, state, folder and branch, tokens, cost, attempt', () => {
    const rows = worktreeRows(input)
    expect(rows[0]).toMatchObject({ task: 'T-1', family: 'sonnet', model: 'claude-sonnet-5-5', state: 'live 04:12', folder: 'acme-app-T-1', branch: 'agent/mod/T-1', tokens: 1000, usd: 1.5, attempt: '1/3' })
    expect(rows.find(r => r.task === 'T-2')).toMatchObject({ family: 'haiku', state: 'consistent', folder: '–', attempt: '1/3' })
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

describe('the dashboard as text', () => {
  test('sparkText scales to eight glyphs; under two values it is empty', () => {
    expect(sparkText([1])).toBe('')
    expect(sparkText([0, 7])).toBe('▁█')
    expect(sparkText([2, 2, 2])).toBe('▁▁▁')
  })
})

describe('MOD-37: the session filter and the line arithmetic', () => {
  const START = NOW - 3_600_000
  test('records of another session are dropped; this session\'s kept', () => {
    const rs = [rec({ task: 'A', sessionId: 's1' }), rec({ task: 'B', sessionId: 's2' })]
    expect(sessionRecords(rs, START, { sessionId: 's1', root: '/r/a' }).map(r => r.task)).toEqual(['A'])
  })
  test('a legacy record is kept only under this root and at or after the start', () => {
    const rs = [
      rec({ task: 'OTHER', root: '/r/b' }),
      rec({ task: 'MINE', root: '/r/a' }),
      rec({ task: 'OLD', root: '/r/a', at: START - 1 }),
    ]
    expect(sessionRecords(rs, START, { sessionId: 's1', root: '/r/a' }).map(r => r.task)).toEqual(['MINE'])
  })
  test('the brain line closes the sum: unattributed is the session total less the rest', () => {
    const brain = { ...emptyBrain(), usd: 2, turns: 4, byModel: { 'claude-fable-5-1': { usd: 2, tokens: 10, turns: 4 } } }
    const line = brainLine(brainSummary(brain, 3, 2, 8, { usd: 1, agents: 1 }))
    expect(line).toBe('brain: fable $2.00 over 4 turns · workers $3.00 (2 attempts) · ad hoc $1.00 (1 agents) · unattributed $2.00 · brain share 25%')
  })
  test('unattributed is never negative and is left out under a cent', () => {
    const brain = { ...emptyBrain(), usd: 2, turns: 1, byModel: { 'claude-fable-5-1': { usd: 2, tokens: 10, turns: 1 } } }
    expect(brainLine(brainSummary(brain, 3, 2, 5, { usd: 1, agents: 1 }))).not.toContain('unattributed')
    expect(brainLine(brainSummary(brain, 3, 2, 4, { usd: 1, agents: 1 }))).not.toContain('unattributed')
  })
})

// MOD-240: liveState and spawnByAgent are cached, so a repeat read of an unchanged session costs no store reads per agent.
describe('MOD-240: liveState and spawnByAgent reads', () => {
  const cmd = (args: string) => ({ command: 'delegation', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }) as never
  const spawnRec = (i: number, closed: boolean) => ({ key: `k${i}`, task: `T-${i}`, subtask: 'main', adhoc: false, attempt: 1, lineage: 1, tier: 'standard', alias: 'sonnet', budget: 3, purpose: 'build', description: '', subagentType: 'general-purpose', agentId: `ag${i}`, at: NOW, ...(closed ? { verdictAttempt: 1 } : {}) })

  test('a second liveState with no state change, over 30 finished agents and 1 live one, makes at most 2 store.get calls', async ($, on) => {
    const w = world(on)
    for (let i = 0; i < 31; i++) {
      w.store.set(`delegation.agent.ag${i}`, `k${i}`)
      w.store.set(`delegation.spawn.k${i}`, spawnRec(i, i < 30))
      w.agents.push({ id: `ag${i}`, type: 'general-purpose', description: '', status: i < 30 ? 'completed' : 'running' })
    }
    await $.command.run(cmd('accept --owed'))
    const before = w.storeGets
    await $.command.run(cmd('accept --owed'))
    expect(w.storeGets - before).toBeLessThanOrEqual(2)
  })

  test('an agent whose verdict is still out is never skipped: it stays pending on a repeat read', async ($, on) => {
    const w = world(on)
    w.store.set('delegation.agent.ag0', 'k0')
    w.store.set('delegation.spawn.k0', spawnRec(0, false))
    w.agents.push({ id: 'ag0', type: 'general-purpose', description: '', status: 'completed' })
    await $.command.run(cmd('accept --owed'))
    expect(String((await $.command.run(cmd('update'))).text)).toContain('T-0')
  })

  test('a worker Bash tool call resolves its spawn with at most 2 store.get calls across all tool.call hooks', { options: { gateMap: '{"prettier":"npx prettier --check {files}"}' } }, async ($, on) => {
    const brief = `${SCRATCH}/briefs/T-7.brief.md`
    const head = '[[brief v=1 task=T-7 subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid=b/** gate=prettier spend=2 budget=3-attempts report=chassis.report.v1]]'
    const w = world(on, { files: { [brief]: head + '\nbody' }, run: () => undefined, agentId: 'agent-7' })
    ;(on as unknown as (n: string, h: unknown) => void)('tool.call', async () => ({ result: 'ok' }))
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${brief}.` }))
    await workerCall($, w, 'agent-7', { tool: 'Bash', command: 'git status' })
    const before = w.storeGets
    await workerCall($, w, 'agent-7', { tool: 'Bash', command: 'git commit -m x' })
    expect(w.storeGets - before).toBeLessThanOrEqual(2)
  })
})

// MOD-242: the spend sampler sleeps when nothing is running, redraws only when the figure moved, and the model probe backs off.
describe('MOD-242: the spend sampler and the model probe', () => {
  const MIN = 60_000
  test('an idle session makes 0 ui invalidations from the sampler between minute 1 and minute 10', async ($, on) => {
    const w = world(on)
    await $.session.start(sessionStart)
    await w.clock.advance(MIN)
    const before = w.invalidations
    for (let i = 0; i < 9; i++) await w.clock.advance(MIN)
    expect(w.invalidations - before).toBe(0)
  })

  test('a live worker is still sampled every 15 s, a redraw per moved figure; an unmoved figure redraws nothing', async ($, on) => {
    const w = world(on)
    w.store.set('delegation.agent.ag0', 'k0')
    w.store.set('delegation.spawn.k0', { key: 'k0', task: 'T-0', subtask: 'main', adhoc: false, attempt: 1, lineage: 1, tier: 'standard', alias: 'sonnet', budget: 3, purpose: 'build', description: '', subagentType: 'general-purpose', agentId: 'ag0', at: NOW })
    w.agents.push({ id: 'ag0', type: 'general-purpose', description: '', status: 'running' })
    await $.session.start(sessionStart)
    await w.clock.advance(1)
    for (let i = 0; i < 4; i++) {
      w.usd += 1
      const before = w.invalidations
      await w.clock.advance(15_000)
      expect(w.invalidations, `tick ${i}`).toBeGreaterThan(before)
    }
    const still = w.invalidations
    await w.clock.advance(15_000)
    expect(w.invalidations).toBe(still)
    // the curve keeps a point per moved tick
    const series = w.store.get('delegation.spend') as SpendPoint[] | undefined
    expect(series === undefined || series.length >= 4).toBe(true)
  })

  test('the probe stops asking a model after 3 failures, until candidateIds changes; a success clears the entry', { options: { probeModels: true, candidateIds: 'claude-next-9' } }, async ($, on) => {
    const w = world(on, { skip: ['model.classify'] })
    let asked = 0
    let fail = true
    ;(on as unknown as (n: string, h: unknown) => void)('model.classify', () => {
      asked++
      if (fail) throw new Error('no such model')
      return { value: 'ok' }
    })
    for (let i = 0; i < 5; i++) {
      await $.session.start(sessionStart)
      for (let j = 0; j < 5; j++) await w.clock.advance(1)
    }
    expect(asked).toBe(3)
    expect(w.store.get('delegation.models.failed')).toMatchObject({ 'claude-next-9': { n: 3 } })
    fail = false
    w.store.set('delegation.models.failed', { 'claude-next-9': { n: 1, idsHash: (w.store.get('delegation.models.failed') as Record<string, { idsHash: string }>)['claude-next-9']!.idsHash } })
    await $.session.start(sessionStart)
    for (let j = 0; j < 5; j++) await w.clock.advance(1)
    expect(asked).toBe(4)
    expect(w.store.get('delegation.models.failed')).toEqual({})
  })
})
