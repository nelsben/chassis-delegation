import { test, expect, describe } from 'claude-code/testing'
import { MIB, PRESSURE_BYTES, RETAIN_MS, TARGET_BYTES, prunedLine, refusedRow, refusedWritesLine, retentionPlan, storeBytes, storeLine, type StoreEntry } from '../hooks/lib/retention'

// MOD-89 (#157, #159): what the mod deletes from its store so a set is never refused at the host's 4 MiB cap.
const NOW = 100 * 24 * 60 * 60 * 1000
const DAY = 24 * 60 * 60 * 1000
const spawn = (key: string, task: string, at: number, extra: Record<string, unknown> = {}): StoreEntry => [
  `delegation.spawn.${key}`,
  { key, task, subtask: 'main', adhoc: false, attempt: 1, lineage: 1, tier: 'standard', alias: 'sonnet', budget: 2, purpose: 'build', description: task, subagentType: 'general-purpose', agentId: `ag-${key}`, at, verdictAttempt: 1, ...extra },
]
const attempts = (task: string, at: number, verdict = 'consistent', key = `k-${task}`): StoreEntry => [
  `delegation.tasks.${task}`,
  [{ task, subtask: 'main', attempt: 1, kind: 'spawn', lineage: 1, tier: 'standard', alias: 'sonnet', verdict, at, verdictAt: at + 1000, toolUseId: key, agentId: `ag-${key}` }],
]
const plan = (entries: StoreEntry[], open: string[] = []) => retentionPlan({ entries, open, now: NOW })

