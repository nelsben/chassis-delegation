import { test, expect, describe } from 'claude-code/testing'
import { world, spawnInput, turnInput, sessionStart, ROOT, SCRATCH, NOW, type RunAnswer } from './harness'
import { FIXTURE_CARD, FIXTURE_CARD_NAME } from './fixtures/sample-card'
import { latestVerdictRow } from '../hooks/lib/mergecmd'
import { ledgerHas } from '../hooks/lib/attempts'
import { fieldsOfRow, latestSpawnRow, parseLedger, spawnRow, verdictAfter, withTail, type SpawnRow } from '../hooks/lib/storeloss'

// MOD-94 (#157, #159): a worker whose store record was refused still counts and still gets a verdict.
// The hook counts live workers from its own memory, the spawn appends a spawn row to the ledger, and the
// verifier falls back to memory, then the ledger spawn row plus the brief.

const LEDGER = `${ROOT}/.delegation/ledger.jsonl`
const ledgerOf = (w: { files: Map<string, string> }) => (w.files.get(LEDGER) ?? '').trim().split('\n').filter(Boolean).map(l => JSON.parse(l) as Record<string, unknown>)
const delivered = (w: { appended: { text: string }[]; logs: string[] }) => [...w.appended.map(a => a.text), ...w.logs].join('\n')
const resultText = (r: { result?: unknown; text?: string }) => (typeof r.result === 'string' ? r.result : r.text ?? '')
const brief = (task: string) => `[[brief v=1 task=${task} subtask=main purpose=build tier=standard]]\nDo it.`
const DISPATCH = 'mcp__chassis-delegation__dispatch'
const VERDICT = 'mcp__chassis-delegation__verdict'

/** The host refusing every spawn, agent and tasks write, as it does past its 4 MiB cap (#157); every other write lands. */
const refusing = (on: any, w: { store: Map<string, unknown> }) =>
  on('store.set', (_$: unknown, e: { key: string; value: unknown }) => {
    if (/^delegation\.(spawn|agent|tasks)\./.test(e.key)) return { deny: 'store over 4 MiB' } as never
    w.store.set(e.key, JSON.parse(JSON.stringify(e.value)))
    return { value: undefined } as never
  })

const T4 = `${SCRATCH}/briefs/T-4.brief.md`
const T4_HEADER = '[[brief v=1 task=T-4 subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid=b/** gate=prettier budget=3-attempts report=chassis.report.v1]]'
const REPORT = '[[report v=1 task=T-4 subtask=main branch=agent/frontend/T-4 pr=none sha=1234abcd gate=pass files=a/x.ts]]'
const GM = { gateMap: '{"prettier":"npx prettier --check {files}"}' }
const MB = 'b'.repeat(40)
/** A worker repo answered from memory: the branch and sha exist, the tree is clean, the delta is a/x.ts, the gate is green. */
const repo = () => {
  let head = ''
  return (argv: string[]): RunAnswer | undefined => {
    if (argv[0] === 'npx') return { exitCode: 0, stdout: '' }
    if (argv[0] !== 'git') return undefined
    const sub = argv.slice(3)
    const last = sub[sub.length - 1] ?? ''
    if (sub[0] === 'rev-parse' && last.endsWith('^{commit}')) {
      head = last.slice(0, -'^{commit}'.length).padEnd(40, '0')
      return { exitCode: 0, stdout: `${head}\n` }
    }
    if (sub[0] === 'rev-parse' && sub[1] === '--verify') return { exitCode: 0, stdout: `${last === 'origin/main' ? MB : head}\n` }
    if (sub[0] === 'rev-parse' && last === 'HEAD' && sub[1] !== '--abbrev-ref') return { exitCode: 0, stdout: `${head}\n` }
    if (sub[0] === 'merge-base' && sub[1] !== '--is-ancestor') return { exitCode: 0, stdout: `${MB}\n` }
    if (sub[0] === 'diff') return { exitCode: 0, stdout: 'A\ta/x.ts\n' }
    return undefined
  }
}
/** The worker's transcript, ending with its SubagentHandback (GH-2). */
const handedBack = (message: string) => [
  { role: 'user', text: `Your brief is the file ${T4}.`, toolUses: [] },
  { role: 'assistant', text: 'Handed back.', toolUses: [{ tool_use_id: 'toolu_hb01', tool: 'SubagentHandback', input: { message } }] },
]
/** The spawn row an earlier process wrote for T-4 attempt 1 (agent-4). */
const SPAWN_ROW = { event: 'spawn', task: 'T-4', subtask: 'main', attempt: 1, lineage: 1, budget: 3, tier: 'standard', alias: 'sonnet', agentId: 'agent-4', toolUseId: 'toolu_01ABCDEFGH', briefPath: T4, purpose: 'build', subagentType: 'general-purpose', description: 'task', at: NOW - 60_000, sessionId: 'sess-0' }

