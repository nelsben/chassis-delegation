import { test, expect, describe } from 'claude-code/testing'
import { migratedLine, migrationPlan, rowRoot, scopedAttemptKey, scopedId, trimRepo } from '../hooks/lib/taskkeys'
import { RETAIN_MS, retentionPlan } from '../hooks/lib/retention'
import { world, sessionStart, spawnInput, ROOT, SCRATCH } from './harness'
import { MOD_VERSION } from '../hooks/lib/version'

// MOD-117 (#185, #184): every per-task key names the card's repo, the session's own cards too.
const A = '/repo/a'
const B = '/repo/b'
const row = (attempt: number, root?: string, extra: Record<string, unknown> = {}) => ({ task: 'OPS-4', subtask: 'main', attempt, kind: 'spawn', lineage: attempt, tier: 'standard', alias: 'sonnet', verdict: 'consistent', at: attempt, ...(root ? { root } : {}), ...extra })

describe('MOD-117: the key helpers', () => {
  test('scopedId folds the repo into the id, MOD-97\'s form; no repo (a session with no root) is the bare id', () => {
    expect(scopedId('OPS-4', A)).toBe('OPS-4@/repo/a')
    expect(scopedId('OPS-4', `${A}/`)).toBe('OPS-4@/repo/a')
    expect(scopedId('OPS-4/api', A)).toBe('OPS-4/api@/repo/a')
    expect(scopedId('OPS-4', '')).toBe('OPS-4')
    expect(trimRepo('/')).toBe('/')
    expect(scopedId('OPS-4', '/')).toBe('OPS-4@/')
  })

  test('scopedAttemptKey puts the repo after the label, before a replay lane and the lineage', () => {
    expect(scopedAttemptKey('OPS-4:1:2', A)).toBe('OPS-4@/repo/a:1:2')
    expect(scopedAttemptKey('OPS-4/api:1:1', A)).toBe('OPS-4/api@/repo/a:1:1')
    expect(scopedAttemptKey('OPS-4@replay-abc:1:1', A)).toBe('OPS-4@/repo/a@replay-abc:1:1')
    expect(scopedAttemptKey('OPS-4:review-k1:1', A)).toBe('OPS-4@/repo/a:review-k1:1')
  })

  test('rowRoot reads a row\'s root, else its repo; anything else names none', () => {
    expect(rowRoot({ root: `${A}/` })).toBe(A)
    expect(rowRoot({ repo: B })).toBe(B)
    expect(rowRoot({ root: A, repo: B })).toBe(A)
    expect(rowRoot({ root: 'relative' })).toBeUndefined()
    expect(rowRoot('high')).toBeUndefined()
    expect(rowRoot([{ root: A }])).toBeUndefined()
    expect(migratedLine(1)).toBe("store: moved 1 per-task key to their repo's key (MOD-117)")
    expect(migratedLine(3)).toBe("store: moved 3 per-task keys to their repo's key (MOD-117)")
  })
})