describe('MOD-89: the retention plan', () => {
  test('a closed task older than 7 days goes, with every record that hangs off it', () => {
    const old = NOW - 8 * DAY
    const entries: StoreEntry[] = [
      attempts('T-1', old),
      spawn('k-T-1', 'T-1', old),
      ['delegation.agent.ag-k-T-1', 'k-T-1'],
      ['delegation.agentName.worker-1', 'ag-k-T-1'],
      ['delegation.cost.ag-k-T-1', { attempt: 1, spend: { usd: 1 } }],
      ['delegation.posted.T-1:1:1', true],
      ['delegation.postedRow.T-1:1:1', 'T-1 consistent'],
      ['delegation.handoff./r/.delegation/briefs/T-1.brief.md', { cwd: '/trees/T-1', at: old }],
      ['delegation.effort.T-1', 'high'],
      ['delegation.classifier.T-1', { card: 'standard', classifier: 'standard' }],
      ['delegation.outside.T-1', { at: old, briefPath: '/b', roots: [] }],
    ]
    expect(plan(entries).delete.sort()).toEqual(entries.map(e => e[0]).sort())
  })

  test('an open task is kept whatever its age: running, pending verdict or queued, by task id or by label', () => {
    const ancient = NOW - 60 * DAY
    const entries: StoreEntry[] = [attempts('T-2', ancient), spawn('k-T-2', 'T-2', ancient), ['delegation.agent.ag-k-T-2', 'k-T-2'], attempts('T-3', ancient), spawn('k-T-3', 'T-3', ancient, { subtask: 'api' })]
    expect(plan(entries, ['T-2', 'T-3/api']).delete).toEqual([])
    expect(plan(entries, ['T-2']).delete.sort()).toEqual(['delegation.spawn.k-T-3', 'delegation.tasks.T-3'])
  })

  test('a record younger than 7 days is kept while the store is small', () => {
    const fresh = NOW - 6 * DAY
    expect(plan([attempts('T-4', fresh), spawn('k-T-4', 'T-4', fresh)]).delete).toEqual([])
  })

  test('the newest timestamp counts: a spawn of 10 days ago whose task had an attempt yesterday stays', () => {
    const entries: StoreEntry[] = [attempts('T-5', NOW - DAY, 'consistent', 'k-T-5'), spawn('k-T-5', 'T-5', NOW - 10 * DAY)]
    expect(plan(entries).delete).toEqual([])
  })

  test('a record with no timestamp is left alone, and so is every session-level and global key', () => {
    const entries: StoreEntry[] = [
      ['delegation.agent.ag-gone', 'k-gone'],
      ['delegation.effort.T-6', 'low'],
      ['delegation.recent.sess-1', [{ task: 'T-1', attempt: 1, verdict: 'consistent', line: 'x', at: 1 }]],
      ['delegation.debrief.sess-1', { lastAt: 1, watermark: 0, lines: 0, sessionId: 'sess-1' }],
      ['delegation.friction.sess-1', { total: 0, events: [] }],
      ['delegation.brain.1', { at: 1 }],
      ['delegation.adhoc', [{ task: 'adhoc-1', at: 1 }]],
      ['delegation.evals', [{ at: 1 }]],
      ['delegation.alias.sonnet', { id: 'claude-sonnet-5-5', since: 1 }],
      ['delegation.updateCheck', { at: 1, behind: 0 }],
    ]
    expect(plan(entries).delete).toEqual([])
  })

  test('the keys come back oldest first', () => {
    const entries: StoreEntry[] = [spawn('k-b', 'T-b', NOW - 9 * DAY), spawn('k-a', 'T-a', NOW - 30 * DAY), spawn('k-c', 'T-c', NOW - 8 * DAY)]
    expect(plan(entries).delete).toEqual(['delegation.spawn.k-a', 'delegation.spawn.k-b', 'delegation.spawn.k-c'])
  })

  test('over 3.5 MiB, closed records younger than 7 days go too, oldest first, until the store is under 3 MiB; open tasks stay', () => {
    const pad = 'x'.repeat(100 * 1024)
    const entries: StoreEntry[] = []
    // 40 closed tasks of 100 KiB each, a minute apart (4 MiB), plus one big open task
    for (let i = 0; i < 40; i++) entries.push(spawn(`k${String(i).padStart(2, '0')}`, `T-${i}`, NOW - DAY + i * 60_000, { pad }))
    entries.push(spawn('k-open', 'T-open', NOW - 2 * DAY, { pad }))
    const before = storeBytes(entries)
    expect(before).toBeGreaterThan(PRESSURE_BYTES)
    const p = plan(entries, ['T-open'])
    expect(p.before).toBe(before)
    expect(p.after).toBeLessThan(TARGET_BYTES)
    expect(p.delete).not.toContain('delegation.spawn.k-open')
    // the oldest ones went, in order, and no more than were needed
    const n = p.delete.length
    expect(p.delete).toEqual(Array.from({ length: n }, (_, i) => `delegation.spawn.k${String(i).padStart(2, '0')}`))
    const kept = entries.filter(e => !p.delete.includes(e[0]))
    expect(storeBytes(kept)).toBe(p.after)
    expect(p.after + 100 * 1024).toBeGreaterThanOrEqual(TARGET_BYTES)
  })

  test('between 3 and 3.5 MiB nothing young is deleted', () => {
    const pad = 'x'.repeat(100 * 1024)
    const entries: StoreEntry[] = []
    for (let i = 0; i < 33; i++) entries.push(spawn(`k${i}`, `T-${i}`, NOW - DAY, { pad }))
    expect(storeBytes(entries)).toBeGreaterThan(TARGET_BYTES)
    expect(storeBytes(entries)).toBeLessThan(PRESSURE_BYTES)
    expect(plan(entries).delete).toEqual([])
  })

  test('a pending attempt younger than 7 days counts as open under pressure (a worker of another session)', () => {
    const pad = 'x'.repeat(100 * 1024)
    const entries: StoreEntry[] = []
    for (let i = 0; i < 40; i++) entries.push(spawn(`k${i}`, `T-${i}`, NOW - DAY, { pad }), attempts(`T-${i}`, NOW - DAY, 'pending', `k${i}`))
    expect(plan(entries).delete).toEqual([])
  })

  test('the store is measured as the host would: the compact JSON text of the whole object, in UTF-8 bytes', () => {
    const entries: StoreEntry[] = [
      ['a', 1],
      ['b', 'é'],
    ]
    expect(storeBytes(entries)).toBe(16) // {"a":1,"b":"é"}: 15 characters, é two bytes
    expect(storeBytes([])).toBe(2)
  })

  test('the constants and the lines', () => {
    expect(RETAIN_MS).toBe(7 * DAY)
    expect(PRESSURE_BYTES).toBe(3.5 * MIB)
    expect(TARGET_BYTES).toBe(3 * MIB)
    expect(prunedLine(424, 3.999 * MIB, 2.5 * MIB)).toBe('store: pruned 424 records (3.99 MiB to 2.50 MiB of 4 MiB)')
    expect(storeLine(1.25 * MIB)).toBe('store: 1.25 MiB of 4 MiB')
    expect(refusedWritesLine(3, 'delegation.spawn.k1')).toBe('store: 3 writes refused this session (last delegation.spawn.k1)')
    expect(refusedRow('delegation.spawn.k1', 'store over 4 MiB')).toBe('store write failed: delegation.spawn.k1 (store over 4 MiB); new workers may have no verdict until the store is pruned')
  })
})