describe('MOD-94 (#159): the live count survives a refused spawn record', () => {
  test('a store refusing every spawn and tasks write, maxWorkers 2: two briefed spawns start, a third is queued by the hook and by dispatch', { options: { maxWorkers: 2, briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const w = world(on, {
      skip: ['store.set'],
      listAgents: true,
      files: { [`${ROOT}/agents/tasks/${FIXTURE_CARD_NAME}`]: FIXTURE_CARD },
      dirs: { [`${ROOT}/agents/tasks`]: [FIXTURE_CARD_NAME] },
      store: { 'delegation.agentTypes': ['general-purpose', 'backend', 'frontend'] },
    })
    refusing(on, w)
    await $.session.start(sessionStart)
    expect((await $.agent.spawn(spawnInput({ prompt: brief('T-1'), tool_use_id: 'toolu_A0000001' }))).deny).toBeUndefined()
    expect((await $.agent.spawn(spawnInput({ prompt: brief('T-2'), tool_use_id: 'toolu_B0000002' }))).deny).toBeUndefined()
    expect(w.store.has('delegation.spawn.toolu_A0000001')).toBe(false)
    const third = await $.agent.spawn(spawnInput({ prompt: brief('T-3'), tool_use_id: 'toolu_C0000003' }))
    expect(third.deny).toBe('queued: T-3 — the mod will tell you when a slot frees (2 live: T-1, T-2; 1 queued: T-3; limit: maxWorkers 2 from the host options) — queued: position 1 of 1 (maxWorkers 2 running)')
    expect(w.spawns).toHaveLength(2)
    const text = resultText(await $.tool.call({ tool: DISPATCH, task: 'BE-101', scope: 'app/**' } as never))
    expect(text).toContain('queued: BE-101 — the mod will tell you when a slot frees')
    expect(w.spawns).toHaveLength(2)
  })
})

describe('MOD-94: one spawn row in the ledger per briefed spawn', () => {
  test('a briefed spawn appends one spawn row with what verifies it; an ad hoc spawn appends none', async ($, on) => {
    const w = world(on, { files: { [T4]: T4_HEADER + '\nbody' }, agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${T4}.`, cwd: `${ROOT}-T-4` }))
    await $.agent.spawn(spawnInput({ prompt: 'Look around.', tool_use_id: 'toolu_02ADHOC' }))
    const rows = ledgerOf(w)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ event: 'spawn', task: 'T-4', subtask: 'main', attempt: 1, budget: 3, tier: 'standard', alias: 'sonnet', agentId: 'agent-4', toolUseId: 'toolu_01ABCDEFGH', briefPath: T4, cwd: `${ROOT}-T-4`, purpose: 'build', at: NOW, sessionId: 'sess-1' })
    expect('verdict' in (rows[0] as object)).toBe(false)
    expect('kind' in (rows[0] as object)).toBe(false)
  })

  test('ledgerFile off: no spawn row, no file', { options: { ledgerFile: false } }, async ($, on) => {
    const w = world(on, { files: { [T4]: T4_HEADER + '\nbody' }, agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${T4}.` }))
    expect(w.files.has(LEDGER)).toBe(false)
  })
})

