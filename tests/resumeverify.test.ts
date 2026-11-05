import { expect, describe } from 'claude-code/testing'
import { test } from './harness'
import { world, spawnInput, turnInput, commandInput, sessionStart, ROOT, type RunAnswer } from './harness'
import { VERDICT_TOOL_NAME } from '../hooks/lib/verdicttool'

// MOD-301: a worker resumed after a by-hand verify is judged on its hand-back (the exact MOD-299 sequence):
// spawn, hand-back refuted, `/dispatch T-4 --verify <sha>` refuted, SendMessage resume, hand-back at a new sha with a report.
const BRIEF = `${ROOT}/.delegation/briefs/T-4.brief.md`
const HEADER = '[[brief v=1 task=T-4 subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid=b/** gate=prettier budget=4-attempts report=chassis.report.v1]]'
const CARD_NAME = 'T-4-the-thing.md'
const CARD = '---\nid: T-4\ntitle: The thing\ndomain: frontend\ntier: standard\nstatus: queued\nscope: [a/**]\nforbid: [b/**]\ngate: prettier\nbudget: 4-attempts\n---\n## Why\nA card for the resume.\n'
const WT = `${ROOT}-T-4`
const MB = 'b'.repeat(40)
const BRANCH = 'agent/frontend/T-4'
const REPORT = (sha: string) => `[[report v=1 task=T-4 subtask=main branch=${BRANCH} pr=none sha=${sha} gate=pass files=a/x.ts]]`
const GM = { gateMap: '{"prettier":"npx prettier --check {files}"}' }
const SEND = { tool: 'SendMessage', to: 'agent-4', message: 'fix it' }
const resultText = (r: { result?: unknown; text?: string }) => (typeof r.result === 'string' ? r.result : r.text ?? '')

const records = (w: { store: Map<string, unknown> }) => (w.store.get(`delegation.tasks.T-4@${ROOT}`) ?? []) as Record<string, unknown>[]
const verdictRows = (w: { files: Map<string, string> }) =>
  (w.files.get(`${ROOT}/.delegation/ledger.jsonl`) ?? '').trim().split('\n').filter(Boolean).map(l => JSON.parse(l) as Record<string, unknown>).filter(r => typeof r.verdict === 'string')

type Gate = { v: number; head: string }
/** A worktree answered from memory: its head is `gate.head`, the gate is red (`gate.v`) or green. */
const repo = (gate: Gate, clock: { sleep: (ms: number) => Promise<void> }) => {
  return async (argv: string[]): Promise<RunAnswer | undefined> => {
    if (argv[0] === 'sleep') {
      await clock.sleep(Number(argv[1]) * 1000)
      return { exitCode: 0, stdout: '' }
    }
    if (argv[0] === 'npx') return { exitCode: gate.v, stdout: gate.v ? 'a/x.ts: not formatted\n' : '' }
    if (argv[0] !== 'git') return undefined
    const sub = argv.slice(3)
    const last = sub[sub.length - 1] ?? ''
    if (sub[0] === 'rev-parse' && sub[1] === '--abbrev-ref') return { exitCode: 0, stdout: `${BRANCH}\n` }
    if (sub[0] === 'rev-parse' && last.endsWith('^{commit}')) return { exitCode: 0, stdout: `${last.slice(0, -'^{commit}'.length).padEnd(40, '0')}\n` }
    if (sub[0] === 'rev-parse' && last === 'origin/main') return { exitCode: 0, stdout: `${MB}\n` }
    if (sub[0] === 'rev-parse') return { exitCode: 0, stdout: `${gate.head}\n` }
    if (sub[0] === 'worktree') return { exitCode: 0, stdout: `worktree ${WT}\nHEAD ${gate.head}\nbranch refs/heads/${BRANCH}\n\n` }
    if (sub[0] === 'merge-base' && sub[1] === '--is-ancestor') return { exitCode: last === 'origin/main' ? 1 : 0, stdout: '' }
    if (sub[0] === 'merge-base') return { exitCode: 0, stdout: `${MB}\n` }
    if (sub[0] === 'diff') return { exitCode: 0, stdout: sub.includes('--name-status') ? 'M\ta/x.ts\n' : 'a/x.ts\n' }
    if (sub[0] === 'log') return { exitCode: 0, stdout: `${'3'.repeat(40)}\n` }
    if (sub[0] === 'status') return { exitCode: 0, stdout: '' }
    return undefined
  }
}

const setup = (on: Parameters<typeof world>[0], gate: Gate) => {
  const slot: { sleep: (ms: number) => Promise<void> } = { sleep: async () => undefined }
  const w = world(on, {
    files: { [BRIEF]: HEADER + '\nbody', [`${ROOT}/agents/tasks/${CARD_NAME}`]: CARD },
    dirs: { [WT]: [], [`${ROOT}/agents/tasks`]: [CARD_NAME] },
    run: repo(gate, slot),
    agentId: 'agent-4',
  })
  slot.sleep = ms => w.clock.sleep(ms)
  return w
}