describe('MOD-117: the migration plan', () => {
  test('a bare ledger with rows of two roots and a row with none splits by row: each root its key, the rootless row to the session root', () => {
    const plan = migrationPlan([['delegation.tasks.OPS-4', [row(1, A), row(2, B), row(3)]]], A)
    expect(Object.fromEntries(plan.set)).toEqual({
      'delegation.tasks.OPS-4@/repo/a': [row(1, A), row(3)],
      'delegation.tasks.OPS-4@/repo/b': [row(2, B)],
    })
    expect(plan.delete).toEqual(['delegation.tasks.OPS-4'])
  })

  test('rows already at a scoped key stay first, and a row there already is not written twice', () => {
    const held = [row(1, B, { sha: 'x' })]
    const plan = migrationPlan([['delegation.tasks.OPS-4@/repo/b', held], ['delegation.tasks.OPS-4', [row(1, B, { sha: 'x' }), row(2, B)]]], A)
    expect(Object.fromEntries(plan.set)).toEqual({ 'delegation.tasks.OPS-4@/repo/b': [...held, row(2, B)] })
  })

  test('every other per-task family goes to the session root\'s key (or the root its value names); a value already there wins', () => {
    const plan = migrationPlan(
      [
        ['delegation.outside.OPS-4', { at: 1, briefPath: '/x', roots: [] }],
        ['delegation.effort.OPS-4', 'high'],
        ['delegation.classifier.OPS-4', { card: 'standard', classifier: 'economy' }],
        ['delegation.taskRepo.OPS-9', B],
        ['delegation.mergePrep.OPS-4', { head: 'h', at: 1 }],
        ['delegation.mergePrep.OPS-4@/repo/a', { head: 'newer', at: 2 }],
        ['delegation.posted.OPS-4:1:1', true],
        ['delegation.postedRow.OPS-4@replay-ab:1:1', 'row'],
      ],
      A,
    )
    expect(Object.fromEntries(plan.set)).toEqual({
      'delegation.outside.OPS-4@/repo/a': { at: 1, briefPath: '/x', roots: [] },
      'delegation.effort.OPS-4@/repo/a': 'high',
      'delegation.classifier.OPS-4@/repo/a': { card: 'standard', classifier: 'economy' },
      'delegation.taskRepo.OPS-9@/repo/a': B,
      'delegation.posted.OPS-4@/repo/a:1:1': true,
      'delegation.postedRow.OPS-4@/repo/a@replay-ab:1:1': 'row',
    })
    expect(plan.delete).toEqual([
      'delegation.outside.OPS-4',
      'delegation.effort.OPS-4',
      'delegation.classifier.OPS-4',
      'delegation.taskRepo.OPS-9',
      'delegation.mergePrep.OPS-4',
      'delegation.posted.OPS-4:1:1',
      'delegation.postedRow.OPS-4@replay-ab:1:1',
    ])
  })

  test('idempotent: scoped keys, session keys and other families are never moved; no session root moves nothing', () => {
    const entries: [string, unknown][] = [
      ['delegation.tasks.OPS-4@/repo/a', [row(1, A)]],
      ['delegation.outside.OPS-4@/repo/b', { roots: [] }],
      ['delegation.posted.OPS-4@/repo/a:1:1', true],
      ['delegation.spawn.toolu_1', { task: 'OPS-4' }],
      ['delegation.recent.sess-1', []],
      ['delegation.handoff./repo/a/.delegation/briefs/OPS-4.brief.md', { cwd: '/w' }],
      ['delegation.agentTypes', ['general-purpose']],
    ]
    expect(migrationPlan(entries, A)).toEqual({ set: [], delete: [] })
    expect(migrationPlan([['delegation.tasks.OPS-4', [row(1, A)]]], '')).toEqual({ set: [], delete: [] })
  })
})

describe('MOD-117: retention walks the scoped keys', () => {
  test('a closed id\'s old keys go in every repo\'s key space; an id still open keeps its keys', () => {
    const NOW = 100 * RETAIN_MS
    const old = NOW - RETAIN_MS - 1
    const plan = retentionPlan({
      entries: [
        ['delegation.tasks.OPS-4@/repo/a', [row(1, A, { at: old })]],
        ['delegation.tasks.OPS-4@/repo/b', [row(1, B, { at: old })]],
        ['delegation.outside.OPS-4@/repo/a', { at: old, roots: [] }],
        ['delegation.posted.OPS-4@/repo/b:1:1', true],
        ['delegation.tasks.OPS-5@/repo/a', [row(1, A, { task: 'OPS-5', at: old })]],
        ['delegation.effort.OPS-5@/repo/a', 'high'],
      ],
      open: ['OPS-5'],
      now: NOW,
    })
    expect(plan.delete.sort()).toEqual(['delegation.outside.OPS-4@/repo/a', 'delegation.posted.OPS-4@/repo/b:1:1', 'delegation.tasks.OPS-4@/repo/a', 'delegation.tasks.OPS-4@/repo/b'])
  })
})