describe('MOD-94 (#157): a hand-back whose spawn record did not land still gets its verdict', () => {
  test('(a) the store refuses the spawn writes; the worker hands back: a consistent verdict row says where it came from, and the verdict ledger row is appended', { options: { ...GM } }, async ($, on) => {
    const w = world(on, { skip: ['store.set'], files: { [T4]: T4_HEADER + '\nbody' }, run: repo(), agentId: 'agent-4' })
    refusing(on, w)
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${T4}.` }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT))
    const row = delivered(w)
    expect(row).toContain('chassis-delegation: T-4 attempt 1/3 consistent')
    expect(row).toContain('next=accept')
    expect(row).toContain('(from memory: the store had no record)')
    // said once in the debug log (the verdict's own log line carries the row, tail and all)
    expect(w.debugLogs.filter(l => l.includes("T-4 attempt 1: judged from the hook's memory; the store had no record"))).toHaveLength(1)
    const verdicts = ledgerOf(w).filter(r => typeof r.verdict === 'string')
    expect(verdicts).toHaveLength(1)
    expect(verdicts[0]).toMatchObject({ task: 'T-4', subtask: 'main', attempt: 1, kind: 'spawn', verdict: 'consistent', next: 'accept', agentId: 'agent-4' })
    // the verdict tool, in the same process, returns the row as posted
    expect(resultText(await $.tool.call({ tool: VERDICT, task: 'T-4' } as never))).toContain('T-4 attempt 1/3 consistent')
    // a second fire of the same hand-back judges nothing again
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT))
    expect(ledgerOf(w).filter(r => typeof r.verdict === 'string')).toHaveLength(1)
  })

  test('(a) a refuted hand-back with no record: the owed list moves as it does when the record is there', { options: { ...GM } }, async ($, on) => {
    const git = repo()
    const w = world(on, { skip: ['store.set'], files: { [T4]: T4_HEADER + '\nbody' }, run: argv => (argv[0] === 'npx' ? { exitCode: 1, stdout: 'a/x.ts: not formatted\n' } : git(argv)), agentId: 'agent-4' })
    refusing(on, w)
    await $.session.start(sessionStart)
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${T4}.` }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT))
    expect(delivered(w)).toContain('T-4 attempt 1/3 refuted')
    const status = String((await $.command.run({ command: 'delegation', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as never)).text)
    expect(status).toContain('owed: T-4: resume agent=agent-4')
    expect(ledgerOf(w).filter(r => typeof r.verdict === 'string').at(-1)).toMatchObject({ task: 'T-4', attempt: 1, verdict: 'refuted' })
  })

  test('(a) a fresh hook instance (no memory, no store record): the hand-back is verified from the ledger spawn row plus the brief', { options: { ...GM } }, async ($, on) => {
    const w = world(on, { files: { [T4]: T4_HEADER + '\nbody', [LEDGER]: `${JSON.stringify(SPAWN_ROW)}\n` }, run: repo() })
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT))
    const row = delivered(w)
    expect(row).toContain('chassis-delegation: T-4 attempt 1/3 consistent')
    expect(row).toContain('(from the ledger: the store had no record)')
    expect(ledgerOf(w).at(-1)).toMatchObject({ task: 'T-4', attempt: 1, verdict: 'consistent', next: 'accept' })
  })

  test('(b) a fresh hook instance with a ledger spawn row and the brief on disk: the verdict tool runs the verifier and returns its verdict', { options: { ...GM } }, async ($, on) => {
    const w = world(on, {
      files: { [T4]: T4_HEADER + '\nbody', [LEDGER]: `${JSON.stringify(SPAWN_ROW)}\n` },
      run: repo(),
      transcripts: { 'agent-4': handedBack('All green.\n' + REPORT) },
    })
    w.agents.push({ id: 'agent-4', type: 'general-purpose', description: 'task', status: 'completed' })
    const out = resultText(await $.tool.call({ tool: VERDICT, task: 'T-4' } as never))
    expect(out).toContain('T-4 attempt 1/3 consistent')
    expect(out).toContain('(from the ledger: the store had no record)')
    expect(w.runs.some(r => r.argv[0] === 'npx')).toBe(true)
    expect(ledgerOf(w).at(-1)).toMatchObject({ task: 'T-4', attempt: 1, verdict: 'consistent', next: 'accept' })
    // asked again, it answers from what it judged, and runs nothing more
    const runs = w.runs.length
    expect(resultText(await $.tool.call({ tool: VERDICT, task: 'T-4' } as never))).toContain('T-4 attempt 1/3 consistent')
    expect(w.runs.filter(r => r.argv[0] === 'npx')).toHaveLength(1)
    expect(w.runs.length).toBeLessThanOrEqual(runs + 2)
  })

  test('(c) no store record, no memory, no ledger row: the verdict tool answers the noSuchAttempt line', async ($, on) => {
    world(on, { files: { [LEDGER]: `${JSON.stringify({ ...SPAWN_ROW, task: 'T-9' })}\n` } })
    expect(resultText(await $.tool.call({ tool: VERDICT, task: 'T-4' } as never))).toBe("T-4: no attempt recorded for this task in this session's records; check the task id")
  })
})

