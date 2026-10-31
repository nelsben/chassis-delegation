import { test, expect, describe } from 'claude-code/testing'
import { world, spawnInput, turnInput, sessionStart, delegationCommand, ROOT, NOW as WNOW, SCRATCH } from './harness'
import { MOD_VERSION } from '../hooks/lib/version'
import { FULL_SCAN_MS, SizeEstimate, entryBytes, scanDue, MIB, PRESSURE_BYTES, RATION_RETAIN_MS, RETAIN_MS, TARGET_BYTES, prunedLine, refusedRow, refusedWritesLine, retentionPlan, slimSpawns, storeBytes, storeLine, type StoreEntry } from '../hooks/lib/retention'

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

  test('MOD-97: a task\'s records for another repo (<ID>@<repo>) are pruned with its family, and kept while it is open', () => {
    const old = NOW - 8 * DAY
    const entries: StoreEntry[] = [
      [`delegation.tasks.T-7@/other`, (attempts('T-7', old)[1] as unknown[])],
      spawn('k-T-7', 'T-7', old),
      ['delegation.outside.T-7@/other', { at: old, briefPath: '/b', roots: [] }],
      ['delegation.posted.T-7@/other:1:1', true],
    ]
    expect(plan(entries).delete.sort()).toEqual(entries.map(e => e[0]).sort())
    expect(plan(entries, ['T-7']).delete).toEqual([])
    // a pending attempt of another repo's task is open too
    const pending: StoreEntry[] = [[`delegation.tasks.T-8@/other`, attempts('T-8', NOW - DAY, 'pending')[1] as unknown[]], ['delegation.effort.T-8@/other', 'high']]
    const pad = 'x'.repeat(100 * 1024)
    for (let i = 0; i < 40; i++) pending.push(spawn(`k${i}`, `T-${i}`, NOW - DAY + i, { pad }))
    pending.push(spawn('k-T-8', 'T-8', NOW - DAY, { pad }))
    expect(plan(pending).delete).not.toContain('delegation.spawn.k-T-8')
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

  test('a record with no timestamp is left alone; global keys are never pruned; MOD-233: session keys age out after 14 days', () => {
    const entries: StoreEntry[] = [
      ['delegation.agent.ag-gone', 'k-gone'],
      ['delegation.effort.T-6', 'low'],
      ['delegation.recent.sess-1', [{ task: 'T-1', attempt: 1, verdict: 'consistent', line: 'x' }]],
      ['delegation.brain.1', { at: 1 }],
      ['delegation.postAsk.1', { at: 1 }],
      ['delegation.adhoc', [{ task: 'adhoc-1', at: 1 }]],
      ['delegation.evals', [{ at: 1 }]],
      ['delegation.alias.sonnet', { id: 'claude-sonnet-5-5', since: 1 }],
      ['delegation.updateCheck', { at: 1, behind: 0 }],
    ]
    expect(plan(entries).delete).toEqual([])
  })

  test('MOD-233: a recent.<old sid> key whose newest row is 15 days old is in the delete list, and the live session\'s recent key is not', () => {
    const row = (at: number) => ({ task: 'T-1', attempt: 1, verdict: 'consistent', line: 'x', at })
    const entries: StoreEntry[] = [
      ['delegation.recent.old', [row(NOW - 20 * DAY), row(NOW - 15 * DAY)]],
      ['delegation.recent.fresh', [row(NOW - 20 * DAY), row(NOW - 13 * DAY)]],
      ['delegation.recent.live', [row(NOW - 15 * DAY)]],
      ['delegation.debrief.old', { lastAt: NOW - 15 * DAY, watermark: 0, lines: 0, sessionId: 'old' }],
      ['delegation.merged.old', [{ task: 'T-1', sha: 'a', at: NOW - 16 * DAY }]],
      ['delegation.notes.old', { at: NOW - 16 * DAY, path: '/p' }],
      ['delegation.friction.old', { total: 1, events: [{ kind: 'denial', at: NOW - 16 * DAY }] }],
      ['delegation.friction.fresh', { total: 1, events: [{ kind: 'denial', at: NOW - 16 * DAY }, { kind: 'denial', at: NOW - DAY }] }],
      ['delegation.friction.live', { total: 1, events: [{ kind: 'denial', at: NOW - 16 * DAY }] }],
    ]
    const live = ['delegation.recent.live', 'delegation.friction.live']
    expect(retentionPlan({ entries, open: [], now: NOW, keep: live }).delete.sort()).toEqual(['delegation.debrief.old', 'delegation.friction.old', 'delegation.merged.old', 'delegation.notes.old', 'delegation.recent.old'])
    // under store pressure a session key still waits its 14 days
    const big: StoreEntry = ['delegation.junk', 'x'.repeat(PRESSURE_BYTES)]
    expect(retentionPlan({ entries: [...entries, big], open: [], now: NOW, keep: live }).delete).not.toContain('delegation.recent.fresh')
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

  test('MOD-128: a ration day record is kept 14 days by its lastAt, groups under no task, and an open task never holds it', () => {
    const day = (name: string, lastAt: number): StoreEntry => [`delegation.ration.seven_day.${name}`, { startPct: 0, startAt: lastAt - 1000, resetsAt: lastAt + DAY, lastPct: 5, lastAt, used: 5 }]
    const entries: StoreEntry[] = [day('old', NOW - 15 * DAY), day('mid', NOW - 10 * DAY), day('new', NOW - DAY)]
    expect(RATION_RETAIN_MS).toBe(14 * DAY)
    expect(plan(entries).delete).toEqual(['delegation.ration.seven_day.old'])
    expect(plan(entries, ['seven_day']).delete).toEqual(['delegation.ration.seven_day.old'])
    // under store pressure a ration record younger than 14 days still stays: it is no task's
    const big: StoreEntry = ['delegation.junk', 'x'.repeat(PRESSURE_BYTES)]
    expect(plan([...entries, big]).delete).toEqual(['delegation.ration.seven_day.old'])
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

describe('MOD-233: posted verdict text is dropped after a day', () => {
  const key = (n: string) => `T-9:1:${n}`
  const ak = (s: Record<string, unknown>) => `T-9:1:${s.attempt}`
  const withBlock = (at: number): StoreEntry => spawn('k-9', 'T-9', at, { verdictBlock: 'first line\nsecond', verdictLine: 'first line' })
  test('a posted verdict over 24 h old keeps its first line; a younger or unposted one keeps everything; a second run lists nothing', () => {
    const old = NOW - 2 * DAY
    const posted: StoreEntry[] = [withBlock(old), ['delegation.posted.T-9:1:1', true], ['delegation.postedRow.T-9:1:1', 'row']]
    const p = slimSpawns(posted, NOW, ak)
    expect(p.drop).toEqual(['delegation.postedRow.T-9:1:1'])
    expect(p.rewrite).toHaveLength(1)
    const v = p.rewrite[0]!.value
    expect(v.verdictSummary).toBe('first line')
    expect('verdictBlock' in v || 'verdictLine' in v).toBe(false)
    expect(slimSpawns([[p.rewrite[0]!.key, v], ...posted.slice(1)], NOW, ak).rewrite).toEqual([])
    expect(slimSpawns([withBlock(NOW - 3600_000), ...posted.slice(1)], NOW, ak).rewrite).toEqual([])
    expect(slimSpawns([withBlock(old)], NOW, ak).rewrite).toEqual([])
    expect(key('1')).toBe('T-9:1:1')
  })
})


// MOD-243: a verdict stops reading every key in the store when the running estimate is under the pressure line.
const VBRIEF = `${SCRATCH}/briefs/T-5.brief.md`
const VHEADER = '[[brief v=1 task=T-5 subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid=b/** gate=prettier budget=3-attempts report=chassis.report.v1]]'
const VPROMPT = `Your brief is the file ${VBRIEF}. Read it whole, then follow it exactly.`
const VREPORT = '[[report v=1 task=T-5 subtask=main branch=agent/frontend/T-5 pr=none sha=1111111 gate=pass files=a/x.ts]]'
const flush = async () => {
  for (let i = 0; i < 300; i++) await Promise.resolve()
  await new Promise(r => setTimeout(r, 20))
  for (let i = 0; i < 300; i++) await Promise.resolve()
}

describe('MOD-243: the estimate decides when the full scan is worth it', () => {
  test('a verdict in a store under the pressure line, scanned an hour ago, reads no key list and fewer than 30 keys', { options: { gateMap: '{"prettier":"npx prettier --check {files}"}' } }, async ($, on) => {
    const store: Record<string, unknown> = { 'delegation.prune': { at: WNOW - 3_600_000, bytes: 200_000 }, [`delegation.migrated.${ROOT}`]: MOD_VERSION }
    for (let i = 0; i < 500; i++) store[`delegation.unrelated.${i}`] = { n: i }
    const w = world(on, { files: { [VBRIEF]: VHEADER + '\nbody' }, dirs: { [`${ROOT}-T-5`]: [] }, run: (argv: string[]) => (argv[0] === 'npx' ? { exitCode: 0, stdout: '' } : undefined), agentId: 'agent-5', store })
    await $.agent.spawn(spawnInput({ prompt: VPROMPT, cwd: `${ROOT}-T-5` }))
    const keys0 = w.storeKeyReads
    const gets0 = w.storeGets
    await $.turn.complete(turnInput('agent-5', 'Done.\n' + VREPORT))
    await flush()
    expect(w.storeKeyReads - keys0).toBe(0)
    expect(w.storeGets - gets0).toBeLessThan(30)
  })

  const scanned = async (prune: unknown, extra: Record<string, unknown> = {}) => {
    const store: Record<string, unknown> = { [`delegation.migrated.${ROOT}`]: MOD_VERSION, ...(prune === undefined ? {} : { 'delegation.prune': prune }), ...extra }
    for (let i = 0; i < 50; i++) store[`delegation.unrelated.${i}`] = { n: i }
    return store
  }
  test('session start scans when the last scan is a day old, and records it; a recent one under the line does not', async ($, on) => {
    const stale = world(on, { store: await scanned({ at: WNOW - FULL_SCAN_MS - 1, bytes: 1000 }) })
    await $.session.start(sessionStart)
    expect(stale.storeKeyReads).toBeGreaterThan(0)
    expect(stale.store.get('delegation.prune')).toMatchObject({ at: WNOW })
  })

  test('session start with a recent scan under the line reads no key list', async ($, on) => {
    const w = world(on, { store: await scanned({ at: WNOW - 1000, bytes: 1000 }) })
    await $.session.start(sessionStart)
    expect(w.storeKeyReads).toBe(0)
    expect(w.store.get('delegation.prune')).toEqual({ at: WNOW - 1000, bytes: 1000 })
  })

  test('a recorded size over the pressure line scans', async ($, on) => {
    const w = world(on, { store: await scanned({ at: WNOW - 1000, bytes: PRESSURE_BYTES + 10 }) })
    await $.session.start(sessionStart)
    expect(w.storeKeyReads).toBeGreaterThan(0)
    expect((w.store.get('delegation.prune') as { bytes: number }).bytes).toBeLessThan(PRESSURE_BYTES)
  })

  test('/delegation reports the size from the estimate with no key list read', async ($, on) => {
    const w = world(on, { store: await scanned({ at: WNOW - 1000, bytes: 1.5 * MIB }) })
    const text = String((await $.command.run(delegationCommand)).text)
    expect(text).toContain('store: 1.50 MiB of 4 MiB')
    // the 50 unrelated keys are not each read for the figure
    expect(w.storeGets).toBeLessThan(40)
  })
})

describe('MOD-243: the scan decision and the running estimate', () => {
  const last = { at: 1000, bytes: 1000 }
  test('the scan is due on a refused write, no record, no estimate, pressure, or a scan 24 h old', () => {
    const base = { last, estimate: 1000, now: 2000, refused: false }
    expect(scanDue(base)).toBe(false)
    expect(scanDue({ ...base, refused: true })).toBe(true)
    expect(scanDue({ ...base, last: undefined })).toBe(true)
    expect(scanDue({ ...base, estimate: undefined })).toBe(true)
    expect(scanDue({ ...base, estimate: PRESSURE_BYTES + 1 })).toBe(true)
    expect(scanDue({ ...base, estimate: PRESSURE_BYTES })).toBe(false)
    expect(scanDue({ ...base, now: 1000 + FULL_SCAN_MS - 1 })).toBe(false)
    expect(scanDue({ ...base, now: 1000 + FULL_SCAN_MS })).toBe(true)
  })

  test('a set adds the value\'s bytes, a rewrite the difference, a delete what was known', () => {
    const e = new SizeEstimate()
    expect(e.bytes).toBeUndefined()
    e.seed(100)
    e.seed(999)
    expect(e.bytes).toBe(100)
    e.set('a', 'xx')
    const first = entryBytes('a', 'xx') + 1
    expect(e.bytes).toBe(100 + first)
    e.set('a', 'xxxx')
    expect(e.bytes).toBe(100 + entryBytes('a', 'xxxx') + 1)
    e.delete('a')
    expect(e.bytes).toBe(100)
    e.delete('never-seen')
    expect(e.bytes).toBe(100)
    e.reset(50)
    expect(e.bytes).toBe(50)
  })

  test('the plan leaves the prune record and the migration marker alone', () => {
    const entries: StoreEntry[] = [['delegation.prune', { at: 1, bytes: 2 }], ['delegation.migrated./r', '0.9.40']]
    expect(plan(entries).delete).toEqual([])
  })
})