type Ctx = Parameters<Parameters<typeof test>[2]>[0]
/** Spawn, a refuted hand-back, a refuted by-hand verify, then the brain's SendMessage resume: attempt 3 is pending. */
const untilResumed = async ($: Ctx, gate: Gate) => {
  await $.session.start(sessionStart)
  await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.`, cwd: WT, tool_use_id: 'toolu_SPAWN001' }))
  await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT('1111111')))
  gate.head = '2222222'.padEnd(40, '0')
  const out = String((await $.command.run(commandInput('T-4 --verify 2222222'))).text)
  expect(out).toContain('no spawn — the verifier ran')
  expect(gate.v).toBe(1)
  await $.tool.call(SEND as never)
}

describe('MOD-301: a resume after a by-hand verify is verified on its hand-back', () => {
  test('spawn, refuted, verify refuted, SendMessage resume, hand-back at a new sha: attempt 3 gets a verdict row and the verdict tool returns it', { options: GM }, async ($, on) => {
    on('tool.call', { tool: 'SendMessage' }, async () => ({ result: 'queued' }))
    const gate = { v: 1, head: '1111111'.padEnd(40, '0') }
    const w = setup(on, gate)
    await untilResumed($, gate)
    expect(records(w).map(r => [r.attempt, r.kind, r.verdict])).toEqual([[1, 'spawn', 'refuted'], [2, 'verify', 'refuted'], [3, 'resume', 'pending']])
    // the hand-back names the first spawn's tool_use_id, as the host's Agent result would
    gate.head = '3333333'.padEnd(40, '0')
    await $.turn.complete(turnInput('agent-4', 'Fixed.\n' + REPORT('3333333')))
    expect(records(w).map(r => [r.attempt, r.kind, r.verdict])).toEqual([[1, 'spawn', 'refuted'], [2, 'verify', 'refuted'], [3, 'resume', 'refuted']])
    const rows = verdictRows(w).filter(r => r.attempt === 3)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ task: 'T-4', attempt: 3, verdict: 'refuted', sha: '3333333' })
    const text = resultText(await $.tool.call({ tool: VERDICT_TOOL_NAME, task: 'T-4' } as never))
    expect(text).toContain('T-4 attempt 3/4 refuted')
    expect(text).not.toContain('still verifying')
  })

  test('the first spawn record stays at attempt 1 judged; the resume hand-back lands on attempt 3, which a green gate accepts', { options: GM }, async ($, on) => {
    on('tool.call', { tool: 'SendMessage' }, async () => ({ result: 'queued' }))
    const gate = { v: 1, head: '1111111'.padEnd(40, '0') }
    const w = setup(on, gate)
    await untilResumed($, gate)
    gate.v = 0
    gate.head = '4444444'.padEnd(40, '0')
    await $.turn.complete(turnInput('agent-4', 'Fixed.\n' + REPORT('4444444')))
    expect(records(w).at(-1)).toMatchObject({ attempt: 3, kind: 'resume', verdict: 'consistent' })
    expect(verdictRows(w).filter(r => r.attempt === 3).map(r => r.verdict)).toEqual(['consistent'])
    expect(records(w)).toHaveLength(3)
  })

  test('the agent pointer left on the first spawn record: resumedIfNew still judges the hand-back as the pending resume, no fourth attempt', { options: GM }, async ($, on) => {
    on('tool.call', { tool: 'SendMessage' }, async () => ({ result: 'queued' }))
    const gate = { v: 1, head: '1111111'.padEnd(40, '0') }
    const w = setup(on, gate)
    await untilResumed($, gate)
    // a record written before the pointer followed the resume: the hand-back is matched by attempt 1, judged
    w.store.set('delegation.agent.agent-4', 'toolu_SPAWN001')
    gate.head = '5555555'.padEnd(40, '0')
    await $.turn.complete(turnInput('agent-4', 'Fixed.\n' + REPORT('5555555')))
    expect(records(w).map(r => [r.attempt, r.kind, r.verdict])).toEqual([[1, 'spawn', 'refuted'], [2, 'verify', 'refuted'], [3, 'resume', 'refuted']])
    expect(verdictRows(w).filter(r => r.attempt === 3)).toHaveLength(1)
  })

  test('a pending resume attempt with no verifier running: the verdict tool says so, with the worktree head to verify', { options: { ...GM, verdictVerbosity: 'full' } }, async ($, on) => {
    on('tool.call', { tool: 'SendMessage' }, async () => ({ result: 'queued' }))
    const gate = { v: 1, head: '1111111'.padEnd(40, '0') }
    const w = setup(on, gate)
    await untilResumed($, gate)
    expect(records(w).at(-1)).toMatchObject({ attempt: 3, verdict: 'pending' })
    const waiting = $.tool.call({ tool: VERDICT_TOOL_NAME, task: 'T-4' } as never)
    for (let i = 0; i < 3; i++) await w.clock.advance(1000)
    expect(resultText(await waiting)).toBe(`T-4: attempt 3 pending, no verifier running; dispatch verify=${'2222222'.padEnd(40, '0')}`)
    // seen idle, a second apart, twice: one `sleep 1` between the looks, then the line
    expect(w.runs.filter(r => r.argv[0] === 'sleep').map(r => r.argv)).toEqual([['sleep', '1']])
  })

  test('a pending attempt whose worker is still running is waited on, not reported as having no verifier', { options: { ...GM } }, async ($, on) => {
    on('tool.call', { tool: 'SendMessage' }, async () => ({ result: 'queued' }))
    const gate = { v: 1, head: '1111111'.padEnd(40, '0') }
    const w = world(on, {
      files: { [BRIEF]: HEADER + '\nbody', [`${ROOT}/agents/tasks/${CARD_NAME}`]: CARD },
      dirs: { [WT]: [], [`${ROOT}/agents/tasks`]: [CARD_NAME] },
      run: async argv => (argv[0] === 'sleep' ? { exitCode: 0, stdout: '' } : repo(gate, { sleep: async () => undefined })(argv)),
      agentId: 'agent-4',
      listAgents: true,
    })
    await $.session.start(sessionStart)
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.`, cwd: WT }))
    const waiting = $.tool.call({ tool: VERDICT_TOOL_NAME, task: 'T-4', waitSeconds: 5 } as never)
    expect(resultText(await waiting)).toBe('T-4: still verifying after 5s; call verdict again')
    expect(w.agents.map(a => a.status)).toEqual(['running'])
  })
})
