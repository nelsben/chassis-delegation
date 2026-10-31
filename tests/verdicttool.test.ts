import { test, expect, describe } from 'claude-code/testing'
import { world, spawnInput, turnInput, composeInput, sessionStart, ROOT, SCRATCH, type RunAnswer } from './harness'
import { FIXTURE_CARD, FIXTURE_CARD_NAME } from './fixtures/sample-card'
import { openItemLines } from '../hooks/lib/dashboard'
import { parseVerdictTool, VERDICT_TOOL, VERDICT_TOOL_NAME } from '../hooks/lib/verdicttool'

// MOD-64: wakes are off by default; in the hand-back turn the brain waits for its verdict with the verdict tool.
const TOOL = VERDICT_TOOL_NAME
const BRIEF = `${SCRATCH}/briefs/T-4.brief.md`
const HEADER = '[[brief v=1 task=T-4 subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid=b/** gate=prettier budget=3-attempts report=chassis.report.v1]]'
const REPORT = '[[report v=1 task=T-4 subtask=main branch=agent/frontend/T-4 pr=none sha=1234abcd gate=pass files=a/x.ts]]'
const GM = { gateMap: '{"prettier":"npx prettier --check {files}"}' }
const MB = 'b'.repeat(40)
const resultText = (r: { result?: unknown; text?: string }) => (typeof r.result === 'string' ? r.result : r.text ?? '')

/** A worker repo answered from memory; `gateMs` is how long the gate takes on the test clock. */
let sleepFails = false
const repo = (clock: { sleep: (ms: number) => Promise<void> }, gateMs = 0) => {
  let head = ''
  return async (argv: string[]): Promise<RunAnswer | undefined> => {
    // MOD-72: the verdict tool's waits are `sleep` processes; on the test clock one takes its seconds
    if (argv[0] === 'sleep') {
      if (sleepFails) return { exitCode: 127, stdout: '' }
      await clock.sleep(Number(argv[1]) * 1000)
      return { exitCode: 0, stdout: '' }
    }
    if (argv[0] === 'npx') {
      if (gateMs > 0) await clock.sleep(gateMs)
      return { exitCode: 0, stdout: '' }
    }
    if (argv[0] !== 'git') return undefined
    const sub = argv.slice(3)
    const last = sub[sub.length - 1] ?? ''
    if (sub[0] === 'rev-parse' && last.endsWith('^{commit}')) {
      head = last.slice(0, -'^{commit}'.length).padEnd(40, '0')
      return { exitCode: 0, stdout: `${head}\n` }
    }
    if (sub[0] === 'rev-parse' && sub[1] === '--verify') return { exitCode: 0, stdout: `${last === 'origin/main' ? MB : head}\n` }
    if (sub[0] === 'rev-parse' && last === 'HEAD' && sub[1] !== '--abbrev-ref') return { exitCode: 0, stdout: `${head}\n` }
    if (sub[0] === 'merge-base' && sub[1] === '--is-ancestor') return { exitCode: last === 'origin/main' ? 1 : 0, stdout: '' }
    if (sub[0] === 'merge-base') return { exitCode: 0, stdout: `${MB}\n` }
    if (sub[0] === 'diff') return { exitCode: 0, stdout: 'A\ta/x.ts\n' }
    return undefined
  }
}
const setup = (on: any, gateMs = 0, extra: Record<string, unknown> = {}) => {
  sleepFails = false
  const slot: { sleep: (ms: number) => Promise<void> } = { sleep: async () => undefined }
  const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: repo(slot, gateMs), agentId: 'agent-4', ...extra })
  slot.sleep = ms => w.clock.sleep(ms)
  return w
}
const call = ($: any, input: Record<string, unknown>) => $.tool.call({ tool: TOOL, ...input } as never)