describe('MOD-231: the verdict tool after a review that said next=accept', () => {
  test('(e) consistent next=review then reviewed next=accept: the tool names next=accept and offers no spawn block', async ($, on) => {
    const verified = { task: 'T-4', subtask: 'main', attempt: 1, kind: 'spawn', sha: '1234abcd', verdict: 'consistent', next: 'review', agentId: 'agent-4' }
    const reviewed = { task: 'T-4', subtask: 'main', attempt: 1, kind: 'review', verdict: 'reviewed', next: 'accept' }
    world(on, { files: { [LEDGER]: [SPAWN_ROW, verified, reviewed].map(r => JSON.stringify(r)).join('\n') + '\n' } })
    const out = resultText(await $.tool.call({ tool: VERDICT, task: 'T-4' } as never))
    expect(out).toContain('T-4 attempt 1 consistent')
    expect(out).toContain('next=accept')
    expect(out).not.toContain('next=review')
    expect(out).not.toContain('```')
  })
})

describe('MOD-94: every reader of the ledger reads past a spawn row', () => {
  const VERDICT_ROW = { task: 'T-4', subtask: 'main', attempt: 1, kind: 'spawn', sha: '1234abcd', verdict: 'consistent', next: 'accept', agentId: 'agent-4' }
  const SPAWN_2 = { ...SPAWN_ROW, attempt: 2, lineage: 2, agentId: 'agent-5', toolUseId: 'toolu_02ABCDEFGH', at: NOW }
  const jsonl = (rows: object[]) => rows.map(r => JSON.stringify(r)).join('\n') + '\n'

  test('latestVerdictRow (the merge command): the newest verdict, as it was before spawn rows', () => {
    const before = latestVerdictRow(jsonl([VERDICT_ROW]), 'T-4')
    expect(before).toEqual({ verdict: 'consistent', next: 'accept', attempt: 1, sha: '1234abcd', kind: 'spawn' })
    expect(latestVerdictRow(jsonl([SPAWN_ROW, VERDICT_ROW, SPAWN_2]), 'T-4')).toEqual(before)
    expect(latestVerdictRow(jsonl([SPAWN_ROW]), 'T-4')).toBeUndefined()
  })

  test('ledgerHas: a spawn row repeated is a repeat; a verdict or accept row for the same attempt is not one of it', () => {
    const text = jsonl([SPAWN_ROW])
    expect(ledgerHas(parseLedger(text), SPAWN_ROW)).toBe(true)
    expect(ledgerHas(parseLedger(text), { ...SPAWN_ROW, sessionId: 'sess-9', at: NOW })).toBe(true)
    expect(ledgerHas(parseLedger(text), SPAWN_2)).toBe(false)
    expect(ledgerHas(parseLedger(text), VERDICT_ROW)).toBe(false)
    expect(ledgerHas(parseLedger(text), { kind: 'accept', task: 'T-4', subtask: 'main', attempt: 1, how: 'accepted' })).toBe(false)
    expect(ledgerHas(parseLedger(jsonl([VERDICT_ROW])), SPAWN_ROW)).toBe(false)
  })

  test('the spawn row, read back: by agent, by task (never a replay), judged or open', () => {
    const row = SPAWN_ROW as SpawnRow
    const replay = { ...SPAWN_2, replay: true, base: 'abc' }
    expect(latestSpawnRow(parseLedger(jsonl([SPAWN_ROW, SPAWN_2])), { agentId: 'agent-4' })).toMatchObject({ attempt: 1 })
    expect(latestSpawnRow(parseLedger(jsonl([SPAWN_ROW, SPAWN_2])), { task: 'T-4', subtask: 'main' })).toMatchObject({ attempt: 2 })
    expect(latestSpawnRow(parseLedger(jsonl([SPAWN_ROW, replay])), { task: 'T-4', subtask: 'main' })).toMatchObject({ attempt: 1 })
    expect(latestSpawnRow(parseLedger(jsonl([SPAWN_ROW])), { task: 'T-4', subtask: 'ui' })).toBeUndefined()
    expect(verdictAfter(parseLedger(jsonl([SPAWN_ROW])), row)).toBeUndefined()
    expect(verdictAfter(parseLedger(jsonl([SPAWN_ROW, VERDICT_ROW])), row)).toEqual({ verdict: 'consistent', next: 'accept' })
    // a reviewer's row is not the worker's verdict
    expect(verdictAfter(parseLedger(jsonl([SPAWN_ROW, { ...VERDICT_ROW, kind: 'review', verdict: 'reviewed' }])), row)).toBeUndefined()
    expect(fieldsOfRow(row)).toMatchObject({ key: 'toolu_01ABCDEFGH', task: 'T-4', attempt: 1, lineage: 1, briefPath: T4, agentId: 'agent-4' })
    const { toolUseId: _t, ...noTool } = SPAWN_ROW
    expect(fieldsOfRow(noTool as SpawnRow).key).toBe('ledger-T-4-main-1')
    const made = spawnRow({ task: 'T-4', subtask: 'main', attempt: 1, lineage: 1, budget: 3, tier: 'standard', alias: 'sonnet', purpose: 'build', at: NOW, agentId: 'agent-4' }, 'sess-1')
    expect(made).toEqual({ event: 'spawn', task: 'T-4', subtask: 'main', attempt: 1, lineage: 1, budget: 3, tier: 'standard', alias: 'sonnet', purpose: 'build', at: NOW, agentId: 'agent-4', sessionId: 'sess-1' })
    expect(withTail('row one\nclaim a', '(t)')).toBe('row one (t)\nclaim a')
    expect(withTail('row one', '(t)')).toBe('row one (t)')
  })

  test('/delegation, its owed list and the dashboard read the same with spawn rows on the ledger', { options: { ...GM } }, async ($, on) => {
    const git = repo()
    const w = world(on, { listAgents: true, panesUnplaced: 'no attached surface places panes', files: { [T4]: T4_HEADER + '\nbody' }, run: argv => (argv[0] === 'npx' ? { exitCode: 1, stdout: 'a/x.ts: not formatted\n' } : git(argv)), agentId: 'agent-4' })
    await $.session.start(sessionStart)
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${T4}.` }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT))
    const cmd = (args: string) => ({ command: 'delegation', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }) as never
    const status = String((await $.command.run(cmd(''))).text)
    const dash = String((await $.command.run(cmd('dashboard'))).text)
    expect(status).toContain('owed: T-4: resume agent=agent-4')
    // more spawn rows, as other sessions' spawns would leave them
    w.files.set(LEDGER, (w.files.get(LEDGER) ?? '') + jsonl([{ ...SPAWN_ROW, task: 'T-7', agentId: 'agent-7', toolUseId: 'toolu_07' }, SPAWN_2]))
    expect(String((await $.command.run(cmd(''))).text)).toBe(status)
    expect(String((await $.command.run(cmd('dashboard'))).text)).toBe(dash)
  })
})