describe('MOD-117: session start moves the bare keys', () => {
  test('a store seeded with mixed-root rows under a bare key: each root gets its rows, the rootless row is this root\'s, the bare key is gone, one debug line says how many moved', async ($, on) => {
    const w = world(on, {
      store: {
        'delegation.tasks.OPS-4': [row(1, B), row(2, ROOT), row(3)],
        'delegation.outside.OPS-4': { at: 1, briefPath: '/b', roots: [] },
        'delegation.effort.OPS-4': 'high',
        'delegation.posted.OPS-4:1:2': true,
      },
    })
    await $.session.start(sessionStart)
    expect(w.store.get(`delegation.tasks.OPS-4@${B}`)).toEqual([row(1, B)])
    expect(w.store.get(`delegation.tasks.OPS-4@${ROOT}`)).toEqual([row(2, ROOT), row(3)])
    expect(w.store.get(`delegation.outside.OPS-4@${ROOT}`)).toEqual({ at: 1, briefPath: '/b', roots: [] })
    expect(w.store.get(`delegation.effort.OPS-4@${ROOT}`)).toBe('high')
    expect(w.store.get(`delegation.posted.OPS-4@${ROOT}:1:2`)).toBe(true)
    for (const bare of ['delegation.tasks.OPS-4', 'delegation.outside.OPS-4', 'delegation.effort.OPS-4', 'delegation.posted.OPS-4:1:2']) expect(w.store.has(bare)).toBe(false)
    expect(w.debugLogs.filter(l => l.includes('per-task key'))).toEqual(["chassis-delegation: store: moved 4 per-task keys to their repo's key (MOD-117)"])
    // a second start finds nothing bare: nothing moves, nothing is said
    const before = new Map(w.store)
    await $.session.start(sessionStart)
    expect(new Map(w.store)).toEqual(before)
    expect(w.debugLogs.filter(l => l.includes('per-task key'))).toHaveLength(1)
  })
})

describe('MOD-243: the migration marker', () => {
  test('a successful run writes delegation.migrated.<root> = the mod version; a start that finds it reads no key list', async ($, on) => {
    const w = world(on, { store: { 'delegation.tasks.OPS-4': [row(2, ROOT)] } })
    await $.session.start(sessionStart)
    expect(w.store.get(`delegation.migrated.${ROOT}`)).toBe(MOD_VERSION)
    expect(w.store.has('delegation.tasks.OPS-4')).toBe(false)
    const reads = w.storeKeyReads
    await $.session.start(sessionStart)
    expect(w.storeKeyReads).toBe(reads)
  })

  test('with the marker present, a bare key found later moves at the first per-task read of its task', async ($, on) => {
    const brief = `${SCRATCH}/briefs/T-5.brief.md`
    const header = '[[brief v=1 task=T-5 subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid=b/** gate=prettier budget=3-attempts report=chassis.report.v1]]'
    const old = row(1, ROOT, { task: 'T-5', toolUseId: 'old', agentId: 'ag-old' })
    const w = world(on, { files: { [brief]: header + '\nbody' }, dirs: { [`${ROOT}-T-5`]: [] }, agentId: 'agent-5', store: { [`delegation.migrated.${ROOT}`]: MOD_VERSION, 'delegation.prune': { at: 1_000_000, bytes: 100 }, 'delegation.tasks.T-5': [old] } })
    await $.session.start(sessionStart)
    expect(w.storeKeyReads).toBe(0)
    expect(w.store.has('delegation.tasks.T-5')).toBe(true)
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${brief}. Read it whole, then follow it exactly.`, cwd: `${ROOT}-T-5` }))
    expect(w.store.has('delegation.tasks.T-5')).toBe(false)
    const moved = (w.store.get(`delegation.tasks.T-5@${ROOT}`) ?? []) as { attempt: number }[]
    expect(moved.map(r => r.attempt)).toContain(1)
    expect(moved.length).toBe(2)
    expect(w.storeKeyReads).toBe(0)
  })
})