describe('MOD-64: the verdict tool', () => {
  test('its spec and input', () => {
    expect(VERDICT_TOOL.name).toBe('verdict')
    expect(TOOL).toBe('mcp__chassis-delegation__verdict')
    expect(parseVerdictTool({ task: 'T-4' })).toEqual({ task: 'T-4', subtask: 'main', waitSeconds: 600 })
    expect(parseVerdictTool({ task: 'T-4', subtask: 'ui', waitSeconds: 30 })).toEqual({ task: 'T-4', subtask: 'ui', waitSeconds: 30 })
    expect(parseVerdictTool({ task: 'T-4', waitSeconds: 5000 })).toEqual({ task: 'T-4', subtask: 'main', waitSeconds: 900 })
    expect(parseVerdictTool({})).toEqual({ error: 'verdict: task is required (a task id such as BE-101)' })
    expect(parseVerdictTool({ task: 'T-4', waitSeconds: 'soon' })).toEqual({ error: 'verdict: waitSeconds must be a number' })
  })

  test('is registered at session.start beside dispatch and card', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const w = world(on, { files: { [`${ROOT}/agents/tasks/${FIXTURE_CARD_NAME}`]: FIXTURE_CARD }, dirs: { [`${ROOT}/agents/tasks`]: [FIXTURE_CARD_NAME] } })
    await $.session.start(sessionStart)
    expect(w.tools).toContain('verdict')
    expect(w.tools.indexOf('verdict')).toBeLessThan(w.tools.indexOf('card'))
  })

  test('already judged: it returns at once with the verdict row exactly as posted', { options: { ...GM } }, async ($, on) => {
    const w = setup(on)
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT))
    const posted = w.appended.map(a => a.text).find(t => t.includes('T-4 attempt 1/3 consistent'))
    expect(posted).toBeDefined()
    expect(resultText(await call($, { task: 'T-4' }))).toBe(posted as string)
    expect(w.submitted).toEqual([])
  })

  test('called while the verifier is still running: it returns the verdict when it lands', { options: { ...GM } }, async ($, on) => {
    const w = setup(on, 12_000)
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    const done = $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT))
    const waiting = call($, { task: 'T-4' })
    let settled = false
    void waiting.then(() => (settled = true))
    for (let i = 0; i < 2; i++) await w.clock.advance(5000)
    expect(settled).toBe(false)
    for (let i = 0; i < 2; i++) await w.clock.advance(5000)
    await done
    const text = resultText(await waiting)
    expect(text).toContain('chassis-delegation: T-4 attempt 1/3 consistent')
    expect(text).toBe(w.appended.map(a => a.text).find(t => t.includes('consistent')))
  })

  test('still verifying at the timeout: the line says call it again', { options: { ...GM } }, async ($, on) => {
    const w = setup(on)
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    const waiting = call($, { task: 'T-4', waitSeconds: 10 })
    for (let i = 0; i < 3; i++) await w.clock.advance(5000)
    expect(resultText(await waiting)).toBe('T-4: still verifying after 10s; call verdict again')
  })

  test('MOD-72: the waits are sleep processes, never a $.clock.sleep (the host counts that against the hook budget)', { options: { ...GM } }, async ($, on) => {
    const w = setup(on, 12_000)
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    const done = $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT))
    const waiting = call($, { task: 'T-4' })
    for (let i = 0; i < 4; i++) await w.clock.advance(5000)
    await done
    const text = resultText(await waiting)
    expect(text).toContain('chassis-delegation: T-4 attempt 1/3 consistent')
    expect(w.clockSleeps.filter(ms => ms >= 5000)).toEqual([])
    const sleeps = w.runs.filter(r => r.argv[0] === 'sleep')
    expect(sleeps.length).toBeGreaterThanOrEqual(2)
    expect(sleeps[0]?.argv).toEqual(['sleep', '5'])
  })

  test('MOD-72: a sleep that cannot start answers still-verifying at once', { options: { ...GM } }, async ($, on) => {
    const w = setup(on)
    sleepFails = true
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    expect(resultText(await call($, { task: 'T-4' }))).toBe('T-4: still verifying after 600s; call verdict again')
    expect(w.runs.filter(r => r.argv[0] === 'sleep')).toHaveLength(1)
  })

  test('an unknown task says so', { options: { ...GM } }, async ($, on) => {
    setup(on)
    expect(resultText(await call($, { task: 'T-77' }))).toContain('T-77: no attempt recorded')
  })

  test('a verdict posted before the upgrade (posted set, no postedRow, judged long ago) comes back at once, with no clock advance', { options: { ...GM } }, async ($, on) => {
    const w = setup(on)
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT))
    for (const k of [...w.store.keys()]) if (k.startsWith('delegation.postedRow.')) w.store.delete(k)
    expect([...w.store.keys()].some(k => k.startsWith('delegation.posted.'))).toBe(true)
    const recs = w.store.get(`delegation.tasks.T-4@${ROOT}`) as Record<string, unknown>[]
    w.store.set(`delegation.tasks.T-4@${ROOT}`, recs.map(r => ({ ...r, verdictAt: 1 })))
    const text = resultText(await call($, { task: 'T-4' }))
    expect(text).toContain('chassis-delegation: T-4 attempt 1/3 consistent')
  })

  test('with wakes off the ready: line posted beside the verdict comes back with it', { options: { ...GM, briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const other = '[[brief v=1 task=T-5 subtask=main purpose=build tier=standard]]\nDo it.'
    const queued = '[[brief v=1 task=T-9 subtask=main purpose=build tier=standard]]\nDo it.'
    const slot = { sleep: async (_ms: number) => undefined }
    const w = world(on, { listAgents: true, files: { [BRIEF]: HEADER + '\nbody' }, run: repo(slot) })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.`, tool_use_id: 'toolu_A0000001' }))
    await $.agent.spawn(spawnInput({ prompt: other, tool_use_id: 'toolu_B0000002' }))
    await $.agent.spawn(spawnInput({ prompt: queued, tool_use_id: 'toolu_C0000009' }))
    await $.turn.complete(turnInput('agent-1', 'Done.\n' + REPORT))
    const text = resultText(await call($, { task: 'T-4' }))
    expect(text).toContain('T-4 attempt 1/3 consistent')
    expect(text).toContain('ready: T-9')
    expect(w.submitted).toEqual([])
  })
})

describe('MOD-64: the brain is told to use the verdict tool when wakes are off', () => {
  const files = { [`${ROOT}/agents/tasks/${FIXTURE_CARD_NAME}`]: FIXTURE_CARD }
  const dirs = { [`${ROOT}/agents/tasks`]: [FIXTURE_CARD_NAME] }
  const dispatch = ($: any) => $.tool.call({ tool: 'mcp__chassis-delegation__dispatch', task: 'BE-101', scope: 'app/**' } as never)
  const RULE = 'call the verdict tool with task=BE-101 in that turn, before ending it'

  test('the dispatch text under the spawn block carries the rule with wakes off, and not with wakes on', async ($, on) => {
    world(on, { files, dirs, run: () => undefined, store: { 'delegation.agentTypes': ['general-purpose', 'backend', 'frontend'] } })
    await $.session.start(sessionStart)
    const text = resultText(await dispatch($))
    expect(text).toContain(RULE)
    expect(text.indexOf(RULE)).toBeGreaterThan(text.indexOf('The worker starts when you make this Agent call'))
  })

  test('with wakes on the dispatch text does not name the verdict tool', { options: { briefDir: `${SCRATCH}/briefs`, wakeOnVerdict: true } }, async ($, on) => {
    world(on, { files, dirs, run: () => undefined, store: { 'delegation.agentTypes': ['general-purpose', 'backend', 'frontend'] } })
    await $.session.start(sessionStart)
    expect(resultText(await dispatch($))).not.toContain('verdict tool')
  })

  const posture = async ($: any) => String((await $.prompt.compose(composeInput(['Agent']))).sections.find((s: { id: string }) => s.id === 'chassis-delegation:state')?.text ?? '')

  test('the state section carries one posture line while a worker runs, with wakes off', { options: { ...GM } }, async ($, on) => {
    setup(on, 0, { listAgents: true })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    const lines = (await posture($)).split('\n').filter(l => l.includes('verdict tool'))
    expect(lines).toHaveLength(1)
  })

  test('with wakes on the state section does not name the verdict tool', { options: { ...GM, wakeOnVerdict: true } }, async ($, on) => {
    setup(on, 0, { listAgents: true })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    expect(await posture($)).not.toContain('verdict tool')
  })

  test('the dashboard says call the verdict tool when wakes are off, and the verdict lands on its own when on', async () => {
    const item = { kind: 'running', task: 'BE-1', tier: 'frontier', alias: 'opus', at: 0, phase: 'verifying' } as never
    expect(openItemLines([item], 65_000, true)).toEqual(['BE-1: verifying frontier/opus 01:05 — call the verdict tool with task=BE-1'])
    expect(openItemLines([item], 65_000, false)).toEqual(['BE-1: verifying frontier/opus 01:05 — the verdict lands on its own'])
  })
})

// MOD-200: a started attempt and a verdict are said on the card's issue.
describe('MOD-200: status comments on the card issue', () => {
  const CARD_DIR = `${ROOT}/agents/tasks`
  const card = (extra: string) => ['---', 'id: T-4', 'title: A task', 'domain: frontend', 'tier: standard', 'status: queued', 'scope: [a/**]', 'gate: prettier', ...(extra ? [extra] : []), '---', '## Done when', '', '- It works.', ''].join('\n')
  const origin = `[remote "origin"]\n\turl = https://github.com/o/r.git\n`
  const STARTED = `${ROOT}/.delegation/status/T-4-attempt-1-started.md`
  const VERDICT = `${ROOT}/.delegation/status/T-4-attempt-1-verdict.md`
  const ghComments = (w: { runs: { argv: string[] }[] }) => w.runs.map(r => r.argv).filter(a => a[0] === 'gh')
  const boot = (on: any, extra: string, gh: (argv: string[]) => RunAnswer | undefined = () => undefined) => {
    const slot: { sleep: (ms: number) => Promise<void> } = { sleep: async () => undefined }
    const inner = repo(slot, 0)
    const w = world(on, {
      files: { [BRIEF]: HEADER + '\nbody', [`${CARD_DIR}/T-4-x.md`]: card(extra), [`${ROOT}/.git/config`]: origin },
      dirs: { [CARD_DIR]: ['T-4-x.md'] },
      run: async argv => (argv[0] === 'gh' ? gh(argv) ?? { exitCode: 0, stdout: '' } : inner(argv)),
      agentId: 'agent-4',
    })
    slot.sleep = ms => w.clock.sleep(ms)
    return w
  }

  test('a started attempt comments on the issue, and the verdict does too, once', { options: { ...GM } }, async ($, on) => {
    const w = boot(on, 'issue: 77')
    await $.session.start(sessionStart)
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    expect(w.files.get(STARTED)).toContain('attempt 1/3 started · standard')
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT))
    const row = resultText(await call($, { task: 'T-4' }))
    await call($, { task: 'T-4' })
    expect(w.files.get(VERDICT)).toContain('T-4 attempt 1/3 consistent')
    expect(ghComments(w)).toEqual([
      ['gh', 'issue', 'comment', '77', '--repo', 'o/r', '--body-file', STARTED],
      ['gh', 'issue', 'comment', '77', '--repo', 'o/r', '--body-file', VERDICT],
    ])
    expect(row).toContain('consistent')
  })

  for (const value of ['#77', 'https://github.com/o/r/issues/77']) {
    test(`MOD-216: issue: ${value} gets the status comment`, { options: { ...GM } }, async ($, on) => {
      const w = boot(on, `issue: ${value}`)
      await $.session.start(sessionStart)
      await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
      expect(ghComments(w)).toEqual([['gh', 'issue', 'comment', '77', '--repo', 'o/r', '--body-file', STARTED]])
    })
  }

  for (const value of ['https://github.com/x/y/issues/77', 'abc']) {
    test(`MOD-216: issue: ${value} (another repo, or junk) gets no comment`, { options: { ...GM } }, async ($, on) => {
      const w = boot(on, `issue: ${value}`)
      await $.session.start(sessionStart)
      await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
      expect(ghComments(w)).toEqual([])
    })
  }

  test('MOD-204: a verdict comment already posted in an earlier process is not posted again; a posted line is appended after a comment', { options: { ...GM } }, async ($, on) => {
    const w = boot(on, 'issue: 77')
    await $.session.start(sessionStart)
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT))
    await call($, { task: 'T-4' })
    expect(ghComments(w).length).toBe(2)
    expect((w.files.get(STARTED) ?? '').trimEnd().split('\n').pop()).toMatch(/^posted: \d{4}-\d\d-\d\dT/)
    expect((w.files.get(VERDICT) ?? '').trimEnd().split('\n').pop()).toMatch(/^posted: \d{4}-\d\d-\d\dT/)
  })

  test('MOD-204: after a reload (fresh memory, same files) the verdict and started comments are not re-posted', { options: { ...GM } }, async ($, on) => {
    const w = boot(on, 'issue: 77')
    const stamp = 'posted: 2026-10-30T00:00:00.000Z'
    w.files.set(STARTED, `old started\n${stamp}\n`)
    w.files.set(VERDICT, `old verdict\n${stamp}\n`)
    await $.session.start(sessionStart)
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT))
    await call($, { task: 'T-4' })
    expect(ghComments(w)).toEqual([])
    expect(w.files.get(VERDICT)).toBe(`old verdict\n${stamp}\n`)
  })

  test('no issue on the card: nothing is written and no gh runs', { options: { ...GM } }, async ($, on) => {
    const w = boot(on, '')
    await $.session.start(sessionStart)
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT))
    await call($, { task: 'T-4' })
    expect(ghComments(w)).toEqual([])
    expect(w.files.has(STARTED)).toBe(false)
    expect(w.files.has(VERDICT)).toBe(false)
  })

  test('a failed comment adds one status line to the verdict result and is not retried', { options: { ...GM } }, async ($, on) => {
    const w = boot(on, 'issue: 77', () => ({ exitCode: 1, stdout: '', stderr: 'HTTP 502' }))
    await $.session.start(sessionStart)
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT))
    const out = resultText(await call($, { task: 'T-4' }))
    expect(out).toContain('status: comment on #77 failed: HTTP 502')
    expect(out.match(/status: comment on #77 failed/g)?.length).toBe(2)
    expect(ghComments(w).length).toBe(2)
    const again = resultText(await call($, { task: 'T-4' }))
    expect(ghComments(w).length).toBe(2)
    expect(again).not.toContain('status:')
  })
})
